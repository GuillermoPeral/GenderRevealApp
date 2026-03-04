const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "responses.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gender2026";
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

async function ensureDataStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(DATA_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(DATA_FILE, "[]", "utf8");
  }
}

async function readResponses() {
  await ensureDataStore();
  const data = await fsp.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeResponses(responses) {
  await ensureDataStore();
  await fsp.writeFile(DATA_FILE, JSON.stringify(responses, null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function escapeCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function responsesToCsv(rows) {
  const headers = [
    "id",
    "submittedAt",
    "fullName",
    "attendance",
    "guestsWithYou",
    "email",
    "message",
    "prediction",
    "weightGuess",
    "birthDateGuess",
    "nameGuess",
  ];
  const csvRows = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    csvRows.push(
      [
        row.id,
        row.submittedAt,
        row.fullName,
        row.attendance,
        row.guestsWithYou,
        row.email,
        row.message,
        row.prediction,
        row.weightGuess,
        row.birthDateGuess,
        row.nameGuess,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  return csvRows.join("\n");
}

function computeStats(responses) {
  const attendingCount = responses.reduce((sum, row) => {
    if (row.attendance !== "yes") return sum;
    return sum + 1 + (Number.isFinite(row.guestsWithYou) ? row.guestsWithYou : 0);
  }, 0);

  const prediction = responses.reduce(
    (acc, row) => {
      if (row.prediction === "boy") acc.boy += 1;
      if (row.prediction === "girl") acc.girl += 1;
      return acc;
    },
    { boy: 0, girl: 0 }
  );

  return {
    totalResponses: responses.length,
    totalGuestsAttending: attendingCount,
    prediction,
  };
}

function validateRsvp(payload) {
  const errors = [];
  if (!payload.fullName || typeof payload.fullName !== "string" || payload.fullName.trim().length < 2) {
    errors.push("Full name is required.");
  }

  const attendance = String(payload.attendance || "").toLowerCase();
  if (!["yes", "no", "maybe"].includes(attendance)) {
    errors.push("Attendance must be Yes, No, or Maybe.");
  }

  const guestsWithYou = Number.parseInt(payload.guestsWithYou, 10);
  if (Number.isNaN(guestsWithYou) || guestsWithYou < 0 || guestsWithYou > 20) {
    errors.push("Number of guests must be between 0 and 20.");
  }

  const prediction = String(payload.prediction || "").toLowerCase();
  if (!["boy", "girl"].includes(prediction)) {
    errors.push("Prediction must be Boy or Girl.");
  }

  const birthDateGuess = String(payload.birthDateGuess || "");
  if (!birthDateGuess) {
    errors.push("Baby birth date guess is required.");
  }

  return {
    errors,
    cleaned: {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      submittedAt: new Date().toISOString(),
      fullName: String(payload.fullName || "").trim(),
      attendance,
      guestsWithYou: Number.isNaN(guestsWithYou) ? 0 : guestsWithYou,
      email: String(payload.email || "").trim(),
      message: String(payload.message || "").trim(),
      prediction,
      weightGuess: String(payload.weightGuess || "").trim(),
      birthDateGuess,
      nameGuess: String(payload.nameGuess || "").trim(),
    },
  };
}

function cleanupExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions.entries()) {
    if (expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function createAdminSession() {
  cleanupExpiredAdminSessions();
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  adminSessions.set(token, expiresAt);
  return { token, expiresAt };
}

function getAdminToken(req, reqUrl) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  const headerToken = req.headers["x-admin-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }
  const queryToken = reqUrl.searchParams.get("token");
  if (queryToken && queryToken.trim()) {
    return queryToken.trim();
  }
  return "";
}

function isAdminAuthenticated(req, reqUrl) {
  cleanupExpiredAdminSessions();
  const token = getAdminToken(req, reqUrl);
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

async function serveFile(reqPath, res) {
  const normalized = reqPath === "/" ? "/index.html" : reqPath;
  const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const absPath = path.join(PUBLIC_DIR, safePath);

  if (!absPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(absPath);
    if (stat.isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(absPath).pipe(res);
  } catch {
    if (reqPath === "/admin") {
      return serveFile("/index.html", res);
    }
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = reqUrl.pathname;

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const payload = await parseBody(req);
      const password = String(payload.password || "");
      if (password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: "Invalid admin password" });
      }
      const session = createAdminSession();
      return sendJson(res, 200, {
        ok: true,
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    }

    if (req.method === "GET" && pathname === "/api/admin/verify") {
      return sendJson(res, 200, { ok: isAdminAuthenticated(req, reqUrl) });
    }

    if (req.method === "GET" && pathname === "/api/responses") {
      if (!isAdminAuthenticated(req, reqUrl)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const responses = await readResponses();
      return sendJson(res, 200, { responses, stats: computeStats(responses) });
    }

    if (req.method === "GET" && pathname === "/api/stats") {
      if (!isAdminAuthenticated(req, reqUrl)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const responses = await readResponses();
      return sendJson(res, 200, computeStats(responses));
    }

    if (req.method === "GET" && pathname === "/api/export.csv") {
      if (!isAdminAuthenticated(req, reqUrl)) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Unauthorized");
      }
      const responses = await readResponses();
      const csv = responsesToCsv(responses);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rsvp-responses.csv"',
      });
      return res.end(csv);
    }

    if (req.method === "POST" && pathname === "/api/rsvp") {
      const payload = await parseBody(req);
      const { errors, cleaned } = validateRsvp(payload);
      if (errors.length) {
        return sendJson(res, 400, { errors });
      }
      const responses = await readResponses();
      responses.push(cleaned);
      await writeResponses(responses);
      return sendJson(res, 201, { ok: true, response: cleaned });
    }

    if (req.method === "GET") {
      return serveFile(pathname, res);
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    sendJson(res, 500, {
      error: "Internal server error",
      details: error && error.message ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gender Reveal RSVP app running at http://${HOST}:${PORT}`);
});

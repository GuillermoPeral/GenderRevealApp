const rsvpNowBtn = document.getElementById("rsvpNowBtn");
const adminBtn = document.getElementById("adminBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const formSection = document.getElementById("formSection");
const adminSection = document.getElementById("adminSection");
const adminLoginSection = document.getElementById("adminLoginSection");
const confirmationSection = document.getElementById("confirmationSection");
const form = document.getElementById("rsvpForm");
const adminLoginForm = document.getElementById("adminLoginForm");
const formStatus = document.getElementById("formStatus");
const adminAuthStatus = document.getElementById("adminAuthStatus");
const countdownText = document.getElementById("countdownText");
const exportCsvLink = document.getElementById("exportCsvLink");
const confirmationText = document.getElementById("confirmationText");
const attendanceSummary = document.getElementById("attendanceSummary");

const responsesBody = document.getElementById("responsesBody");
const totalResponses = document.getElementById("totalResponses");
const totalGuests = document.getElementById("totalGuests");
const predictionPie = document.getElementById("predictionPie");
const predictionLegend = document.getElementById("predictionLegend");

const REVEAL_DATE = new Date("2026-04-05T16:00:00");
const ADMIN_TOKEN_STORAGE_KEY = "gender_reveal_admin_token";

function updateCountdown() {
  const now = new Date();
  const diff = REVEAL_DATE - now;
  if (diff <= 0) {
    countdownText.textContent = "Hoy es el gran dia. A celebrar.";
    return;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  countdownText.textContent = `Faltan ${days} dias, ${hours} horas y ${mins} minutos`;
}

function smoothScrollToForm() {
  formSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAdmin() {
  ensureAdminAccess();
}

function confettiBurst() {
  const colors = ["#ffd8e8", "#d8efff", "#fff4c8", "#d7f7ea", "#b2ddff"];
  for (let i = 0; i < 120; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    piece.style.animationDuration = `${1200 + Math.random() * 1400}ms`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

function attendanceLabel(value) {
  const map = { yes: "Si", no: "No", maybe: "Tal vez" };
  return map[value] || value;
}

function predictionLabel(value) {
  const map = { boy: "Nino", girl: "Nina" };
  return map[value] || value;
}

function updatePieChart(prediction) {
  const boy = prediction.boy || 0;
  const girl = prediction.girl || 0;
  const total = boy + girl;
  const boyAngle = total === 0 ? 180 : (boy / total) * 360;
  predictionPie.style.background = `conic-gradient(#95d7ff 0deg ${boyAngle}deg, #ffc9de ${boyAngle}deg 360deg)`;
  predictionLegend.textContent = `Nino: ${boy} | Nina: ${girl}`;
}

function renderResponses(rows) {
  if (!rows.length) {
    responsesBody.innerHTML = `<tr class="empty-row"><td colspan="6">Aun no hay respuestas.</td></tr>`;
    return;
  }
  responsesBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td data-label="Nombre">${escapeHtml(row.fullName)}</td>
          <td data-label="Asistencia">${attendanceLabel(row.attendance)}</td>
          <td data-label="Invitados">${row.guestsWithYou}</td>
          <td data-label="Prediccion">${predictionLabel(row.prediction)}</td>
          <td data-label="Fecha estimada">${escapeHtml(row.birthDateGuess)}</td>
          <td data-label="Mensaje">${escapeHtml(row.message || "-")}</td>
        </tr>
      `
    )
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadAdminData() {
  try {
    const token = getAdminToken();
    const res = await fetch("/api/responses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAdminSession();
        showAdminLogin("Tu sesion expiro. Ingresa de nuevo.");
        return;
      }
      throw new Error("No se pudieron cargar las respuestas");
    }
    const data = await res.json();
    totalResponses.textContent = data.stats.totalResponses;
    totalGuests.textContent = data.stats.totalGuestsAttending;
    updatePieChart(data.stats.prediction);
    renderResponses(data.responses);
    attendanceSummary.textContent = `Hasta ahora nos acompanaran ${data.stats.totalGuestsAttending} persona(s). Gracias por su carino.`;
    exportCsvLink.href = `/api/export.csv?token=${encodeURIComponent(token)}`;
  } catch (error) {
    attendanceSummary.textContent = "No pudimos cargar el resumen por ahora.";
    responsesBody.innerHTML = `<tr class="empty-row"><td colspan="6">Error al cargar las respuestas.</td></tr>`;
  }
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
}

function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

function showAdminLogin(message = "") {
  adminSection.classList.add("hidden");
  adminLoginSection.classList.remove("hidden");
  if (message) {
    adminAuthStatus.textContent = message;
  } else {
    adminAuthStatus.textContent = "";
  }
  adminLoginSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAdminPanel() {
  adminLoginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
  adminSection.scrollIntoView({ behavior: "smooth", block: "start" });
  loadAdminData();
}

async function ensureAdminAccess() {
  const token = getAdminToken();
  if (!token) {
    showAdminLogin();
    return;
  }
  try {
    const res = await fetch("/api/admin/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      clearAdminSession();
      showAdminLogin("Necesitas autenticarte para entrar al panel.");
      return;
    }
    showAdminPanel();
  } catch {
    showAdminLogin("No se pudo validar tu sesion.");
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();
  adminAuthStatus.textContent = "Revisando clave...";
  const formData = new FormData(adminLoginForm);
  const password = String(formData.get("adminPassword") || "");
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.token) {
      throw new Error("Clave incorrecta. Intenta otra vez.");
    }
    setAdminToken(data.token);
    adminLoginForm.reset();
    adminAuthStatus.textContent = "";
    showAdminPanel();
  } catch (error) {
    adminAuthStatus.textContent = error.message || "No se pudo iniciar sesion.";
  }
}

function logoutAdmin() {
  clearAdminSession();
  showAdminLogin("Sesion cerrada.");
}

async function submitRsvp(event) {
  event.preventDefault();
  formStatus.textContent = "Enviando tu RSVP...";
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const guestName = String(payload.fullName || "").trim();
  payload.guestsWithYou = Number.parseInt(payload.guestsWithYou || "0", 10);

  try {
    const res = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const errors = data.errors ? data.errors.join(" ") : "No se pudo enviar tu RSVP.";
      throw new Error(errors);
    }
    form.reset();
    formStatus.textContent = "";
    confirmationSection.classList.remove("hidden");
    confirmationText.textContent = guestName
      ? `Gracias, ${guestName}. Nos dara muchisimo gusto celebrar contigo.`
      : "Gracias. Nos dara muchisimo gusto celebrar contigo.";
    confirmationSection.scrollIntoView({ behavior: "smooth", block: "center" });
    confettiBurst();
    loadAdminData();
  } catch (error) {
    formStatus.textContent = error.message || "No se pudo enviar tu RSVP.";
  }
}

rsvpNowBtn.addEventListener("click", smoothScrollToForm);
adminBtn.addEventListener("click", showAdmin);
refreshBtn.addEventListener("click", loadAdminData);
logoutBtn.addEventListener("click", logoutAdmin);
form.addEventListener("submit", submitRsvp);
adminLoginForm.addEventListener("submit", submitAdminLogin);

updateCountdown();
setInterval(updateCountdown, 30000);

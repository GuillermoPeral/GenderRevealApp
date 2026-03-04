# App de Confirmación para Revelación de Género

Aplicación web simple de confirmación de asistencia con formulario para invitados y panel de administración.

## Ejecutar

```bash
# Opcional: personaliza la contraseña de administración
# export ADMIN_PASSWORD="tu-password-seguro"

node server.js
```

Abre:

- `http://127.0.0.1:3000` para la confirmación de invitados
- `http://127.0.0.1:3000/admin` (o usa el botón de Vista de administración) para la vista administrativa

Contraseña de admin por defecto (si no configuras `ADMIN_PASSWORD`): `gender2026`

## Deploy en Render (rapido)

1. Sube este proyecto a un repositorio en GitHub.
2. Entra a [Render](https://render.com) y haz clic en `New +` -> `Blueprint`.
3. Selecciona tu repositorio. Render detectara `render.yaml`.
4. En variables de entorno, define `ADMIN_PASSWORD` con tu clave real.
5. Crea el servicio y espera el primer deploy.
6. Abre la URL publica que te da Render y prueba el RSVP.

Notas:
- Esta app guarda datos en `data/responses.json`. En hosting gratuito, ese almacenamiento puede no ser permanente.
- Para produccion real conviene mover respuestas a una base de datos.

## Funcionalidades incluidas

- Pantalla de bienvenida y formulario de confirmación
- Preguntas de predicción (niño/niña, peso, fecha de nacimiento, nombre)
- Mensaje de confirmación después del envío
- Persistencia en JSON en `data/responses.json`
- Lista de respuestas para administración
- Total de invitados asistentes
- Gráfico circular de predicciones niño vs niña
- Exportación CSV mediante `/api/export.csv`
- Cuenta regresiva para la fecha de revelación
- Animación de confeti tras una confirmación exitosa

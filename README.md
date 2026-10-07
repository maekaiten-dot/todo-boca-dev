# TODO BOCA - App de Ventas

App de ventas para React + Google Sheets API.

## Setup inicial (una sola vez)

### 1. Instalá dependencias
```bash
npm install
```

### 2. Configurá las credenciales
Copiá el archivo de ejemplo y completalo con tus datos reales:
```bash
cp .env.example .env
```

Abrí `.env` y completá:
- `VITE_SHEET_ID` → ya está configurado con el sheet DEV
- `VITE_GOOGLE_CLIENT_EMAIL` → el campo `client_email` de tu JSON de credenciales
- `VITE_GOOGLE_PRIVATE_KEY` → el campo `private_key` de tu JSON (entre comillas dobles, con los \n literales)

### 3. Corré en modo desarrollo
```bash
npm run dev
```

Abrí http://localhost:5173 en tu navegador o tablet.

## Estructura del proyecto
```
src/
  api/sheets.js          ← toda la lógica de lectura/escritura en Sheets
  components/
    ProductSearch.jsx    ← búsqueda de productos
    Cart.jsx             ← carrito con cantidades y descuentos
    PaymentModal.jsx     ← selección de método de pago
  pages/
    NuevaVenta.jsx       ← pantalla principal de venta
    VentasDelDia.jsx     ← resumen del día
```

## Notas importantes
- El archivo `.env` NUNCA se sube a GitHub (está en .gitignore)
- La app escribe directamente en la hoja "DETALLE DE VENTAS" del sheet configurado
- Los IDs de venta se generan automáticamente con formato VYYMMDD-NNN
- Los precios vienen de la columna G (PRECIO UNITARIO) de ARTICULOS
- Solo se muestran artículos con DISPONIBILIDAD distinta de "no"

## Fichadas (ingreso/salida con QR)

- Cada empleada abre `https://<tu-app>/?fichar=1` en **su** celular (conviene "Agregar a pantalla de inicio"). Ahí ve un QR firmado que cambia cada 10 s.
- La tablet escanea ese QR con el botón **⏱ Fichar** del encabezado.
- El servidor (`/api/fichadas/*`, funciones de Vercel) verifica la firma del celular, la firma de la tablet, que el QR tenga menos de 30 s y que no se haya usado. Guarda todo, incluso los rechazos con su motivo, en las pestañas `FICHADAS` y `DISPOSITIVOS`, que se crean solas.
- Admin → Más → **Fichadas**: habilitar la tablet, generar el QR de vinculación de cada celular y dar de baja dispositivos.

**Configuración (una vez):** cargar en Vercel `FICHADAS_SECRET` y `FICHADAS_ADMIN_PIN`. Por defecto las fichadas se guardan en la misma planilla de la app; para más seguridad se puede usar una planilla y cuenta de servicio propias con `FICHADAS_SHEET_ID`, `FICHADAS_GOOGLE_CLIENT_EMAIL` y `FICHADAS_GOOGLE_PRIVATE_KEY`. Para probar en local con las funciones usar `npx vercel dev` (`npm run dev` no levanta `/api`).

### Asistencia
Admin → Más → **Asistencia**: por mes y por empleada muestra cada día como a tiempo, tarde (tolerancia 10 min), franco, "¿franco?" (franco movido a confirmar), sin fichar o ausencia. El horario habitual se edita en **Horarios** (pestaña `HORARIOS`) y los cambios puntuales se cargan tocando el día (pestaña `CAMBIOS_HORARIO`). El cálculo está en `src/lib/asistencia.js`.

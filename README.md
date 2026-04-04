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

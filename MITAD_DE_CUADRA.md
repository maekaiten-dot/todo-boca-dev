# Mitad de cuadra: cómo publicar la app del segundo local

La app es una sola para los dos locales. Cada local tiene su propia publicación en Vercel, que sale
de este mismo repo, con su propia planilla. Lo que cambia entre locales está en `src/config/local.js`
(nombre, tema claro u oscuro, solapas, pantallas simples y promos).

## 1. La planilla de Mitad de cuadra

1. Abrí la planilla de la Esquina → **Archivo → Hacer una copia**. Llamala "TODO BOCA · Mitad de cuadra".
2. En la copia, borrá los datos (dejá los encabezados de la fila 1) de: DETALLE DE VENTAS, APP_LOG,
   INGRESOS, MOVIMIENTOS STOCK, PAGOS, GASTOS CAJA, FICHADAS, PROMOS y todo lo que sea de la Esquina.
3. **ARTICULOS**: cargá los productos de Mitad de cuadra. Los que también vende la Esquina, con el
   **mismo código TB** (así se puede comparar y pasar mercadería entre locales).
4. Agregá una columna con el encabezado **CATEGORIA** en ARTICULOS (por ejemplo Camisetas, Gorras,
   Tazas y mates, Llaveros, Bufandas). Son los botones de categoría de la pantalla Vender. Si un
   producto no tiene categoría, aparece en "Todos".
5. **USUARIOS**: dejá una fila **Tablet** (tipo Caja), una fila por cada persona que vende (tipo Caja,
   por ejemplo tus padres y los empleados) y los Admin (con su código).
6. Compartí la planilla con el mail de la cuenta de servicio (el de `VITE_GOOGLE_CLIENT_EMAIL`) como **Editor**.

## 2. El proyecto en Vercel

1. Vercel → **Add New → Project** → elegí el repo `todo-boca-dev` otra vez → nombre `mitad-de-cuadra`.
2. Framework **Vite**, build `npm run build`, output `dist` (igual que el de la Esquina).
3. Variables de entorno:
   - `VITE_LOCAL` = `mitad`
   - `VITE_SHEET_ID` = el ID de la planilla nueva (lo que está entre `/d/` y `/edit` en el link)
   - `VITE_GOOGLE_CLIENT_EMAIL` y `VITE_GOOGLE_PRIVATE_KEY`: las mismas de la Esquina
4. Deploy. Abrila en la tablet de Mitad de cuadra y agregala a la pantalla de inicio.

El proyecto de la Esquina no necesita cambios: sin `VITE_LOCAL` sigue siendo la Esquina.

Cada vez que se sube un cambio a `main`, se actualizan los dos locales.

## 3. Qué ve cada perfil en Mitad de cuadra

- **Caja (la tablet)**: Vender y Hoy, en versión grande y simple.
  - Vender: categorías, buscador, "+ Otro" (precio a mano), quién vende, 4 medios de pago
    (Efectivo, Crédito, Débito, Transferencia), aviso grande de venta guardada con sonido y
    "Me equivoqué, deshacer" (anula la venta en la planilla y vuelve a cargar el carrito).
  - Hoy: total del día, total por medio de pago y cada venta en su tarjeta con las fotos.
- **Admin**: Vender (la misma simple), Hoy (la de siempre, para anular o editar), Historial,
  Artículos y en "Más": Estadísticas, Conteo y stock, Ingresos.

Para sumar solapas más adelante, agregalas en `solapas` del local `mitad` en `src/config/local.js`.

## 4. Diferencias con la Esquina

- Las promos fijas por código (imanes, alfajores, llaveros/remeras/chombas, 2x1 XXXL) **no** se
  aplican en Mitad de cuadra (`promosFijas: false`), aunque los códigos sean los mismos.
- Sin modo partido, sin botón Fichar, sin posnet amarillo/blanco ni descuento socio en la pantalla simple.
- Lo vendido con "+ Otro" se guarda con el código `OTRO`.

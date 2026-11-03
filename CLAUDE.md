# TODO BOCA: instrucciones para trabajar en este repo

## Esta app sirve a DOS locales

El mismo código se publica en dos proyectos de Vercel, los dos desde la rama `main`:

| Local | Proyecto de Vercel | `VITE_LOCAL` | Planilla |
|---|---|---|---|
| La Esquina (TODO BOCA) | `todo-boca-dev` | (sin definir) | la de la Esquina |
| Mitad de cuadra (local de los padres de Adrian) | `mitad-de-cuadra` | `mitad` | su propia planilla |

- **Todo lo que se sube a `main` se publica en los dos locales.**
- Lo que cambia entre locales está en **`src/config/local.js`**: logo, tema (oscuro o claro), solapas
  por perfil, pantallas simples (`VenderSimple`, `HoySimple`), promos fijas, modo partido, Fichar, etc.
- Cada local escribe solo en su planilla (`VITE_SHEET_ID` de su proyecto). Los datos no se mezclan.
- Los pasos para armar la planilla y el proyecto de Mitad de cuadra están en `MITAD_DE_CUADRA.md`.

## Antes de hacer un cambio

1. **Si Adrian no dijo para qué local es y el cambio toca algo que ven los dos, preguntá:**
   "¿Es para los dos locales, solo para la Esquina o solo para Mitad de cuadra?"
2. **Para los dos**: cambiá la pantalla y listo.
3. **Para uno solo**: agregá una opción en `src/config/local.js` (en `esquina` y en `mitad`) y usala
   en el código con `LOCAL.<opción>`. Así se hicieron `promosFijas`, `modoPartido`, `fichar` y `barraGrande`.
   Sin la opción, el cambio aparece en los dos locales.
4. **Habilitar una solapa que ya existe en Mitad de cuadra**: sumá su id a `LOCALES.mitad.solapas`
   (`Caja`, `Admin` o `mas`). No hace falta programar nada más.
5. Si el cambio necesita una hoja o columna nueva en la planilla, avisale a Adrian que la agregue
   **en las dos planillas** (o solo en la del local que corresponda).

## Pantallas de cada local

- Esquina: `NuevaVenta` (Vender), `VentasDelDia` (Hoy) y todas las solapas de siempre. Tema oscuro.
- Mitad de cuadra: `VenderSimple` y `HoySimple` (perfiles Caja), letra y botones grandes, tema claro.
  Sus usuarios tienen más de 55 años y nunca usaron una computadora: todo tiene que ser grande, con
  pocas opciones por pantalla y sin cambios bruscos de diseño. Los botones no cambian de tamaño ni de
  texto al tocarlos.
- Colores: usá las variables CSS (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, ...). Para
  precios y títulos usá `--accent-text`, no `--accent` (el dorado sobre fondo blanco no se lee).

## Cómo trabajar

- **Cambios grandes**: en una rama aparte, con pull request. Vercel arma una vista previa de la rama
  para probar. Recién después se une a `main`.
- Antes de subir, `npm run build` y también `VITE_LOCAL=mitad npm run build`: tienen que andar los dos.
- Si algo sale mal en producción: en Vercel, en el proyecto afectado → Deployments → la publicación
  anterior → ⋯ → Promote to Production.

## Pendiente conocido

`VITE_GOOGLE_PRIVATE_KEY` termina dentro del código que baja el navegador (todo lo `VITE_` es
público). Hay que pasar la lectura y escritura de Sheets a funciones `/api` de Vercel.

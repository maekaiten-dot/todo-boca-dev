// src/config/local.js
// Configuración por local. Un mismo código sirve a los dos locales: cada publicación en Vercel
// elige el suyo con la variable VITE_LOCAL ("esquina" o "mitad") y usa su propia planilla
// (VITE_SHEET_ID). Sin VITE_LOCAL queda la Esquina, así la app actual no cambia.
//
// Para sumarle una solapa a un local, agregala en su lista de `solapas` (los ids son los de
// TABS_POR_TIPO / TABS_MAS_ADMIN en App.jsx). Las pantallas son las mismas para los dos locales.

const TEMAS = {
  oscuro: {
    bg: '#021030', surface: '#031a4a', surface2: '#042060', border: '#0d3080',
    text: '#f0f4ff', muted: '#6a8ccc', accent: '#f5c800', success: '#22c55e',
    // Texto destacado (precios, títulos). En el oscuro es el mismo dorado del acento.
    accentText: '#f5c800',
    // Texto que va arriba de un fondo dorado
    onAccent: '#000000',
    headerBg: '#031a4a', headerText: '#f0f4ff',
    overlay: 'rgba(0, 0, 10, 0.88)',
    metaColor: '#0a0a0f',
  },
  claro: {
    bg: '#FFFFFF', surface: '#F3F5F9', surface2: '#E8EEF8', border: '#C9D2E3',
    text: '#15171C', muted: '#4A5163', accent: '#f5c800', success: '#15803d',
    // El dorado sobre blanco no se lee: precios y títulos van en azul
    accentText: '#0B3B8C',
    onAccent: '#000000',
    headerBg: '#0B3B8C', headerText: '#FFFFFF',
    overlay: 'rgba(10, 16, 30, 0.55)',
    metaColor: '#0B3B8C',
  },
}

const LOCALES = {
  esquina: {
    id: 'esquina',
    nombre: 'TODO BOCA',
    logo: ['TODO', 'BOCA'],
    tema: 'oscuro',
    // null = las solapas de siempre (TABS_POR_TIPO y TABS_MAS_ADMIN)
    solapas: null,
    venderSimple: false,
    hoySimple: false,
    // Promos fijas por código (imanes, alfajores, llaveros/remeras/chombas, 2x1 XXXL)
    promosFijas: true,
    modoPartido: true,
    fichar: true,
    // Barra inferior con letra e íconos más grandes
    barraGrande: false,
  },
  mitad: {
    id: 'mitad',
    nombre: 'Mitad de cuadra',
    logo: ['MITAD', 'DE CUADRA'],
    tema: 'claro',
    solapas: {
      Caja: ['venta', 'hoy'],
      Admin: ['venta', 'hoy', 'log', 'arts'],
      // Menú "Más" del Admin
      mas: ['stats', 'conteo', 'ing'],
    },
    // Pantallas grandes y simples (las del prototipo)
    venderSimple: true,   // para todos los perfiles
    hoySimple: true,      // solo perfiles Caja; el Admin ve la de siempre (para anular, etc.)
    // Los códigos de la Esquina se repiten en Mitad de cuadra: sin esto se aplicarían
    // las promos de imanes, alfajores, etc. de la Esquina
    promosFijas: false,
    modoPartido: false,
    // Las fichadas son de la Esquina: por ahora no se muestran acá
    fichar: false,
    barraGrande: true,
    // Vendedores para elegir en la pantalla simple (perfiles Caja de USUARIOS, sin "Tablet")
    pedirVendedor: true,
  },
}

const clave = String(import.meta.env.VITE_LOCAL || 'esquina').trim().toLowerCase()
export const LOCAL = LOCALES[clave] || LOCALES.esquina
export const TEMA = TEMAS[LOCAL.tema] || TEMAS.oscuro

// Variables CSS del tema (las usa CSS_GLOBAL en App.jsx)
export function cssVariablesTema(t = TEMA) {
  return [
    `--bg: ${t.bg}`, `--surface: ${t.surface}`, `--surface2: ${t.surface2}`, `--border: ${t.border}`,
    `--text: ${t.text}`, `--muted: ${t.muted}`, `--accent: ${t.accent}`, `--success: ${t.success}`,
    `--accent-text: ${t.accentText}`, `--on-accent: ${t.onAccent}`,
    `--header-bg: ${t.headerBg}`, `--header-text: ${t.headerText}`, `--overlay: ${t.overlay}`,
  ].join('; ') + ';'
}

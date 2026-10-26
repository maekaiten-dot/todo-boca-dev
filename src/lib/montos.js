// src/lib/montos.js
// Monto en pesos a número: "$8.000", "8.000", "8000", "7000,5" → número. Un punto con 1 o 2 decimales
// ("3333.33") es punto decimal, no separador de miles (así se cargaron algunos costos y quedaban ×100).
export function parseMonto(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const t = String(v).replace(/^'/, '').replace(/[$\s]/g, '')
  if (/^-?\d+\.\d{1,2}$/.test(t)) return Number(t) || 0
  return Number(t.replace(/\./g, '').replace(',', '.')) || 0
}

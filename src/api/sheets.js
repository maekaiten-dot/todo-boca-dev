
// ── Gastos Fijos ─────────────────────────────────────────────────────────────

export async function getGastosFijos() {
  const data = await sheetsGet('GASTOS FIJOS!A2:D')
  const rows = data.values || []
  return rows
    .filter(r => r[0])
    .map((r, idx) => ({
      rowNum: idx + 2,
      concepto: r[0] || '',
      monto: parsePrecio(r[1]),
      semana: r[2] || '1ra semana',
    }))
}

export async function agregarGastoFijo({ concepto, monto, semana }) {
  const row = [concepto, monto, semana]
  await sheetsAppend('GASTOS FIJOS!A1', [row])
}

export async function editarGastoFijo(rowNum, { concepto, monto, semana }) {
  const row = [concepto, monto, semana]
  await sheetsUpdate(`GASTOS FIJOS!A${rowNum}:C${rowNum}`, [row])
}

export async function eliminarGastoFijo(rowNum) {
  // Borra el contenido de la fila (la deja vacía)
  await sheetsUpdate(`GASTOS FIJOS!A${rowNum}:C${rowNum}`, [['', '', '']])
}

// src/components/PaymentModal.jsx

const METODOS = [
  { id: 'Efectivo ARS', label: 'Efectivo', icon: '💵', sub: 'ARS' },
  { id: 'Tarjeta', label: 'Tarjeta', icon: '💳', sub: 'Débito / Crédito' },
  { id: 'QR', label: 'QR', icon: '📱', sub: 'Mercado Pago' },
  { id: 'Efectivo USD', label: 'Dólares', icon: '🇺🇸', sub: 'USD' },
  { id: 'Efectivo BRL', label: 'Reales', icon: '🇧🇷', sub: 'BRL' },
  { id: 'Efectivo EUR', label: 'Euros', icon: '🇪🇺', sub: 'EUR' },
]

export default function PaymentModal({ total, onConfirm, onCancel, saving }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Método de pago</div>
          <div style={styles.totalLabel}>
            Total: <span style={styles.totalAmount}>${Math.round(total).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div style={styles.grid}>
          {METODOS.map(m => (
            <button
              key={m.id}
              style={styles.metodoBtn}
              onClick={() => !saving && onConfirm(m.id)}
              disabled={saving}
            >
              <span style={styles.metodoIcon}>{m.icon}</span>
              <span style={styles.metodoLabel}>{m.label}</span>
              <span style={styles.metodoSub}>{m.sub}</span>
            </button>
          ))}
        </div>

        <button style={styles.cancelBtn} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>

        {saving && (
          <div style={styles.savingOverlay}>
            <div style={styles.savingText}>Guardando venta...</div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--bg)',
    borderRadius: '20px 20px 0 0',
    padding: 24,
    width: '100%',
    maxWidth: 480,
    position: 'relative',
    animation: 'slideUp 0.25s ease',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 800,
    fontSize: 22,
    color: 'var(--text)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalLabel: {
    fontFamily: 'Barlow, sans-serif',
    fontSize: 14,
    color: 'var(--muted)',
    marginTop: 2,
  },
  totalAmount: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 800,
    fontSize: 20,
    color: 'var(--accent)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 16,
  },
  metodoBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '16px 8px',
    background: 'var(--surface)',
    border: '2px solid var(--border)',
    borderRadius: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
    color: 'var(--text)',
  },
  metodoIcon: {
    fontSize: 28,
  },
  metodoLabel: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 14,
    color: 'var(--text)',
  },
  metodoSub: {
    fontFamily: 'Barlow, sans-serif',
    fontSize: 10,
    color: 'var(--muted)',
  },
  cancelBtn: {
    width: '100%',
    padding: 14,
    background: 'none',
    border: '1.5px solid var(--border)',
    borderRadius: 12,
    color: 'var(--muted)',
    fontFamily: 'Barlow, sans-serif',
    fontSize: 15,
    cursor: 'pointer',
  },
  savingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,10,15,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '20px 20px 0 0',
  },
  savingText: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 20,
    color: 'var(--accent)',
  },
}

// src/components/Cart.jsx
import { useState } from 'react'

export default function Cart({ items, onUpdateQty, onRemove, onDescCarrito, descCarrito }) {
  const subtotal = items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const totalFinal = subtotal * (1 - descCarrito / 100)
  const [editingDesc, setEditingDesc] = useState(false)

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>🛒</div>
        <div style={styles.emptyText}>El carrito está vacío</div>
        <div style={styles.emptyHint}>Buscá un producto arriba para agregar</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.itemsList}>
        {items.map((item, idx) => (
          <div key={`${item.id}-${idx}`} style={styles.item}>
            <div style={styles.itemInfo}>
              {item.foto
                ? <img src={item.foto} alt="" style={styles.thumb} />
                : <div style={styles.thumbPlaceholder}>📦</div>
              }
              <div style={styles.itemDetails}>
                <div style={styles.itemNombre}>{item.nombre}</div>
                <div style={styles.itemSku}>{item.id}</div>
                <div style={styles.itemPrecioUnit}>
                  ${item.precioUnitario.toLocaleString('es-AR')} c/u
                </div>
              </div>
            </div>

            <div style={styles.itemActions}>
              <div style={styles.qtyControls}>
                <button
                  style={styles.qtyBtn}
                  onClick={() => onUpdateQty(idx, item.cantidad - 1)}
                >−</button>
                <span style={styles.qty}>{item.cantidad}</span>
                <button
                  style={styles.qtyBtn}
                  onClick={() => onUpdateQty(idx, item.cantidad + 1)}
                >+</button>
              </div>
              <div style={styles.itemTotal}>
                ${(item.precioUnitario * item.cantidad).toLocaleString('es-AR')}
              </div>
              <button style={styles.removeBtn} onClick={() => onRemove(idx)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Descuento carrito */}
      <div style={styles.descRow}>
        <span style={styles.descLabel}>Descuento carrito</span>
        {editingDesc ? (
          <div style={styles.descInputRow}>
            <input
              type="number"
              min="0"
              max="100"
              value={descCarrito}
              onChange={e => onDescCarrito(Number(e.target.value))}
              style={styles.descInput}
              autoFocus
              onBlur={() => setEditingDesc(false)}
            />
            <span style={styles.descPct}>%</span>
          </div>
        ) : (
          <button style={styles.descValue} onClick={() => setEditingDesc(true)}>
            {descCarrito > 0 ? `${descCarrito}%` : '+ agregar'}
          </button>
        )}
      </div>

      {/* Totales */}
      <div style={styles.totales}>
        {descCarrito > 0 && (
          <div style={styles.subtotalRow}>
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString('es-AR')}</span>
          </div>
        )}
        {descCarrito > 0 && (
          <div style={styles.dtoRow}>
            <span>Descuento ({descCarrito}%)</span>
            <span style={{ color: 'var(--success)' }}>
              −${(subtotal - totalFinal).toLocaleString('es-AR')}
            </span>
          </div>
        )}
        <div style={styles.totalRow}>
          <span>TOTAL</span>
          <span style={styles.totalAmount}>${Math.round(totalFinal).toLocaleString('es-AR')}</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--muted)',
  },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 18,
    color: 'var(--muted)',
  },
  emptyHint: {
    fontFamily: 'Barlow, sans-serif',
    fontSize: 13,
    marginTop: 4,
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
    gap: 8,
  },
  itemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  thumb: {
    width: 44,
    height: 44,
    objectFit: 'cover',
    borderRadius: 8,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--border)',
    borderRadius: 8,
    fontSize: 20,
    flexShrink: 0,
  },
  itemDetails: {
    minWidth: 0,
    flex: 1,
  },
  itemNombre: {
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemSku: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 11,
    color: 'var(--muted)',
  },
  itemPrecioUnit: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 12,
    color: 'var(--muted)',
  },
  itemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  qtyControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--surface2)',
    borderRadius: 8,
    padding: '2px 4px',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    background: 'var(--border)',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  qty: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    minWidth: 20,
    textAlign: 'center',
    color: 'var(--text)',
  },
  itemTotal: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--accent)',
    minWidth: 70,
    textAlign: 'right',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 13,
    padding: 4,
  },
  descRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
  },
  descLabel: {
    fontFamily: 'Barlow, sans-serif',
    fontSize: 14,
    color: 'var(--muted)',
  },
  descInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  descInput: {
    width: 60,
    background: 'var(--surface2)',
    border: '1.5px solid var(--accent)',
    borderRadius: 6,
    color: 'var(--text)',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 16,
    fontWeight: 700,
    textAlign: 'center',
    padding: '2px 6px',
    outline: 'none',
  },
  descPct: {
    color: 'var(--muted)',
    fontSize: 14,
  },
  descValue: {
    background: 'none',
    border: '1.5px dashed var(--border)',
    borderRadius: 6,
    color: 'var(--accent)',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '2px 10px',
  },
  totales: {
    padding: '12px 0 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  subtotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'Barlow, sans-serif',
    fontSize: 13,
    color: 'var(--muted)',
  },
  dtoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'Barlow, sans-serif',
    fontSize: 13,
    color: 'var(--muted)',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalAmount: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 800,
    fontSize: 28,
    color: 'var(--accent)',
  },
}

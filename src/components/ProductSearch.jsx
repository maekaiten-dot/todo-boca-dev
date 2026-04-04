// src/components/ProductSearch.jsx
import { useState, useEffect, useRef } from 'react'

export default function ProductSearch({ articulos, onAdd, loading }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    const q = query.toLowerCase()
    const filtered = articulos
      .filter(a =>
        a.nombre.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      )
      .slice(0, 8)
    setResults(filtered)
    setOpen(filtered.length > 0)
  }, [query, articulos])

  function handleSelect(art) {
    onAdd(art)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={styles.searchBar}>
        <span style={styles.searchIcon}>⌕</span>
        <input
          ref={inputRef}
          style={styles.input}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={loading ? 'Cargando productos...' : 'Buscar por nombre o SKU...'}
          disabled={loading}
          autoComplete="off"
        />
        {query && (
          <button style={styles.clearBtn} onClick={() => { setQuery(''); setOpen(false) }}>✕</button>
        )}
      </div>

      {open && (
        <div style={styles.dropdown}>
          {results.map(art => (
            <button key={art.id} style={styles.resultItem} onClick={() => handleSelect(art)}>
              <div style={styles.resultLeft}>
                {art.foto
                  ? <img src={art.foto} alt="" style={styles.thumb} />
                  : <div style={styles.thumbPlaceholder}>📦</div>
                }
                <div>
                  <div style={styles.resultNombre}>{art.nombre}</div>
                  <div style={styles.resultSku}>{art.id}</div>
                </div>
              </div>
              <div style={styles.resultPrecio}>
                ${art.precioUnitario.toLocaleString('es-AR')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface)',
    border: '2px solid var(--border)',
    borderRadius: 12,
    padding: '0 12px',
    gap: 8,
    transition: 'border-color 0.2s',
  },
  searchIcon: {
    fontSize: 22,
    color: 'var(--muted)',
    userSelect: 'none',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontSize: 16,
    padding: '14px 0',
    fontFamily: 'Barlow, sans-serif',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 4,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  resultItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    color: 'var(--text)',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  resultLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  thumb: {
    width: 40,
    height: 40,
    objectFit: 'cover',
    borderRadius: 6,
  },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--border)',
    borderRadius: 6,
    fontSize: 18,
  },
  resultNombre: {
    fontFamily: 'Barlow, sans-serif',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text)',
  },
  resultSku: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 12,
    color: 'var(--muted)',
  },
  resultPrecio: {
    fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    color: 'var(--accent)',
  },
}

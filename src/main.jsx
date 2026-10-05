import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FicharCelular from './pages/FicharCelular.jsx'

// ?fichar=1 → pantalla de fichada del celular de cada empleada (sin login de la tablet)
const esCelularFichada = new URLSearchParams(window.location.search).has('fichar')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {esCelularFichada ? <FicharCelular /> : <App />}
  </React.StrictMode>
)

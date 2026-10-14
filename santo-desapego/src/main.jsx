import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { aplicarModoCor, lerModoCor } from './utils/modoCor'

// Aplica o modo de cor salvo antes do primeiro render, pra não piscar a paleta padrão
aplicarModoCor(lerModoCor())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

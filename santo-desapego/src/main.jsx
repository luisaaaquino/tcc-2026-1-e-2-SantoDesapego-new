import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { aplicarModoCor, lerModoCor } from './utils/modoCor'
import { aplicarEscalaFonte, lerEscalaFonte } from './utils/tamanhoFonte'

// Aplica as preferências de acessibilidade salvas antes do primeiro render, pra não piscar
aplicarModoCor(lerModoCor())
aplicarEscalaFonte(lerEscalaFonte())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

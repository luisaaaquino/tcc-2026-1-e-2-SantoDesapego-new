import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { aplicarModoCor, lerModoCor } from './utils/modoCor'
import { aplicarEscalaFonte, lerEscalaFonte } from './utils/tamanhoFonte'
import { limparSessaoSeVencida, avisarSessaoExpiradaNaApi } from './utils/sessao'

// Aplica as preferências de acessibilidade salvas antes do primeiro render, pra não piscar
aplicarModoCor(lerModoCor())
aplicarEscalaFonte(lerEscalaFonte())

// Sessão vencida: limpa antes do primeiro render (nada de "meio logado") e,
// se vencer com o site aberto, leva pro login com aviso
limparSessaoSeVencida()
avisarSessaoExpiradaNaApi()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

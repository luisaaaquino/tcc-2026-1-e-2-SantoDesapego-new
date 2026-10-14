import { useState, useEffect, useRef } from 'react';
import { IconVisao, IconClose } from './Icones';
import { aplicarModoCor, lerModoCor, dicaModoCorVista, marcarDicaModoCorVista } from '../utils/modoCor';
import './AcessibilidadeCores.css';

/* ── Seletor de modo de cor (acessibilidade p/ daltonismo) ──
   Botão flutuante no canto inferior esquerdo, em toda navegação
   (montado em App.jsx). As amostras mostram as cores de sucesso,
   erro e destaque de cada paleta. ── */
const OPCOES = [
  { valor: 'padrao',        titulo: 'Padrão',         descricao: 'Cores originais do site',          amostras: ['#2A7D5C', '#C14B35', '#E4A020'] },
  { valor: 'protan-deutan', titulo: 'Vermelho-verde', descricao: 'Protanopia e deuteranopia',        amostras: ['#1F6BB0', '#A33E00', '#F0B020'] },
  { valor: 'tritan',        titulo: 'Azul-amarelo',   descricao: 'Tritanopia',                       amostras: ['#2A7D5C', '#A8322A', '#F2B33D'] },
];

const AcessibilidadeCores = () => {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState(lerModoCor);
  const [mostrarDica, setMostrarDica] = useState(() => !dicaModoCorVista());
  const wrapRef = useRef(null);

  const alternar = () => {
    setAberto((a) => !a);
    if (mostrarDica) {
      setMostrarDica(false);
      marcarDicaModoCorVista();
    }
  };

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    };
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const escolher = (valor) => {
    setModo(valor);
    aplicarModoCor(valor);
  };

  return (
    <div className="acess-cor-wrap" ref={wrapRef}>
      {aberto && (
        <fieldset className="acess-cor-painel" id="acess-cor-painel">
          <legend className="acess-cor-titulo">Modo de cor para daltonismo</legend>
          <button type="button" className="acess-cor-fechar" onClick={() => setAberto(false)} aria-label="Fechar">
            <IconClose size={18} />
          </button>
          {OPCOES.map((op) => (
            <label key={op.valor} className={`acess-cor-opcao${modo === op.valor ? ' ativa' : ''}`}>
              <input
                type="radio"
                name="modo-cor"
                value={op.valor}
                checked={modo === op.valor}
                onChange={() => escolher(op.valor)}
              />
              <span className="acess-cor-textos">
                <strong>{op.titulo}</strong>
                <small>{op.descricao}</small>
              </span>
              <span className="acess-cor-amostras" aria-hidden="true">
                {op.amostras.map((cor) => <i key={cor} style={{ background: cor }} />)}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="acess-cor-linha">
        <button
          type="button"
          className="acess-cor-botao"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls="acess-cor-painel"
          aria-label="Modo de cor para daltonismo"
          title="Modo de cor para daltonismo"
        >
          <IconVisao />
        </button>
        {/* Só visual: leitores de tela já recebem o aria-label do botão */}
        {mostrarDica && (
          <button type="button" className="acess-cor-dica" onClick={alternar} tabIndex={-1} aria-hidden="true">
            Modo para daltonismo
          </button>
        )}
      </div>
    </div>
  );
};

export default AcessibilidadeCores;

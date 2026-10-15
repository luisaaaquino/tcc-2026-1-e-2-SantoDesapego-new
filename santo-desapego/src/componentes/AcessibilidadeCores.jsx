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
  const [expandido, setExpandido] = useState(false);
  const wrapRef = useRef(null);

  // Primeira visita: o botão se abre mostrando o rótulo e recolhe sozinho
  useEffect(() => {
    if (dicaModoCorVista()) return;
    const abrir = setTimeout(() => setExpandido(true), 600);
    const recolher = setTimeout(() => {
      setExpandido(false);
      marcarDicaModoCorVista();
    }, 6000);
    return () => { clearTimeout(abrir); clearTimeout(recolher); };
  }, []);

  const alternar = () => {
    setAberto((a) => !a);
    setExpandido(false);
    marcarDicaModoCorVista();
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
      <button
        type="button"
        className={`acess-cor-botao${expandido && !aberto ? ' expandido' : ''}`}
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls="acess-cor-painel"
        aria-label="Modo de cor para daltonismo"
      >
        <IconVisao />
        <span className="acess-cor-rotulo" aria-hidden="true">Modo daltonismo</span>
      </button>
    </div>
  );
};

export default AcessibilidadeCores;

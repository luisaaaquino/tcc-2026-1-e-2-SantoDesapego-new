import { useState, useEffect, useRef } from 'react';
import { IconAcessibilidade, IconClose } from './Icones';
import { aplicarModoCor, lerModoCor, dicaModoCorVista, marcarDicaModoCorVista } from '../utils/modoCor';
import { aplicarEscalaFonte, lerEscalaFonte, NIVEIS_FONTE } from '../utils/tamanhoFonte';
import './AcessibilidadeCores.css';

/* ── Painel de acessibilidade ───────────────────────────────
   Botão flutuante no canto inferior esquerdo, em toda navegação
   (montado em App.jsx), com tamanho do texto e modo de cor para
   daltonismo. As amostras mostram as cores de sucesso, erro e
   destaque de cada paleta. ── */
const OPCOES = [
  { valor: 'padrao',        titulo: 'Padrão',         descricao: 'Cores originais do site',          amostras: ['#2A7D5C', '#C14B35', '#E4A020'] },
  { valor: 'protan-deutan', titulo: 'Vermelho-verde', descricao: 'Protanopia e deuteranopia',        amostras: ['#1F6BB0', '#A33E00', '#F0B020'] },
  { valor: 'tritan',        titulo: 'Azul-amarelo',   descricao: 'Tritanopia',                       amostras: ['#2A7D5C', '#A8322A', '#F2B33D'] },
];

const AcessibilidadeCores = () => {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState(lerModoCor);
  const [escala, setEscala] = useState(lerEscalaFonte);
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

  const nivel = NIVEIS_FONTE.indexOf(escala);
  const mudarFonte = (novaEscala) => {
    setEscala(novaEscala);
    aplicarEscalaFonte(novaEscala);
  };

  return (
    <div className="acess-cor-wrap" ref={wrapRef}>
      {aberto && (
        <div className="acess-cor-painel" id="acess-cor-painel" role="group" aria-labelledby="acess-titulo">
          <div className="acess-topo">
            <strong id="acess-titulo">Acessibilidade</strong>
            <button type="button" className="acess-cor-fechar" onClick={() => setAberto(false)} aria-label="Fechar">
              <IconClose size={18} />
            </button>
          </div>

          <div className="acess-secao">
            <span className="acess-secao-titulo" id="acess-fonte-titulo">Tamanho do texto</span>
            <div className="acess-fonte" role="group" aria-labelledby="acess-fonte-titulo">
              <button
                type="button"
                className="acess-fonte-btn menor"
                onClick={() => mudarFonte(NIVEIS_FONTE[nivel - 1])}
                disabled={nivel <= 0}
                aria-label="Diminuir texto"
              >
                A−
              </button>
              <output className="acess-fonte-valor" aria-live="polite">{Math.round(escala * 100)}%</output>
              <button
                type="button"
                className="acess-fonte-btn maior"
                onClick={() => mudarFonte(NIVEIS_FONTE[nivel + 1])}
                disabled={nivel >= NIVEIS_FONTE.length - 1}
                aria-label="Aumentar texto"
              >
                A+
              </button>
            </div>
            {escala !== 1 && (
              <button type="button" className="acess-fonte-restaurar" onClick={() => mudarFonte(1)}>
                Restaurar tamanho padrão
              </button>
            )}
          </div>

          <fieldset className="acess-secao">
            <legend className="acess-secao-titulo">Modo de cor para daltonismo</legend>
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
        </div>
      )}
      <button
        type="button"
        className={`acess-cor-botao${expandido && !aberto ? ' expandido' : ''}`}
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls="acess-cor-painel"
        aria-label="Acessibilidade: tamanho do texto e modo de cor"
      >
        <IconAcessibilidade />
        <span className="acess-cor-rotulo" aria-hidden="true">Acessibilidade</span>
      </button>
    </div>
  );
};

export default AcessibilidadeCores;

import { useState, useRef, useEffect } from 'react';
import './SeletorBairro.css';

/* Bairros filtráveis (mesma lista usada no cadastro/perfil) */
export const BAIRROS = ['Santo Amaro Centro', 'Campo Belo', 'Brooklin', 'Granja Julieta', 'Jardim Marajoara', 'Vila Cruzeiro', 'Vila Mascote', 'Vila Sofia'];

const IconPin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IconChevron = ({ aberto }) => (
  <svg className={`seletor-bairro-chevron${aberto ? ' aberto' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── Seletor de bairro — usado na barra de busca (Home/Explorar) ──
   Dropdown com visual próprio (não é um <select> nativo), pra
   combinar com o resto da identidade visual do site. */
const SeletorBairro = ({ value, onChange }) => {
  const [aberto, setAberto] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const aoClicarFora = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const escolher = (bairro) => {
    onChange(bairro);
    setAberto(false);
  };

  return (
    <div className="seletor-bairro" ref={wrapperRef}>
      <button type="button" className="seletor-bairro-btn" onClick={() => setAberto((a) => !a)}>
        <IconPin />
        <span>{value || 'Todos os bairros'}</span>
        <IconChevron aberto={aberto} />
      </button>

      {aberto && (
        <div className="seletor-bairro-lista" role="listbox">
          <button type="button" className={!value ? 'ativo' : ''} onClick={() => escolher('')}>
            Todos os bairros
            {!value && <IconCheck />}
          </button>
          {BAIRROS.map((b) => (
            <button type="button" key={b} className={value === b ? 'ativo' : ''} onClick={() => escolher(b)}>
              {b}
              {value === b && <IconCheck />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SeletorBairro;

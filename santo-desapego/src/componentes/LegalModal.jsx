import { useEffect } from 'react';
import { TERMOS_USO, POLITICA_PRIVACIDADE } from '../pages/termosContent';

/* ── Modal de Termos de Uso / Privacidade (LGPD) ─────────────
   Compartilhado por todas as páginas com rodapé completo (Home,
   Explorar, Sobre, Indique) e pelo Cadastro — nasceu só na Home,
   virou componente pra não duplicar as ~60 linhas de JSX em cada
   página. Cada página continua dona do próprio estado (aba aberta),
   só passa como prop. ── */
const LegalModal = ({ aba, onSelectAba, onClose }) => {
  useEffect(() => {
    if (!aba) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aba, onClose]);

  if (!aba) return null;

  return (
    <div className="legal-overlay" onClick={onClose}>
      <div
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Termos de Uso e Política de Privacidade"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-modal-head">
          <div className="legal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'termos'}
              className={`legal-tab${aba === 'termos' ? ' active' : ''}`}
              onClick={() => onSelectAba('termos')}
            >
              Termos de Uso
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'privacidade'}
              className={`legal-tab${aba === 'privacidade' ? ' active' : ''}`}
              onClick={() => onSelectAba('privacidade')}
            >
              Privacidade (LGPD)
            </button>
          </div>
          <button type="button" className="legal-modal-close" aria-label="Fechar" onClick={onClose}>×</button>
        </div>

        <div className="legal-box" role="tabpanel">
          {(aba === 'termos' ? TERMOS_USO : POLITICA_PRIVACIDADE).map((sec) => (
            <div key={sec.titulo} className="legal-item">
              <h3>{sec.titulo}</h3>
              {sec.paragrafos?.map((p, i) => <p key={i}>{p}</p>)}
              {sec.lista && (
                <ul>
                  {sec.lista.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
              {sec.rodape && <p className="legal-rodape">{sec.rodape}</p>}
              {sec.subsecoes?.map((sub) => (
                <div key={sub.titulo} className="legal-subitem">
                  <h4>{sub.titulo}</h4>
                  {sub.paragrafos?.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LegalModal;

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import './PerfilPublico.css';
import './Explorar.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';
import NotificacoesSino from '../componentes/NotificacoesSino';
import { API_URL } from '../config';

const IconStar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const tempoDesde = (dataISO) => {
  if (!dataISO) return '';
  const meses = Math.floor((Date.now() - new Date(dataISO)) / (1000 * 60 * 60 * 24 * 30));
  if (meses < 1) return 'este mês';
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
};

/* ── Perfil público [RF05] — dados não sensíveis de qualquer usuário:
   nome de exibição, reputação, transações concluídas, tempo de cadastro
   e anúncios ativos. Nunca expõe e-mail, CPF, telefone ou endereço. ── */
const PerfilPublico = () => {
  const { id } = useParams();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setDados(null);
    setErro('');
    fetch(`${API_URL}/api/usuarios/${id}/publico`)
      .then((r) => r.json().then((data) => ({ status: r.status, data })))
      .then(({ status, data }) => {
        if (status !== 200) { setErro(data.erro || 'Usuário não encontrado.'); return; }
        setDados(data);
      })
      .catch(() => setErro('Erro ao conectar com o servidor.'));
  }, [id]);

  return (
    <div className="perfilpub-wrapper">
      <SiteHeader>
        <NotificacoesSino />
        <NavBackButton to="/explorar">Voltar para o Explorar</NavBackButton>
      </SiteHeader>

      {erro && (
        <div className="perfilpub-estado">
          <p>{erro}</p>
          <Link to="/explorar" className="btn-dark">Voltar para o Explorar</Link>
        </div>
      )}

      {!erro && !dados && <div className="perfilpub-estado">Carregando perfil...</div>}

      {dados && (
        <div className="perfilpub-container">
          <div className="perfilpub-card">
            <div className="perfilpub-avatar">
              {dados.usuario.foto_perfil
                ? <img src={dados.usuario.foto_perfil} alt={dados.usuario.nome_exibicao} />
                : <span>{dados.usuario.nome_exibicao[0]?.toUpperCase()}</span>}
            </div>
            <div className="perfilpub-info">
              <h1>{dados.usuario.nome_exibicao}</h1>
              <p className="perfilpub-membro">Membro desde {tempoDesde(dados.usuario.membro_desde)}</p>

              <div className="perfilpub-stats">
                <div className="perfilpub-stat">
                  <div className="estrelas-display">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={n <= Math.round(dados.reputacao.media || 0) ? 'cheia' : ''}>
                        <IconStar />
                      </span>
                    ))}
                  </div>
                  <span className="perfilpub-stat-texto">
                    {dados.reputacao.total_avaliacoes > 0
                      ? `${dados.reputacao.media.toFixed(1)} (${dados.reputacao.total_avaliacoes} avaliação${dados.reputacao.total_avaliacoes === 1 ? '' : 'ões'})`
                      : 'Sem avaliações ainda'}
                  </span>
                </div>
                <div className="perfilpub-stat">
                  <strong className="perfilpub-stat-num">{dados.total_transacoes}</strong>
                  <span className="perfilpub-stat-texto">
                    transaç{dados.total_transacoes === 1 ? 'ão' : 'ões'} concluída{dados.total_transacoes === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h2 className="perfilpub-secao-titulo">Anúncios ativos</h2>
          {dados.anuncios_ativos.length > 0 ? (
            <div className="explorar-grid">
              {dados.anuncios_ativos.map((a) => (
                <Link key={a.id} to={`/anuncio/${a.id}`} className="ecard">
                  <div className="ecard-imagem">
                    {a.imagem_principal
                      ? <img src={a.imagem_principal} alt={a.titulo} loading="lazy" />
                      : <div className="ecard-imagem-vazia">📦</div>}
                  </div>
                  <div className="ecard-info">
                    <h3 className="ecard-titulo">{a.titulo}</h3>
                    <p className="ecard-preco">{brl(a.preco)}</p>
                    <p className="ecard-local">📍 {a.bairro || 'Santo Amaro'}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="perfilpub-sem-anuncios">Nenhum anúncio ativo no momento.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default PerfilPublico;

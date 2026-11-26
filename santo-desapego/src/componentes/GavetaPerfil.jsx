import { Link } from 'react-router-dom';
import './GavetaPerfil.css';

// Bloco de conta no topo do menu do celular (gaveta das três linhas),
// igual na Home, no Explorar e no Sobre.
//  - logado: avatar, nome, "Ver meu perfil" e atalhos para as abas do perfil
//    (e para o painel, se for administrador);
//  - visitante: "Entrar" e "Criar conta".
// usuario — o usuário salvo (ou null); onNavegar — fecha a gaveta ao clicar

const ATALHOS = [
  { to: '/perfil?aba=anuncios', rotulo: 'Meus anúncios' },
  { to: '/perfil?aba=compras', rotulo: 'Compras' },
  { to: '/perfil?aba=favoritos', rotulo: 'Favoritos' },
  { to: '/mensagens', rotulo: 'Mensagens' },
];

const GavetaPerfil = ({ usuario, onNavegar }) => {
  if (!usuario) {
    return (
      <div className="gaveta-perfil gaveta-perfil--visitante">
        <p className="gaveta-perfil-titulo">Entre na sua conta</p>
        <p className="gaveta-perfil-texto">Para comprar, anunciar e conversar com vizinhos.</p>
        <div className="gaveta-perfil-botoes">
          <Link to="/login" className="gaveta-perfil-botao" onClick={onNavegar}>Entrar</Link>
          <Link to="/cadastro" className="gaveta-perfil-botao gaveta-perfil-botao--contorno" onClick={onNavegar}>Criar conta</Link>
        </div>
      </div>
    );
  }

  const admin = usuario.papel === 'administrador';
  return (
    <div className="gaveta-perfil">
      <Link to="/perfil" className="gaveta-perfil-topo" onClick={onNavegar}>
        <span className="gaveta-perfil-avatar" aria-hidden="true">
          {usuario.foto_perfil
            ? <img src={usuario.foto_perfil} alt="" />
            : (usuario.nome || '?')[0].toUpperCase()}
        </span>
        <span className="gaveta-perfil-nome">
          {usuario.nome}
          <small>{admin ? 'Administrador(a)' : 'Minha conta'}</small>
        </span>
        <span className="gaveta-perfil-ver">Ver meu perfil</span>
      </Link>
      <nav className="gaveta-perfil-atalhos" aria-label="Atalhos da minha conta">
        {ATALHOS.map((a) => (
          <Link key={a.to} to={a.to} onClick={onNavegar}>{a.rotulo}</Link>
        ))}
        {admin && (
          <Link to="/admin" className="gaveta-perfil-admin" onClick={onNavegar}>Painel administrativo</Link>
        )}
      </nav>
    </div>
  );
};

export default GavetaPerfil;

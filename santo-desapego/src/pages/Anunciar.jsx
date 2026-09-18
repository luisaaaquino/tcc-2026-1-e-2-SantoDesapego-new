import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import './Anunciar.css';
import SiteHeader, { NavBackButton } from '../componentes/SiteHeader';

import { API_URL } from '../config';

// ── Limites do TCC [RNF19] ────────────────────────────────
const MAX_IMAGENS  = 6;
const MAX_TITULO   = 120;
const MAX_DESCRICAO = 800;
const MIN_TITULO    = 5;
const MIN_DESCRICAO = 20;

const ESTADOS_CONSERVACAO = [
  { value: 'novo',        emoji: '✨', name: 'Novo',         desc: 'Sem uso, na embalagem' },
  { value: 'seminovo',    emoji: '👌', name: 'Seminovo',     desc: 'Pouco uso, sem marcas' },
  { value: 'usado',       emoji: '👍', name: 'Usado',        desc: 'Funcional, com sinais de uso' },
  { value: 'para-reparo', emoji: '🔧', name: 'Para reparo',  desc: 'Precisa de manutenção' },
];

/* ════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════ */
const Anunciar = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const editando = Boolean(id); // [RF12] /anunciar/:id abre em modo de edição

  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [submitted, setSubmitted] = useState(null); // anúncio criado

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    preco: '',
    aceita_troca: false,
    estado_conservacao: '',
    categoria_principal: '',
    categoria_id: '',     // subcategoria selecionada (ou principal se não tiver subs)
    cep: '',
    bairro: '',
  });
  const [imagens, setImagens] = useState([]);  // array de strings base64
  const [enviando, setEnviando] = useState(false);
  const [erroGlobal, setErroGlobal] = useState('');
  const fileInputRef = useRef();

  // ── Verifica login + carrega categorias e dados do usuário ──
  useEffect(() => {
    const token = localStorage.getItem('sd_token');
    if (!token) { navigate('/login'); return; }

    const chamadas = [
      fetch(`${API_URL}/api/categorias`).then((r) => r.json()),
      fetch(`${API_URL}/api/usuario/perfil`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json().then((data) => ({ status: r.status, data }))),
    ];
    if (editando) {
      chamadas.push(fetch(`${API_URL}/api/anuncios/${id}`).then((r) => r.json()));
    }

    Promise.all(chamadas)
      .then(([cats, perfil, anuncioResp]) => {
        if (cats.categorias) setCategorias(cats.categorias);
        if (perfil.data.usuario) {
          setUsuario(perfil.data.usuario);

          if (editando) {
            const anuncio = anuncioResp?.anuncio;
            if (!anuncio) {
              setErroGlobal('Anúncio não encontrado.');
              return;
            }
            if (anuncio.vendedor_id !== perfil.data.usuario.id) {
              alert('Você só pode editar os seus próprios anúncios.');
              navigate('/perfil');
              return;
            }
            // Acha a categoria principal (pai) a partir da categoria/subcategoria salva
            const principal = cats.categorias.find((c) =>
              c.id === anuncio.categoria_id || c.subcategorias?.some((s) => s.id === anuncio.categoria_id)
            );
            const ehSubcategoria = principal?.subcategorias?.some((s) => s.id === anuncio.categoria_id);

            setForm({
              titulo: anuncio.titulo || '',
              descricao: anuncio.descricao || '',
              preco: String(anuncio.preco ?? '').replace('.', ','),
              aceita_troca: anuncio.aceita_troca === true,
              estado_conservacao: anuncio.estado_conservacao || '',
              categoria_principal: principal ? String(principal.id) : '',
              categoria_id: ehSubcategoria ? String(anuncio.categoria_id) : '',
              cep: maskCEP(anuncio.cep || ''),
              bairro: anuncio.bairro || '',
            });
            setImagens(anuncio.imagens || []);
          } else {
            // Pré-preenche CEP e bairro do cadastro (só na criação)
            setForm((f) => ({
              ...f,
              cep: maskCEP(perfil.data.usuario.cep || ''),
              bairro: perfil.data.usuario.bairro || '',
            }));
          }
        } else if (perfil.status === 401) {
          localStorage.removeItem('sd_token');
          navigate('/login');
        } else {
          setErroGlobal('Não foi possível carregar seus dados. Tente novamente.');
        }
      })
      .catch(() => alert('Erro ao carregar dados.'))
      .finally(() => setCarregando(false));
  }, [navigate, id, editando]);

  /* ── Máscaras ──────────────────────────────────────────── */
  const maskCEP = (v) => {
    let n = (v || '').replace(/\D/g, '').slice(0, 8);
    if (n.length > 5) n = `${n.slice(0,5)}-${n.slice(5)}`;
    return n;
  };

  const formatPreco = (value) => {
    // Padrão brasileiro: só dígitos e vírgula, no máximo 2 casas decimais.
    // Nunca converte pra ponto aqui — isso é o que fazia o campo "comer"
    // os centavos (o ponto virava inválido de novo na tecla seguinte).
    let v = value.replace(/[^\d,]/g, '');
    const [inteiro, ...resto] = v.split(',');
    v = resto.length > 0 ? `${inteiro},${resto.join('').slice(0, 2)}` : inteiro;
    setForm({ ...form, preco: v });
  };

  // Converte "1.234,56" (exibido) pra 1234.56 (número) só na hora de usar
  const precoParaNumero = (v) => parseFloat((v || '').replace(',', '.'));

  /* ── Subcategorias da principal selecionada ────────────── */
  const subcategorias = (() => {
    const principal = categorias.find((c) => c.id == form.categoria_principal);
    return principal?.subcategorias || [];
  })();

  /* ── Quando muda a categoria principal, reseta subcategoria ── */
  const handleCategoriaPrincipal = (id) => {
    setForm({ ...form, categoria_principal: id, categoria_id: '' });
  };

  /* ════════════════════════════════════════════════════════
     UPLOAD DE IMAGENS — redimensiona pra 800x800 max,
     JPEG q=0.82 (~150KB cada)
     ════════════════════════════════════════════════════════ */
  const redimensionarImagem = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let { width, height } = img;
        // Mantém proporção
        if (width > height) {
          if (width > MAX) { height = (height * MAX) / width; width = MAX; }
        } else {
          if (height > MAX) { width = (width * MAX) / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // RNF19 — Limites
    if (imagens.length + files.length > MAX_IMAGENS) {
      setErroGlobal(`Você pode enviar no máximo ${MAX_IMAGENS} imagens. Já tem ${imagens.length}.`);
      return;
    }

    setErroGlobal('');

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setErroGlobal('Aceitamos apenas imagens (JPEG, PNG ou WebP).');
        continue;
      }
      // Limite original de 5MB por arquivo (RNF19)
      if (file.size > 5 * 1024 * 1024) {
        setErroGlobal(`A imagem "${file.name}" passa de 5MB. Tente uma menor.`);
        continue;
      }
      try {
        const base64 = await redimensionarImagem(file);
        setImagens((prev) => [...prev, base64]);
      } catch {
        setErroGlobal('Erro ao processar uma das imagens.');
      }
    }

    // Limpa o input pra poder enviar a mesma imagem de novo se quiser
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removerImagem = (index) => {
    setImagens(imagens.filter((_, i) => i !== index));
  };

  /* ════════════════════════════════════════════════════════
     VALIDAÇÃO
     ════════════════════════════════════════════════════════ */
  const validar = () => {
    if (!form.titulo.trim() || form.titulo.trim().length < MIN_TITULO)
      return `Título precisa ter pelo menos ${MIN_TITULO} caracteres.`;
    if (form.titulo.length > MAX_TITULO)
      return `Título muito longo (máximo ${MAX_TITULO} caracteres).`;
    if (!form.descricao.trim() || form.descricao.trim().length < MIN_DESCRICAO)
      return `Descrição precisa ter pelo menos ${MIN_DESCRICAO} caracteres.`;
    if (!form.estado_conservacao)
      return 'Selecione o estado de conservação.';
    if (!form.categoria_principal)
      return 'Selecione uma categoria.';

    // Se a categoria principal tem subcategorias, exige seleção
    const principal = categorias.find((c) => c.id == form.categoria_principal);
    if (principal?.subcategorias?.length > 0 && !form.categoria_id)
      return 'Selecione uma subcategoria.';

    const precoNum = precoParaNumero(form.preco);
    if (!precoNum || precoNum <= 0)
      return 'Informe um preço válido (maior que zero).';
    if (precoNum > 999999.99)
      return 'Preço muito alto. Máximo: R$ 999.999,99.';

    const cepNumeros = form.cep.replace(/\D/g, '');
    if (cepNumeros.length !== 8)
      return 'Informe um CEP válido (8 dígitos).';

    if (!form.bairro)
      return 'Selecione o bairro.';

    if (imagens.length === 0)
      return 'Envie pelo menos 1 foto do produto.';

    return null;
  };

  /* ════════════════════════════════════════════════════════
     SUBMIT
     ════════════════════════════════════════════════════════ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErroGlobal('');

    const erro = validar();
    if (erro) {
      setErroGlobal(erro);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Se tem subcategoria selecionada, usa ela; senão, usa a principal
    const categoria_id_final = form.categoria_id || form.categoria_principal;

    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/api/anuncios${editando ? `/${id}` : ''}`, {
        method: editando ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('sd_token')}`,
        },
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          preco: precoParaNumero(form.preco),
          aceita_troca: form.aceita_troca,
          estado_conservacao: form.estado_conservacao,
          categoria_id: parseInt(categoria_id_final),
          cep: form.cep.replace(/\D/g, ''),
          bairro: form.bairro,
          imagens,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErroGlobal(dados.erro || `Erro ao ${editando ? 'salvar' : 'publicar'} anúncio.`);
        setEnviando(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (editando) {
        navigate(`/anuncio/${id}`);
      } else {
        setSubmitted(dados.anuncio);
      }
    } catch (err) {
      console.error(err);
      setErroGlobal('Erro ao conectar com o servidor.');
      setEnviando(false);
    }
  };

  // ── Renderização ──
  if (carregando) {
    return (
      <div className="anunciar-wrapper">
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Carregando...
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     TELA DE SUCESSO
     ════════════════════════════════════════════════════════ */
  if (submitted) {
    return (
      <div className="anunciar-wrapper">
        <SiteHeader />

        <div className="anunciar-container">
          <div className="anunciar-card">
            <div className="success-state">
              <div className="success-emoji">🎉</div>
              <h2>Seu anúncio está <em>no ar</em>!</h2>
              <p>
                "<strong>{submitted.titulo}</strong>" já está visível para vizinhos
                de Santo Amaro. Você receberá uma notificação assim que alguém
                tiver interesse.
              </p>
              <div className="success-actions">
                <Link to="/" className="btn-anunciar-cancel">Ver na home</Link>
                <Link to="/perfil" className="btn-anunciar-publish">
                  Ir para meu perfil →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     FORMULÁRIO PRINCIPAL
     ════════════════════════════════════════════════════════ */
  const tituloLen = form.titulo.length;
  const descLen   = form.descricao.length;
  const tituloCounterClass = tituloLen > MAX_TITULO * 0.9
    ? (tituloLen >= MAX_TITULO ? 'error' : 'warning') : '';
  const descCounterClass = descLen > MAX_DESCRICAO * 0.9
    ? (descLen >= MAX_DESCRICAO ? 'error' : 'warning') : '';

  return (
    <div className="anunciar-wrapper">

      {/* Header */}
      <SiteHeader>
        <NavBackButton to="/perfil">Voltar para meu perfil</NavBackButton>
      </SiteHeader>

      <div className="anunciar-container">

        <div className="anunciar-header">
          {editando ? (
            <>
              <h1>Editar <em>anúncio</em></h1>
              <p>Atualize as informações do seu anúncio.</p>
            </>
          ) : (
            <>
              <h1>Criar <em>anúncio</em></h1>
              <p>Transforme o que você não usa em renda extra. Vizinhos de Santo Amaro estão à procura.</p>
            </>
          )}
        </div>

        <div className="anunciar-card">

          {/* Erro global */}
          {erroGlobal && (
            <div className="anunciar-alert error">
              ⚠️ <strong>{erroGlobal}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit} className="anunciar-form" noValidate>

            {/* ════ SEÇÃO 1 — Sobre o produto ════ */}
            <div className="anunciar-section">
              <div className="anunciar-section-title">
                <span className="anunciar-section-num">1</span>
                <h2>Sobre o produto</h2>
              </div>

              <div className="anunciar-field">
                <label className="anunciar-field-label">
                  Título <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="anunciar-input"
                  placeholder="Ex: Sofá 3 lugares veludo verde, em ótimo estado"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value.slice(0, MAX_TITULO) })}
                  maxLength={MAX_TITULO}
                  required
                />
                <div className={`char-counter ${tituloCounterClass}`}>
                  {tituloLen}/{MAX_TITULO}
                </div>
              </div>

              <div className="anunciar-field">
                <label className="anunciar-field-label">
                  Descrição <span className="required">*</span>
                </label>
                <textarea
                  className="anunciar-textarea"
                  placeholder="Descreva o produto em detalhes: características, motivo da venda, possíveis defeitos. Quanto mais detalhe, melhor!"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value.slice(0, MAX_DESCRICAO) })}
                  maxLength={MAX_DESCRICAO}
                  required
                />
                <div className={`char-counter ${descCounterClass}`}>
                  {descLen}/{MAX_DESCRICAO}
                </div>
              </div>

              <div className="anunciar-field">
                <label className="anunciar-field-label">
                  Estado de conservação <span className="required">*</span>
                </label>
                <div className="estado-grid">
                  {ESTADOS_CONSERVACAO.map((e) => (
                    <div key={e.value}
                      className={`estado-option${form.estado_conservacao === e.value ? ' selected' : ''}`}
                      onClick={() => setForm({ ...form, estado_conservacao: e.value })}>
                      <span className="estado-option-emoji">{e.emoji}</span>
                      <span className="estado-option-name">{e.name}</span>
                      <span className="estado-option-desc">{e.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ════ SEÇÃO 2 — Categoria ════ */}
            <div className="anunciar-section">
              <div className="anunciar-section-title">
                <span className="anunciar-section-num">2</span>
                <h2>Categoria</h2>
              </div>

              <div className="anunciar-row">
                <div className="anunciar-field">
                  <label className="anunciar-field-label">
                    Categoria principal <span className="required">*</span>
                  </label>
                  <div className="anunciar-select-wrap">
                    <select className="anunciar-select"
                      value={form.categoria_principal}
                      onChange={(e) => handleCategoriaPrincipal(e.target.value)}
                      required>
                      <option value="">Selecione...</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="anunciar-field">
                  <label className="anunciar-field-label">
                    Subcategoria
                    {subcategorias.length > 0 && <span className="required">*</span>}
                  </label>
                  <div className="anunciar-select-wrap">
                    <select className="anunciar-select"
                      value={form.categoria_id}
                      onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
                      disabled={subcategorias.length === 0}
                      required={subcategorias.length > 0}>
                      <option value="">
                        {subcategorias.length === 0
                          ? 'Selecione uma categoria primeiro'
                          : 'Selecione...'}
                      </option>
                      {subcategorias.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ════ SEÇÃO 3 — Preço ════ */}
            <div className="anunciar-section">
              <div className="anunciar-section-title">
                <span className="anunciar-section-num">3</span>
                <h2>Preço</h2>
              </div>

              <div className="anunciar-row">
                <div className="anunciar-field">
                  <label className="anunciar-field-label">
                    Preço <span className="required">*</span>
                  </label>
                  <div className="anunciar-input-prefix-wrap">
                    <span className="anunciar-input-prefix">R$</span>
                    <input type="text" className="anunciar-input"
                      placeholder="0,00" value={form.preco}
                      onChange={(e) => formatPreco(e.target.value)}
                      required />
                  </div>
                  <span className="anunciar-field-hint">Use vírgula para os centavos. Ex: 89,90</span>
                </div>

                <div className="anunciar-field">
                  <label className="anunciar-field-label">Aceita troca?</label>
                  <div className="troca-toggle"
                    onClick={() => setForm({ ...form, aceita_troca: !form.aceita_troca })}>
                    <div className={`checkbox-custom${form.aceita_troca ? ' checked' : ''}`} />
                    <div className="troca-toggle-text">
                      <strong>Aceito propostas de troca</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ════ SEÇÃO 4 — Localização [RN01] ════ */}
            <div className="anunciar-section">
              <div className="anunciar-section-title">
                <span className="anunciar-section-num">4</span>
                <h2>Localização</h2>
              </div>

              <div className="anunciar-alert info" style={{ marginBottom: '1rem' }}>
                📍 <span>O Santo Desapego é hiperlocal — só aceitamos anúncios de Santo Amaro e bairros vizinhos da zona sul de SP.</span>
              </div>

              <div className="anunciar-row">
                <div className="anunciar-field">
                  <label className="anunciar-field-label">
                    CEP <span className="required">*</span>
                  </label>
                  <input type="text" className="anunciar-input"
                    placeholder="04000-000" value={form.cep}
                    onChange={(e) => setForm({ ...form, cep: maskCEP(e.target.value) })}
                    maxLength={9} required />
                  <span className="anunciar-field-hint">CEPs aceitos: 04600-000 a 04799-999.</span>
                </div>

                <div className="anunciar-field">
                  <label className="anunciar-field-label">
                    Bairro <span className="required">*</span>
                  </label>
                  <div className="anunciar-select-wrap">
                    <select className="anunciar-select"
                      value={form.bairro}
                      onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                      required>
                      <option value="">Selecione...</option>
                      {['Santo Amaro Centro','Campo Belo','Brooklin','Granja Julieta','Jardim Marajoara','Vila Cruzeiro','Vila Mascote','Vila Sofia','Outro bairro'].map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ════ SEÇÃO 5 — Imagens [RF11] ════ */}
            <div className="anunciar-section">
              <div className="anunciar-section-title">
                <span className="anunciar-section-num">5</span>
                <h2>Fotos do produto</h2>
              </div>

              <div className="imagens-grid">
                {imagens.map((img, i) => (
                  <div key={i} className="imagem-slot">
                    <img src={img} alt={`Foto ${i + 1}`} />
                    {i === 0 && <span className="imagem-slot-principal">PRINCIPAL</span>}
                    <button type="button" className="imagem-slot-remove"
                      onClick={() => removerImagem(i)} title="Remover">
                      ×
                    </button>
                  </div>
                ))}

                {imagens.length < MAX_IMAGENS && (
                  <label className="imagem-add">
                    <span className="imagem-add-icon">📷</span>
                    <span className="imagem-add-text">
                      {imagens.length === 0 ? 'Adicionar fotos' : 'Mais uma'}
                    </span>
                    <input ref={fileInputRef} type="file" accept="image/*"
                      multiple onChange={handleFiles} />
                  </label>
                )}
              </div>

              <div className="imagens-hint">
                <strong>{imagens.length}/{MAX_IMAGENS}</strong> imagens.
                A primeira foto será a principal. Use boas fotos com luz natural — anúncios com fotos de qualidade vendem 3x mais rápido.
              </div>
            </div>

            {/* ════ AÇÕES ════ */}
            <div className="anunciar-actions">
              <Link to="/perfil" className="btn-anunciar-cancel">Cancelar</Link>
              <button type="submit" className="btn-anunciar-publish" disabled={enviando}>
                {editando
                  ? (enviando ? 'Salvando...' : 'Salvar alterações →')
                  : (enviando ? 'Publicando...' : 'Publicar anúncio →')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Anunciar;
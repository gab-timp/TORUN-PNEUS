/* ---------------- CRM Atacado e Encomenda (dentro do Sem Venda), etapa 1 ---------------- */
/* Hoje, Clientes (lista e kanban do Atacado), ficha do cliente, registrar ligação e adicionar à carteira.
   Dados nas tabelas crm_* (sql/crm_nucleo.sql); quem enxerga o quê é decidido pelo banco (RLS) a partir do
   papel gravado em Administração > Usuários. Carrega antes do app.js (como o semvenda.js) e usa os helpers
   dele (sb, toast, confirmModal, escapeHtml, escapeAttr, formatDateBR, todayISO, diasDesde, dataMaisDias,
   selectTudoPaginado, currentUser*, setView), que só são resolvidos na hora da chamada. */

const CRM_SISTEMAS = { atacado: "Atacado", encomenda: "Encomenda" };
const CRM_PAPEL_LABEL = { executivo: "Executivo", financeiro: "Financeiro", gestao: "Gestão / Direção" };
const CRM_RESULTADOS = ["Não atendeu", "Pediu retorno", "Interesse", "Estimativa enviada", "Fechou negócio", "Sem interesse"];
const CRM_RESULTADO_PILL = {
  "Não atendeu": "pill-neutro", "Pediu retorno": "pill-atencao", "Interesse": "crm-pill-int",
  "Estimativa enviada": "pill-baixo", "Fechou negócio": "pill-normal", "Sem interesse": "pill-esgotado"
};
// Pediu retorno, Interesse e Estimativa enviada pedem a data do próximo follow-up (o banco confere também)
const CRM_EXIGE_RETORNO = ["Pediu retorno", "Interesse", "Estimativa enviada"];
// etapa que a tela sugere ao escolher o resultado; Não atendeu e Pediu retorno mantêm a etapa atual
const CRM_ETAPA_SUGERIDA = { "Interesse": "Em negociação", "Estimativa enviada": "Estimativa enviada", "Fechou negócio": "Fechado", "Sem interesse": "Declinou" };
const CRM_ETAPAS = [
  { nome: "Primeiro contato", accent: "#6366F1", deep: "#4338CA", pale: "#E7E7FE" },
  { nome: "Estimativa enviada", accent: "#FF6A13", deep: "#C64F0C", pale: "#FFE7D6" },
  { nome: "Em negociação", accent: "#2563EB", deep: "#1D4FA8", pale: "#E4EEFD" },
  { nome: "Fechamento", accent: "#D97706", deep: "#92650A", pale: "#FBF3D5" },
  { nome: "Fechado", accent: "#22C55E", deep: "#15803D", pale: "#E1F8E8" },
  { nome: "Declinou", accent: "#DC2626", deep: "#991B1B", pale: "#FDE6E6" }
];
const CRM_RECARGA_MIN_MS = 3000;
const CRM_ATALHOS_FU = [["Amanhã", 1], ["Em 3 dias", 3], ["Em 1 semana", 7], ["Em 2 semanas", 14]];

let crmPapel = null;    // 'executivo' | 'financeiro' | 'gestao' | null (cadastro do usuário)
let crmTemCarteira = false; // gestão com carteira própria (user_roles.crm_tem_carteira)
let crmSistemas = [];   // ['atacado', 'encomenda'] (só do executivo: pode ter um ou os dois)

const crmState = { carteira: [], contatos: [], ligacoes: [], historico: [], perfis: new Map(), filiais: [], pneus: [], perfilIndisponivel: false, clientes: new Map(), clientesIndisponivel: false, prospectsDisponivel: false, representantesDisponivel: false };
let crmIdx = { lig: new Map(), cont: new Map(), hist: new Map() };
const crmUi = { sistema: "atacado", modo: "lista", fichaId: null, fichaAba: "atividade", escopo: "todas" };
let crmUltimaCarga = 0;
let crmCargaEmAndamento = null;
let crmSortables = [];

/* ---------------- perfil e acesso ---------------- */

function crmDefinirPerfil(r) {
  crmPapel = (r && r.crm_papel) || null;
  crmTemCarteira = !!(r && r.crm_tem_carteira);
  // a lista nova (user_roles.crm_sistemas); sem ela vale o sistema único de antes
  const lista = r && Array.isArray(r.crm_sistemas) ? r.crm_sistemas : (r && r.crm_sistema ? [r.crm_sistema] : []);
  crmSistemas = Object.keys(CRM_SISTEMAS).filter(k => lista.includes(k));
}

// administrador sem papel marcado conta como gestão (mesma regra de current_user_crm_papel() no banco)
function crmPapelEfetivo() {
  return crmPapel || (currentUserIsAdmin ? "gestao" : null);
}
function temAcessoCrm() { return currentUserIsAdmin || !!crmPapelEfetivo(); }
function crmEhExecutivo() { return crmPapelEfetivo() === "executivo"; }
function crmPodeEscrever() { return currentUserRole !== "viewer"; }
// gestão que ligou a carteira própria: lê tudo e tem clientes dela, onde registra ligação
function crmGestaoComCarteira() { return crmPapelEfetivo() === "gestao" && crmTemCarteira; }
function crmTemCarteiraPropria() { return crmEhExecutivo() || crmGestaoComCarteira(); }
const crmMeuId = () => (currentUser ? currentUser.id : null);
function crmEhMinha(c) { return crmGestaoComCarteira() && c.executivoId === crmMeuId(); }
function crmPodeRegistrarLigacao() { return crmTemCarteiraPropria() && crmPodeEscrever(); }
// executivo só enxerga a própria carteira; a gestão só registra nos clientes em que é a responsável
function crmPodeLigarPara(c) { return crmPodeEscrever() && !crmEhRepresentante(c.cliente) && (crmEhExecutivo() || crmEhMinha(c)); }
// Metas (Gestão > Metas): só a gestão do CRM (administrador sem papel conta como gestão)
function crmPodeVerMetas() { return currentUserIsAdmin || crmPapelEfetivo() === "gestao"; }
function crmPodeGerirCarteira() { return ["executivo", "gestao"].includes(crmPapelEfetivo()) && crmPodeEscrever(); }

function crmSistemasVisiveis() {
  const p = crmPapelEfetivo();
  if (currentUserIsAdmin) return ["atacado", "encomenda"]; // administrador abre os dois sistemas, mesmo com um papel marcado para teste
  if (p === "executivo") return crmSistemas.slice();
  return p ? ["atacado", "encomenda"] : [];
}

function crmSistemaAtual() {
  const vis = crmSistemasVisiveis();
  if (!vis.includes(crmUi.sistema)) crmUi.sistema = vis[0] || "atacado";
  return crmUi.sistema;
}

function crmTemKanban() { return crmSistemaAtual() === "atacado"; }

// chamado pelo aplicarSistema do semvenda.js ao entrar em Atacado ou Encomenda: o sistema aberto vale pra todas as telas
function crmEntrarNoSistema(sistema) {
  crmAplicarMenuGestao();
  crmUi.sistema = sistema;
  crmUi.modo = "lista";
  crmUi.fichaId = null;
  ["crmCliBusca", "crmCliTipo", "crmCliSituacao", "crmCliExecutivo", "crmCliRepresentante"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// grupo Gestão do menu: Metas para a gestão do CRM, Administração (já admin-only) para o administrador
function crmAplicarMenuGestao() {
  const metas = document.getElementById("crmNavMetas");
  if (metas) metas.style.display = crmPodeVerMetas() ? "" : "none";
  const fin = document.getElementById("crmGrupoFinanceiro");
  if (fin) fin.style.display = typeof crmPodeVerFaturamento === "function" && crmPodeVerFaturamento() ? "" : "none";
  const grupo = document.getElementById("crmGrupoGestao");
  if (grupo) grupo.style.display = crmPodeVerMetas() || currentUserIsAdmin ? "" : "none";
}

// quem tem carteira própria começa em Hoje; gestão e financeiro, na lista de clientes
function crmViewInicial() {
  return crmTemCarteiraPropria() ? "crm-hoje" : "crm-clientes";
}

/* ---------------- dados ---------------- */

const crmChave = (sistema, cliente) => sistema + "|" + cliente;

function crmCarteiraFromRow(r) {
  return {
    id: r.id, sistema: r.sistema, cliente: r.cliente, executivoId: r.executivo_user_id, executivoNome: r.executivo_nome || "",
    etapa: r.etapa || null, etapaDesde: r.etapa_desde || null, primeiroFollowup: r.primeiro_followup || null,
    tambemOutro: !!r.tambem_outro_sistema, createdAt: r.created_at
  };
}
function crmContatoFromRow(r) {
  return {
    id: r.id, sistema: r.sistema, cliente: r.cliente, nome: r.nome, cargo: r.cargo || "", telefone: r.telefone || "",
    whatsapp: r.whatsapp || "", email: r.email || "", principal: !!r.principal, createdAt: r.created_at
  };
}
function crmLigacaoFromRow(r) {
  return {
    id: r.id, sistema: r.sistema, cliente: r.cliente, contatoNome: r.contato_nome || "", resultado: r.resultado,
    observacao: r.observacao || "", proximoFollowup: r.proximo_followup || null, etapaPara: r.etapa_para || null,
    executivoId: r.executivo_user_id, executivoNome: r.executivo_nome || "", createdAt: r.created_at
  };
}
// cadastro próprio do CRM (sql/crm_clientes.sql); os campos têm o mesmo nome dos clientes do Torun
function crmClienteFromRow(r) {
  return {
    id: r.id, nome: r.nome, tipoPessoa: r.tipo_pessoa || "", documento: r.documento || "", razaoSocial: r.razao_social || "",
    contato: r.contato || "", telefone: r.telefone || "", email: r.email || "", cep: r.cep || "", endereco: r.endereco || "",
    cidade: r.cidade || "", estado: r.estado || "", limiteCredito: r.limite_credito != null ? Number(r.limite_credito) : null,
    origem: r.origem,
    // sql/crm_prospects.sql: sem a coluna, todo cadastro é cliente efetivo
    tipo: r.tipo === "prospect" ? "prospect" : r.tipo === "representante" ? "representante" : "cliente", representante: r.representante || null, origemLead: r.origem_lead || "", interesseTipos: r.interesse_tipos || [],
    observacao: r.observacao || ""
  };
}
function crmHistFromRow(r) {
  return { id: r.id, sistema: r.sistema, cliente: r.cliente, de: r.de || null, para: r.para || null, origem: r.origem, porNome: r.por_nome || "", quando: r.quando };
}

function crmReindexar() {
  const agrupar = (lista, ordenar) => {
    const m = new Map();
    lista.forEach(x => {
      const k = crmChave(x.sistema, x.cliente);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    m.forEach(arr => arr.sort(ordenar));
    return m;
  };
  crmIdx.lig = agrupar(crmState.ligacoes, (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  crmIdx.cont = agrupar(crmState.contatos, (a, b) => (Number(b.principal) - Number(a.principal)) || (a.createdAt || "").localeCompare(b.createdAt || ""));
  crmIdx.hist = agrupar(crmState.historico, (a, b) => (b.quando || "").localeCompare(a.quando || ""));
}

// Uma carga por vez e no máximo uma a cada 3s (mesmo esquema do Sem Venda). Sem realtime: recarrega ao abrir a tela.
function crmCarregar(forcar) {
  if (crmCargaEmAndamento) return crmCargaEmAndamento;
  if (!forcar && Date.now() - crmUltimaCarga < CRM_RECARGA_MIN_MS) return Promise.resolve(true);
  crmUltimaCarga = Date.now();
  crmCargaEmAndamento = (async () => {
    const [cart, cont, lig, hist] = await Promise.all([
      sb.from("crm_carteira").select("*").order("cliente"),
      sb.from("crm_contatos").select("*").order("created_at"),
      selectTudoPaginado("crm_ligacoes", "created_at"),
      selectTudoPaginado("crm_etapa_historico", "quando")
    ]);
    const erro = cart.error || cont.error || lig.error || hist.error;
    if (erro) {
      toast("Erro ao carregar o CRM: " + erro.message);
      return false;
    }
    crmState.carteira = (cart.data || []).map(crmCarteiraFromRow);
    crmState.contatos = (cont.data || []).map(crmContatoFromRow);
    crmState.ligacoes = (lig.data || []).map(crmLigacaoFromRow);
    crmState.historico = (hist.data || []).map(crmHistFromRow);
    crmReindexar();
    await crmCarregarClientes();
    await crmCarregarPerfis();
    return true;
  })().finally(() => { crmCargaEmAndamento = null; });
  return crmCargaEmAndamento;
}

/* ---------------- helpers de leitura ---------------- */

function crmCarteiraPorId(id) { return crmState.carteira.find(c => c.id === id) || null; }
function crmLigacoesDe(c) { return crmIdx.lig.get(crmChave(c.sistema, c.cliente)) || []; }
function crmContatosDe(c) { return crmIdx.cont.get(crmChave(c.sistema, c.cliente)) || []; }
function crmHistoricoDe(c) { return crmIdx.hist.get(crmChave(c.sistema, c.cliente)) || []; }

// Cadastro do cliente no CRM. Enquanto o SQL do cadastro próprio não rodou, a carteira ainda aponta para os clientes do Torun.
async function crmCarregarClientes() {
  const r = await selectTudoPaginado("crm_clientes", "nome");
  if (r.error) {
    crmState.clientesIndisponivel = true;
    crmState.clientes = new Map();
    console.warn("Cadastro de clientes do CRM indisponível:", r.error.message);
    return;
  }
  crmState.clientesIndisponivel = false;
  crmState.clientes = new Map((r.data || []).map(x => [x.nome, crmClienteFromRow(x)]));
  // a escolha prospect/cliente só aparece depois que o SQL criou a coluna "tipo" (consulta à parte: vale mesmo com a tabela vazia)
  const col = await sb.from("crm_clientes").select("tipo").limit(1);
  crmState.prospectsDisponivel = !col.error;
  // a opção Representante só aparece depois que o SQL criou a coluna "representante"
  const colRep = await sb.from("crm_clientes").select("representante").limit(1);
  crmState.representantesDisponivel = !colRep.error;
}

function crmEhProspect(nome) { const c = crmState.clientes.get(nome); return !!c && c.tipo === "prospect"; }
// representante: agrupador de clientes, sem ligação nem follow-up (sql/crm_representantes.sql)
function crmEhRepresentante(nome) { const c = crmState.clientes.get(nome); return !!c && c.tipo === "representante"; }
function crmRepresentanteDe(nome) { const c = crmState.clientes.get(nome); return c && c.representante ? c.representante : null; }
function crmTipoDe(nome) { return crmEhRepresentante(nome) ? "representante" : crmEhProspect(nome) ? "prospect" : "cliente"; }
// carteira dos clientes que vêm por um representante, no sistema aberto
function crmClientesDoRepresentante(nome, sistema) {
  return crmState.carteira.filter(c => c.sistema === sistema && crmRepresentanteDe(c.cliente) === nome);
}
// representantes que a pessoa enxerga no sistema aberto (executivo só enxerga os da própria carteira, pelo RLS)
function crmRepresentantesDoSistema(sistema) {
  return crmState.carteira.filter(c => c.sistema === sistema && crmEhRepresentante(c.cliente));
}
// selo ao lado do nome; sem o SQL dos prospects não aparece nada. Cliente que vem por representante ganha o selo "via ..."
function crmTipoSelo(nome) {
  if (!crmState.prospectsDisponivel) return "";
  if (crmEhRepresentante(nome)) return '<span class="crm-selo crm-selo-rep">Representante</span>';
  const base = crmEhProspect(nome) ? '<span class="crm-selo crm-selo-pro">Prospect</span>' : '<span class="crm-selo">Cliente</span>';
  const via = crmRepresentanteDe(nome);
  return via ? base + ' <span class="crm-selo crm-selo-via">via ' + escapeHtml(via) + '</span>' : base;
}

function crmInfoCliente(nome) {
  const c = crmState.clientes.get(nome);
  if (c) return c;
  return crmState.clientesIndisponivel ? (state.clientes || []).find(x => x.nome === nome) || {} : {};
}

function crmCidadeUF(nome) {
  const cli = crmInfoCliente(nome);
  return [cli.cidade, cli.estado].filter(Boolean).join("/");
}

function crmDiaLocal(ts) {
  const d = new Date(ts);
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function crmHoraLocal(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function crmDataCurta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y === todayISO().slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y}`;
}

// última ligação e próximo follow-up: quem manda é a ÚLTIMA ligação; sem ligação nenhuma vale a data da entrada na carteira
function crmResumo(c) {
  const l = crmLigacoesDe(c);
  const ultima = l[0] || null;
  return { ultima, fu: ultima ? ultima.proximoFollowup : c.primeiroFollowup, total: l.length };
}

function crmPill(resultado) {
  return `<span class="status-pill ${CRM_RESULTADO_PILL[resultado] || "pill-neutro"}">${escapeHtml(resultado)}</span>`;
}

function crmUltimaHtml(r) {
  return r.ultima
    ? `<span class="mono">${crmDataCurta(crmDiaLocal(r.ultima.createdAt))}</span> ${crmPill(r.ultima.resultado)}`
    : `<span class="muted">Nunca ligado</span>`;
}

// selo do follow-up: atrasado (há N dias), hoje ou nada (data futura ou sem data)
function crmFollowupSelo(fu) {
  if (!fu) return "";
  const dif = diasDesde(fu); // positivo = no passado
  if (dif > 0) return `<span class="status-pill pill-esgotado">há ${dif} ${dif === 1 ? "dia" : "dias"}</span>`;
  if (dif === 0) return `<span class="status-pill pill-neutro">hoje</span>`;
  return "";
}

function crmFollowupHtml(fu) {
  if (!fu) return `<span class="muted">sem data</span>`;
  return `<span class="mono ${diasDesde(fu) > 0 ? "crm-fu-atrasado" : ""}">${crmDataCurta(fu)}</span> ${crmFollowupSelo(fu)}`;
}

// contato principal; sem contato cadastrado no CRM, cai nos dados do cadastro do cliente no Torun
function crmContatoRapido(c) {
  const p = crmContatosDe(c)[0];
  if (p) return { nome: p.nome, cargo: p.cargo, telefone: p.telefone, whatsapp: p.whatsapp, email: p.email };
  const cli = crmInfoCliente(c.cliente);
  return { nome: cli.contato || "", cargo: "", telefone: cli.telefone || "", whatsapp: "", email: cli.email || "" };
}

const crmDigitos = s => String(s || "").replace(/\D/g, "");

// abre a conversa no WhatsApp Web (mensagens); a ligação de voz é feita no WhatsApp Desktop, fora do sistema
function crmLinkWhats(numero) {
  let d = crmDigitos(numero);
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return "https://wa.me/" + d;
}

// atalhos de contato: botão quadrado só com ícone (nome no tooltip e no leitor de tela)
// copiar = { texto, rotulo, soCopia }: o clique também copia o texto; soCopia: no computador não segue o link (tel: não abre nada ali)
function crmAtalhoIcone(href, icone, rotulo, ct, externo, copiar) {
  const nome = ct && ct.nome ? ` ${escapeAttr(ct.nome)}` : "";
  const alvo = externo ? ' target="_blank" rel="noopener"' : "";
  const cop = copiar ? ` data-crmcopiar="${escapeAttr(copiar.texto)}" data-crmcopiarrot="${escapeAttr(copiar.rotulo)}"${copiar.soCopia ? ' data-crmsocopia="1"' : ""}` : "";
  return `<a class="crm-ico" href="${escapeAttr(href)}"${alvo}${cop} title="${rotulo}" aria-label="${rotulo}${nome ? " —" + nome : ""}"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-${icone}"/></svg></a>`;
}
function crmAtalhosHtml(ct) {
  const partes = [];
  // no computador o telefone só copia o número (para discar onde preferir); no celular o toque segue para a ligação
  if (crmDigitos(ct.telefone)) partes.push(crmAtalhoIcone("tel:" + crmDigitos(ct.telefone), "fone", "Ligar (copia o número)", ct, false, { texto: ct.telefone, rotulo: "Telefone", soCopia: true }));
  const wa = crmLinkWhats(ct.whatsapp || ct.telefone);
  if (wa) partes.push(crmAtalhoIcone(wa, "whats", "WhatsApp (abre o WhatsApp Web e copia o número)", ct, true, { texto: ct.whatsapp || ct.telefone, rotulo: "WhatsApp" }));
  // abre a janela de novo e-mail direto no Gmail (sem depender do programa de e-mail do computador) e copia o endereço
  // do contato (o decisor, que vem primeiro), para colar onde precisar
  // authuser: abre na conta do Gmail igual ao e-mail de login de quem está usando (o Google escolheria a conta padrão do navegador)
  const conta = currentUser && currentUser.email ? "authuser=" + encodeURIComponent(currentUser.email) + "&" : "";
  if (ct.email) partes.push(crmAtalhoIcone("https://mail.google.com/mail/?" + conta + "view=cm&fs=1&to=" + encodeURIComponent(ct.email), "email", "E-mail (abre o Gmail e copia o endereço)", ct, true, { texto: ct.email, rotulo: "E-mail" }));
  return partes.join(" ");
}

/* ---------------- entrada nas telas ---------------- */

async function crmAoAbrirView(view) {
  await crmCarregar(view !== "crm-cliente");
  crmRender();
}

function crmRender() {
  const ativa = document.querySelector(".view.active");
  const id = ativa ? ativa.id : "";
  if (id ==="view-crm-hoje") crmRenderHoje();
  else if (id === "view-crm-clientes") crmRenderClientes();
  else if (id === "view-crm-cliente") crmRenderFicha();
  else if (id === "view-crm-metas") crmRenderMetas();
  else if (id === "view-crm-faturamento" && typeof crmRenderFaturamento === "function") crmRenderFaturamento();
}

/* ---------------- Hoje ---------------- */

function crmLinhaHoje(x) {
  const { c, r } = x;
  const ct = crmContatoRapido(c);
  const acoes = [crmAtalhosHtml(ct)];
  if (crmPodeLigarPara(c)) acoes.push(`<button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>`);
  return `
    <tr>
      <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button> ${crmTipoSelo(c.cliente)}
        <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${r.total === 0 ? (crmEhProspect(c.cliente) ? " · sem ligação ainda" : " · cliente novo") : ""}</div></td>
      <td class="crm-col-exec">${escapeHtml(c.executivoNome || "—")}</td>
      <td>${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">—</span>'}<div class="muted sv-sub">${escapeHtml(ct.cargo)}</div></td>
      <td>${crmUltimaHtml(r)}</td>
      <td>${crmFollowupHtml(r.fu)}</td>
      <td class="crm-acoes">${acoes.filter(Boolean).join(" ")}</td>
    </tr>`;
}

function crmRenderHoje() {
  const s = crmSistemaAtual();
  const soMeus = crmGestaoComCarteira();
  const comExecutivo = !crmEhExecutivo() && !soMeus;
  const hoje = todayISO();
  const mes = hoje.slice(0, 7);
  const itens = crmState.carteira.filter(c => c.sistema === s && !crmEhRepresentante(c.cliente) && (!soMeus || c.executivoId === crmMeuId())).map(c => ({ c, r: crmResumo(c) }));
  const atrasados = itens.filter(x => x.r.fu && x.r.fu < hoje).sort((a, b) => a.r.fu.localeCompare(b.r.fu) || a.c.cliente.localeCompare(b.c.cliente));
  const paraHoje = itens.filter(x => x.r.fu === hoje).sort((a, b) => a.c.cliente.localeCompare(b.c.cliente));
  const ligacoes = crmState.ligacoes.filter(l => l.sistema === s && (!soMeus || l.executivoId === crmMeuId()));
  const feitasHoje = ligacoes.filter(l => crmDiaLocal(l.createdAt) === hoje).length;
  const fechadosMes = ligacoes.filter(l => l.resultado === "Fechou negócio" && crmDiaLocal(l.createdAt).slice(0, 7) === mes).length;

  const d = new Date();
  document.getElementById("crmHojeSub").textContent = `Quem ligar e quem retomar, dos mais atrasados aos de hoje. ${d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}.` +
    (comExecutivo ? " Você vê as carteiras de todos os executivos." : soMeus ? " Só os clientes da sua carteira; as dos outros estão em Clientes." : "");
  document.getElementById("crmHojeKpis").innerHTML = `
    <div class="kpi"><div class="lbl">Para ligar hoje</div><div class="val">${fmt(paraHoje.length)}</div></div>
    <div class="kpi ${atrasados.length ? "crm-alerta" : ""}"><div class="lbl">Follow-ups atrasados</div><div class="val">${fmt(atrasados.length)}</div></div>
    <div class="kpi"><div class="lbl">Ligações feitas hoje</div><div class="val">${fmt(feitasHoje)}</div></div>
    <div class="kpi"><div class="lbl">Negócios fechados no mês</div><div class="val">${fmt(fechadosMes)}</div></div>`;

  document.getElementById("view-crm-hoje").classList.toggle("crm-ve-todos", comExecutivo);
  document.getElementById("crmHojeAtrasados").innerHTML = atrasados.map(crmLinhaHoje).join("");
  document.getElementById("crmHojeAtrasadosVazio").style.display = atrasados.length ? "none" : "block";
  document.getElementById("crmHojeParaHoje").innerHTML = paraHoje.map(crmLinhaHoje).join("");
  document.getElementById("crmHojeParaHojeVazio").style.display = paraHoje.length ? "none" : "block";
  document.getElementById("crmHojeParaHojeData").textContent = `follow-ups marcados para ${crmDataCurta(hoje)}`;
}

/* ---------------- Clientes: lista e kanban ---------------- */

function crmItensFiltrados() {
  const s = crmSistemaAtual();
  const busca = (document.getElementById("crmCliBusca").value || "").trim().toLowerCase();
  const situacao = document.getElementById("crmCliSituacao").value;
  const tipo = crmState.prospectsDisponivel ? document.getElementById("crmCliTipo").value : "";
  const ordem = document.getElementById("crmCliOrdem").value;
  const exec = document.getElementById("crmCliExecutivo").value;
  const hoje = todayISO();
  let itens = crmState.carteira.filter(c => c.sistema === s).map(c => ({ c, r: crmResumo(c) }));
  if (exec) itens = itens.filter(x => x.c.executivoId === exec);
  if (tipo) itens = itens.filter(x => crmTipoDe(x.c.cliente) === tipo);
  const repFiltro = crmState.representantesDisponivel ? document.getElementById("crmCliRepresentante").value : "";
  if (repFiltro === "__sem") itens = itens.filter(x => !crmEhRepresentante(x.c.cliente) && !crmRepresentanteDe(x.c.cliente));
  else if (repFiltro) itens = itens.filter(x => crmRepresentanteDe(x.c.cliente) === repFiltro);
  if (crmGestaoComCarteira() && crmUi.escopo === "minha") itens = itens.filter(x => crmEhMinha(x.c));
  if (busca) {
    itens = itens.filter(x => {
      const ct = crmContatoRapido(x.c);
      return [x.c.cliente, crmCidadeUF(x.c.cliente), ct.nome, x.c.executivoNome].join(" ").toLowerCase().includes(busca);
    });
  }
  if (situacao === "atrasado") itens = itens.filter(x => x.r.fu && x.r.fu < hoje);
  else if (situacao === "sem30") itens = itens.filter(x => !x.r.ultima || diasDesde(crmDiaLocal(x.r.ultima.createdAt)) >= 30);
  const porNome = (a, b) => a.c.cliente.localeCompare(b.c.cliente);
  if (ordem === "nome") itens.sort(porNome);
  else if (ordem === "semligar") {
    // nunca ligado primeiro, depois a ligação mais antiga
    itens.sort((a, b) => (a.r.ultima ? a.r.ultima.createdAt : "").localeCompare(b.r.ultima ? b.r.ultima.createdAt : "") || porNome(a, b));
  } else {
    // próximo follow-up: o mais cedo primeiro, sem data por último
    itens.sort((a, b) => (a.r.fu || "9999").localeCompare(b.r.fu || "9999") || porNome(a, b));
  }
  return itens;
}

function crmLinhaRepresentante(x) {
  const { c } = x;
  const filhos = crmClientesDoRepresentante(c.cliente, c.sistema);
  const atrasados = filhos.filter(f => { const fu = crmResumo(f).fu; return fu && fu < todayISO(); }).length;
  return `
    <tr class="crm-rep-linha ${crmEhMinha(c) ? "crm-minha" : ""}">
      <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button> ${crmTipoSelo(c.cliente)}
        <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${crmCidadeUF(c.cliente) ? " · " : ""}${filhos.length} ${filhos.length === 1 ? "cliente" : "clientes"}${atrasados ? ` · ${atrasados} com follow-up atrasado` : ""}</div></td>
      <td class="crm-col-exec">${crmEhMinha(c) ? '<span class="status-pill pill-normal">Eu</span>' : escapeHtml(c.executivoNome || "—")}</td>
      <td><span class="muted">—</span></td>
      <td><span class="muted sv-sub">Sem ligação: o follow-up é de cada cliente</span></td>
      <td><span class="muted">—</span></td>
      <td class="crm-acoes"></td>
    </tr>`;
}

function crmLinhaCliente(x) {
  const { c, r } = x;
  if (crmEhRepresentante(c.cliente)) return crmLinhaRepresentante(x);
  const ct = crmContatoRapido(c);
  return `
    <tr class="${crmEhMinha(c) ? "crm-minha" : ""}">
      <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button> ${crmTipoSelo(c.cliente)}
        <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${r.total === 0 ? (crmEhProspect(c.cliente) ? " · sem ligação ainda" : " · cliente novo") : ""}</div></td>
      <td class="crm-col-exec">${crmEhMinha(c) ? '<span class="status-pill pill-normal">Eu</span>' : escapeHtml(c.executivoNome || "—")}</td>
      <td>${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">—</span>'}<div class="muted sv-sub">${escapeHtml(ct.cargo)}</div></td>
      <td>${crmUltimaHtml(r)}</td>
      <td>${crmFollowupHtml(r.fu)}</td>
      <td class="crm-acoes">${crmAtalhosHtml(ct)}${crmPodeLigarPara(c) && crmGestaoComCarteira() ? ` <button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>` : ""}</td>
    </tr>`;
}

function crmAtualizarFiltroExecutivo() {
  const sel = document.getElementById("crmCliExecutivo");
  const atual = sel.value;
  const s = crmSistemaAtual();
  const mapa = new Map();
  crmState.carteira.filter(c => c.sistema === s).forEach(c => mapa.set(c.executivoId, c.executivoNome || "(sem nome)"));
  sel.innerHTML = `<option value="">Todos</option>` + Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, nome]) => `<option value="${escapeAttr(id)}">${escapeHtml(nome)}</option>`).join("");
  sel.value = mapa.has(atual) ? atual : "";
}

function crmAtualizarFiltroRepresentante() {
  const campo = document.getElementById("crmCliRepresentanteCampo");
  const sel = document.getElementById("crmCliRepresentante");
  const ativo = crmState.representantesDisponivel;
  campo.style.display = ativo ? "" : "none";
  if (!ativo) return;
  const atual = sel.value;
  const nomes = crmRepresentantesDoSistema(crmSistemaAtual()).map(c => c.cliente).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Todos</option>' + nomes.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("") + '<option value="__sem">Sem representante</option>';
  sel.value = atual === "__sem" || nomes.includes(atual) ? atual : "";
}

function crmRenderClientes() {
  const comExecutivo = !crmEhExecutivo();
  const kanban = crmTemKanban();
  if (!kanban) crmUi.modo = "lista";
  const view = document.getElementById("view-crm-clientes");
  view.classList.toggle("crm-ve-todos", comExecutivo);
  document.getElementById("crmCliExecutivoCampo").style.display = comExecutivo ? "" : "none";
  if (!crmGestaoComCarteira()) crmUi.escopo = "todas";
  document.getElementById("crmEscopoSeg").style.display = crmGestaoComCarteira() ? "" : "none";
  document.querySelectorAll("#crmEscopoSeg button").forEach(b => b.classList.toggle("on", b.dataset.crmescopo === crmUi.escopo));
  document.getElementById("crmModoSeg").style.display = kanban ? "" : "none";
  document.querySelectorAll("#crmModoSeg button").forEach(b => b.classList.toggle("on", b.dataset.crmmodo === crmUi.modo));
  document.getElementById("crmBtnAdicionar").style.display = crmPodeGerirCarteira() ? "" : "none";
  document.getElementById("crmCliSub").textContent = comExecutivo
    ? "A carteira de cada executivo: contato, última ligação e próximo follow-up."
    : "Sua carteira: contato, última ligação e próximo follow-up de cada cliente.";
  crmAtualizarFiltroExecutivo();
  crmAtualizarFiltroRepresentante();
  document.getElementById("crmCliTipoCampo").style.display = crmState.prospectsDisponivel ? "" : "none";

  const itens = crmItensFiltrados();
  const total = crmState.carteira.filter(c => c.sistema === crmSistemaAtual()).length;
  document.getElementById("crmCliRodape").textContent = `${itens.length} de ${total} ${total === 1 ? "cliente" : "clientes"} na carteira`;
  const vazio = document.getElementById("crmCliVazio");
  vazio.style.display = itens.length === 0 ? "block" : "none";
  vazio.textContent = total === 0
    ? (crmPodeGerirCarteira() ? "Nenhum cliente na carteira ainda. Use “+ Adicionar cliente”." : "Nenhum cliente na carteira ainda.")
    : "Nenhum cliente com esses filtros.";

  const lista = crmUi.modo === "lista";
  document.getElementById("crmListaWrap").style.display = lista ? "" : "none";
  document.getElementById("crmKanbanWrap").style.display = lista ? "none" : "";
  if (lista) document.getElementById("crmCliTbody").innerHTML = itens.map(crmLinhaCliente).join("");
  else crmRenderKanban(itens.filter(x => !crmEhRepresentante(x.c.cliente)));
}

/* ---------- kanban do Atacado ---------- */

function crmMontarKanban() {
  const board = document.getElementById("crmBoard");
  board.innerHTML = CRM_ETAPAS.map((e, i) => `
    <div class="kanban-col" style="--col-accent:${e.accent}; --col-deep:${e.deep}; --col-pale:${e.pale};">
      <div class="kanban-col-head"><span>${escapeHtml(e.nome)}</span><span class="kanban-count" id="crmCount${i}">0</span></div>
      <div class="kanban-cards" id="crmCol${i}" data-etapa="${escapeAttr(e.nome)}"></div>
    </div>`).join("");
  initKanbanBoardDragScroll("crmBoard");
  const opcoes = { group: "crm-kanban", animation: 150, filter: "button, a", preventOnFilter: false, onEnd: crmMoverEtapa };
  crmSortables = CRM_ETAPAS.map((_, i) => Sortable.create(document.getElementById("crmCol" + i), opcoes));
  crmSortables.push(Sortable.create(document.getElementById("crmBandejaCards"), { ...opcoes, sort: false }));
}

function crmCartaoKanban(x) {
  const { c, r } = x;
  const ct = crmContatoRapido(c);
  const diasEtapa = c.etapaDesde ? diasDesde(crmDiaLocal(c.etapaDesde)) : null;
  const rodape = `${r.total} ${r.total === 1 ? "ligação" : "ligações"}` +
    (c.etapa && diasEtapa !== null ? ` · há ${diasEtapa} ${diasEtapa === 1 ? "dia" : "dias"} nesta etapa` : "");
  const acoes = [];
  if (crmDigitos(ct.telefone)) acoes.push(crmAtalhoIcone("tel:" + crmDigitos(ct.telefone), "fone", "Ligar (copia o número)", ct, false, { texto: ct.telefone, rotulo: "Telefone", soCopia: true }));
  if (crmPodeLigarPara(c)) acoes.push(`<button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>`);
  return `
    <div class="kanban-card crm-cartao ${crmEhMinha(c) ? "crm-minha-cartao" : ""}" data-id="${escapeAttr(c.id)}">
      <div><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button> ${crmTipoSelo(c.cliente)}</div>
      <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${crmEhExecutivo() ? "" : " · " + escapeHtml(c.executivoNome || "—")}</div>
      <div class="crm-cartao-contato">${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">sem contato</span>'}${ct.cargo ? ` <span class="muted">· ${escapeHtml(ct.cargo)}</span>` : ""}</div>
      <div class="crm-cartao-linha"><span class="crm-rot">Última ligação</span><div>${crmUltimaHtml(r)}</div></div>
      <div class="crm-cartao-linha"><span class="crm-rot">Próximo follow-up</span><div>${crmFollowupHtml(r.fu)}</div></div>
      <div class="crm-cartao-rodape">${escapeHtml(rodape)}</div>
      ${acoes.length ? `<div class="crm-cartao-acoes">${acoes.join(" ")}</div>` : ""}
    </div>`;
}

function crmRenderKanban(itens) {
  if (!document.getElementById("crmCol0")) crmMontarKanban();
  CRM_ETAPAS.forEach((e, i) => {
    const daEtapa = itens.filter(x => x.c.etapa === e.nome);
    document.getElementById("crmCount" + i).textContent = daEtapa.length;
    const col = document.getElementById("crmCol" + i);
    col.innerHTML = daEtapa.length
      ? daEtapa.map(crmCartaoKanban).join("")
      : (i === CRM_ETAPAS.length - 1 ? `<div class="crm-col-vazia">Ninguém declinou. Arraste para cá o cliente que disse não.</div>` : "");
    col.classList.toggle("crm-col-com-aviso", !daEtapa.length);
  });
  const semEtapa = itens.filter(x => !x.c.etapa);
  document.getElementById("crmBandejaCount").textContent = semEtapa.length;
  document.getElementById("crmBandejaCards").innerHTML = semEtapa.map(x => {
    const ct = crmContatoRapido(x.c);
    return `<div class="crm-chip-cliente" data-id="${escapeAttr(x.c.id)}">
      <button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button>
      <span class="muted sv-sub">${escapeHtml(crmCidadeUF(x.c.cliente))}${ct.nome ? " · " + escapeHtml(ct.nome) : ""}</span>
      ${x.r.ultima ? crmPill(x.r.ultima.resultado) : '<span class="muted sv-sub">Nunca ligado</span>'}
    </div>`;
  }).join("");
  const podeMover = crmPodeGerirCarteira();
  crmSortables.forEach(s => s.option("disabled", !podeMover));
}

// Soltar o cartão em outra coluna = mudar a etapa. Soltar na bandeja "Sem etapa" não vale (a tela volta como estava).
async function crmMoverEtapa(evt) {
  const id = evt.item.dataset.id;
  const nova = evt.to.dataset.etapa || null;
  const antiga = evt.from.dataset.etapa || null;
  if (nova === antiga) return;
  const c = crmCarteiraPorId(id);
  if (c && nova) await crmGravarEtapa(c, nova, "kanban");
  crmRender();
}

// Muda a etapa do cliente e registra a mudança no histórico (data e quem mexeu). Devolve true se gravou.
async function crmGravarEtapa(c, nova, origem) {
  const quando = new Date().toISOString();
  const { data, error } = await sb.from("crm_carteira").update({ etapa: nova, etapa_desde: quando }).eq("id", c.id).select();
  if (error) { toast("Erro ao mudar a etapa: " + error.message); return false; }
  if (!data || data.length === 0) { toast("Não foi possível mudar a etapa (sem permissão)."); return false; }
  const de = c.etapa;
  c.etapa = nova;
  c.etapaDesde = quando;
  const h = await sb.from("crm_etapa_historico").insert({
    sistema: c.sistema, cliente: c.cliente, de, para: nova, origem, por_user_id: currentUser.id, por_nome: currentUserNome
  }).select();
  if (h.error) toast("A etapa mudou, mas o histórico não foi gravado: " + h.error.message);
  else if (h.data && h.data[0]) { crmState.historico.push(crmHistFromRow(h.data[0])); crmReindexar(); }
  return true;
}

/* ---------------- Metas (Gestão) ---------------- */
/* Meta anual da equipe + meta individual de cada executivo; a soma das individuais tem que ser igual à da equipe.
   Dados em crm_meta_equipe / crm_meta_executivo (sql/crm_metas.sql); quem grava é a função crm_salvar_metas, que
   confere a soma no banco. Valores em reais inteiros. */

const crmMetas = { ano: null, execs: [], indisponivel: false, salvando: false };

function crmNumMeta(texto) { return Number(String(texto || "").replace(/\D/g, "")) || 0; }
function crmFmtInteiro(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function crmPct(n) { return n.toFixed(1).replace(".", ",") + "%"; }

function crmAnosMeta() {
  const atual = Number(todayISO().slice(0, 4));
  return [atual, atual + 1];
}

async function crmRenderMetas() {
  const corpo = document.getElementById("crmMetasCorpo");
  const selAno = document.getElementById("crmMetasAno");
  if (!corpo || !selAno) return;
  const anos = crmAnosMeta();
  if (!crmMetas.ano || !anos.includes(crmMetas.ano)) crmMetas.ano = anos[0];
  selAno.innerHTML = anos.map(a => `<option value="${a}" ${a === crmMetas.ano ? "selected" : ""}>${a}</option>`).join("");
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando as metas…</div></div>`;
  const ano = crmMetas.ano;
  const [ex, eq, ind] = await Promise.all([
    sb.rpc("crm_executivos_metas"),
    sb.from("crm_meta_equipe").select("valor").eq("ano", ano).maybeSingle(),
    sb.from("crm_meta_executivo").select("executivo_user_id, valor").eq("ano", ano)
  ]);
  if (ano !== crmMetas.ano) return; // trocou de ano enquanto carregava
  if (ex.error || eq.error || ind.error) {
    crmMetas.indisponivel = true;
    corpo.innerHTML = `<div class="card"><div class="empty-state">As metas ainda não estão disponíveis: rode o SQL <b>sql/crm_metas.sql</b> no Supabase. (${escapeHtml((ex.error || eq.error || ind.error).message)})</div></div>`;
    return;
  }
  crmMetas.indisponivel = false;
  const salvos = new Map((ind.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  crmMetas.execs = (ex.data || []).map(e => ({ id: e.user_id, nome: e.nome, sistemas: e.sistemas || [], valor: salvos.get(e.user_id) || 0 }));
  const equipe = eq.data ? Number(eq.data.valor) : 0;
  const podeEditar = crmPodeEscrever();

  const linhas = crmMetas.execs.map((e, i) => `
    <tr>
      <td><div class="crm-nome">${escapeHtml(e.nome)}</div></td>
      <td>${e.sistemas.length ? e.sistemas.map(s => `<span class="crm-selo crm-selo-tor">${escapeHtml(CRM_SISTEMAS[s] || s)}</span>`).join(" ") : '<span class="muted">—</span>'}</td>
      <td class="num"><span class="crm-meta-money"><span>R$</span><input type="text" inputmode="numeric" class="crm-meta-in" data-crmmetaexec="${i}" value="${e.valor ? crmFmtInteiro(e.valor) : ""}" placeholder="0" aria-label="Meta de ${escapeAttr(e.nome)}" ${podeEditar ? "" : "disabled"}></span></td>
      <td><div class="crm-meter"><div class="crm-meter-barra"><i id="crmMetaBarra${i}"></i></div></div><div class="muted sv-sub" id="crmMetaPct${i}"></div></td>
    </tr>`).join("");

  corpo.innerHTML = `
    <div class="card">
      <div class="crm-meta-topo">
        <div><h2>Meta anual da equipe</h2><div class="note">Faturamento de janeiro a dezembro de ${ano}.</div></div>
        <div class="field"><label for="crmMetaEquipe">Meta da equipe</label>
          <span class="crm-meta-money crm-meta-grande"><span>R$</span><input type="text" inputmode="numeric" id="crmMetaEquipe" class="crm-meta-in" value="${equipe ? crmFmtInteiro(equipe) : ""}" placeholder="0" ${podeEditar ? "" : "disabled"}></span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Meta individual de cada executivo</h2><div class="note">A soma das metas individuais tem que bater com a meta da equipe.</div></div>
      ${crmMetas.execs.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Executivo</th><th>Sistemas</th><th class="num">Meta ${ano}</th><th style="width:30%">Parte da meta da equipe</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="2">Soma das metas individuais</td><td class="num" id="crmMetaSoma"></td><td><span class="crm-selo" id="crmMetaStatus"></span></td></tr></tfoot>
      </table></div>` : `<div class="empty-state">Nenhum executivo cadastrado. Marque o papel Executivo em Administração > Usuários.</div>`}
      <div class="crm-meta-rodape">
        <div class="note" id="crmMetaNota"></div>
        <button type="button" class="btn primary" id="crmMetaSalvar" ${podeEditar ? "" : "disabled"}>Salvar metas</button>
      </div>
    </div>`;
  crmAtualizarMetasCalculo();
}

// recalcula soma, barras, aviso e botão sem refazer os campos (o foco não se perde)
function crmAtualizarMetasCalculo() {
  const campoEquipe = document.getElementById("crmMetaEquipe");
  if (!campoEquipe || crmMetas.indisponivel) return;
  const equipe = crmNumMeta(campoEquipe.value);
  const valores = crmMetas.execs.map((e, i) => crmNumMeta(document.querySelector(`[data-crmmetaexec="${i}"]`).value));
  const soma = valores.reduce((a, b) => a + b, 0);
  valores.forEach((v, i) => {
    const p = equipe ? v / equipe * 100 : 0;
    document.getElementById("crmMetaBarra" + i).style.width = Math.min(100, p) + "%";
    document.getElementById("crmMetaPct" + i).textContent = crmPct(p) + " da meta da equipe";
  });
  const dif = equipe - soma;
  const fecha = dif === 0 && equipe > 0 && crmMetas.execs.length > 0;
  const somaEl = document.getElementById("crmMetaSoma");
  if (somaEl) somaEl.textContent = formatMoney(soma);
  const st = document.getElementById("crmMetaStatus");
  if (st) {
    st.className = "crm-selo " + (fecha ? "crm-selo-ok" : dif === 0 ? "" : dif > 0 ? "crm-selo-warn" : "crm-selo-bad");
    st.textContent = fecha ? "Fecha com a equipe" : dif === 0 ? "Informe as metas" : dif > 0 ? `Faltam ${formatMoney(dif)} a distribuir` : `Passou ${formatMoney(-dif)} da meta da equipe`;
  }
  document.getElementById("crmMetaNota").textContent = fecha
    ? "As metas individuais somam a meta da equipe. Pode salvar."
    : "Só dá pra salvar quando a soma das individuais for igual à meta da equipe.";
  document.getElementById("crmMetaSalvar").disabled = !fecha || !crmPodeEscrever() || crmMetas.salvando;
}

async function crmSalvarMetas() {
  if (crmMetas.salvando || crmMetas.indisponivel) return;
  const equipe = crmNumMeta(document.getElementById("crmMetaEquipe").value);
  const individuais = crmMetas.execs.map((e, i) => ({ executivo_user_id: e.id, valor: crmNumMeta(document.querySelector(`[data-crmmetaexec="${i}"]`).value) }));
  crmMetas.salvando = true;
  crmAtualizarMetasCalculo();
  const { error } = await sb.rpc("crm_salvar_metas", { p_ano: crmMetas.ano, p_equipe: equipe, p_individuais: individuais });
  crmMetas.salvando = false;
  if (error) {
    toast("Não foi possível salvar as metas: " + error.message);
    crmAtualizarMetasCalculo();
    return;
  }
  toast("Metas de " + crmMetas.ano + " salvas.");
  crmRenderMetas();
}

function crmMascarar(el) {
  const d = el.value.replace(/\D/g, "");
  el.value = d ? crmFmtInteiro(Number(d)) : "";
}

/* ---------------- ficha do cliente ---------------- */

function crmAbrirFicha(id) {
  if (crmUi.fichaId !== id) crmUi.fichaAba = "atividade";
  crmUi.fichaId = id;
  setView("crm-cliente");
  const item = document.querySelector('#navCrm [data-view="crm-clientes"]');
  if (item) item.classList.add("active");
}

function crmRenderFicha() {
  const raiz = document.getElementById("crmFicha");
  const c = crmCarteiraPorId(crmUi.fichaId);
  if (!c) {
    raiz.innerHTML = `<div class="card"><div class="empty-state">Cliente não encontrado na carteira. <button type="button" class="sv-link" data-crmvoltar="1">Voltar para Clientes</button></div></div>`;
    return;
  }
  if (crmEhRepresentante(c.cliente)) { crmRenderFichaRepresentante(raiz, c); return; }
  const r = crmResumo(c);
  const ligs = crmLigacoesDe(c);
  const contatos = crmContatosDe(c);
  const ct = crmContatoRapido(c);
  const hist = crmHistoricoDe(c);
  const atendidas = ligs.filter(l => l.resultado !== "Não atendeu").length;
  const fechamentos = ligs.filter(l => l.resultado === "Fechou negócio").length;
  const diasEtapa = c.etapaDesde ? diasDesde(crmDiaLocal(c.etapaDesde)) : null;
  const kanban = c.sistema === "atacado";
  const podeMover = crmPodeGerirCarteira();

  const etapaCampo = kanban
    ? `<label class="crm-etapa-campo">Etapa no kanban
        <select id="crmFichaEtapa" ${podeMover ? "" : "disabled"}>
          ${c.etapa ? "" : `<option value="">Sem etapa</option>`}
          ${CRM_ETAPAS.map(e => `<option value="${escapeAttr(e.nome)}" ${c.etapa === e.nome ? "selected" : ""}>${escapeHtml(e.nome)}</option>`).join("")}
        </select></label>`
    : "";

  const kpiEtapa = kanban
    ? `<div class="kpi"><div class="lbl">Etapa no kanban</div><div class="val crm-val-texto">${c.etapa ? escapeHtml(c.etapa) : "Sem etapa"}</div>${c.etapa && diasEtapa !== null ? `<div class="muted sv-sub">há ${diasEtapa} ${diasEtapa === 1 ? "dia" : "dias"}</div>` : ""}</div>`
    : `<div class="kpi"><div class="lbl">Na carteira desde</div><div class="val crm-val-texto">${formatDateBR(crmDiaLocal(c.createdAt))}</div></div>`;

  raiz.innerHTML = `
    <div class="page-head">
      <div>
        <button type="button" class="sv-link crm-voltar" data-crmvoltar="1">← Clientes</button>
        <h1>${escapeHtml(c.cliente)} ${crmTipoSelo(c.cliente)}</h1>
        <div class="sub">${escapeHtml(crmCidadeUF(c.cliente) || "Sem cidade no cadastro")} · ${CRM_SISTEMAS[c.sistema]} · Executivo: ${escapeHtml(c.executivoNome || "—")}${c.tambemOutro ? ` · também compra em ${CRM_SISTEMAS[c.sistema === "atacado" ? "encomenda" : "atacado"]}` : ""}</div>
      </div>
      <div class="page-head-actions crm-ficha-acoes">
        ${crmAtalhosHtml(ct)}
        ${crmEhProspect(c.cliente) && crmPodeGerirCarteira() && (!crmEhExecutivo() || c.executivoId === crmMeuId()) ? `<button type="button" class="btn outline" data-crmeditarprospect="${escapeAttr(c.cliente)}">Editar</button> <button type="button" class="btn outline" data-crmconverter="${escapeAttr(c.cliente)}">Tornar cliente efetivo</button>` : ""}
        ${crmPodeLevarOutroSistema(c) ? `<button type="button" class="btn outline" data-crmlevar="${escapeAttr(c.id)}">Levar também para o ${CRM_SISTEMAS[c.sistema === "atacado" ? "encomenda" : "atacado"]}</button>` : ""}
        ${crmPodeLigarPara(c) ? `<button type="button" class="btn primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>` : ""}
      </div>
    </div>
    ${etapaCampo ? `<div class="crm-ficha-etapa">${etapaCampo}</div>` : ""}
    <div class="kpis">
      <div class="kpi"><div class="lbl">Última ligação</div><div class="val crm-val-texto">${r.ultima ? crmDataCurta(crmDiaLocal(r.ultima.createdAt)) : "—"}</div><div class="crm-kpi-sub">${r.ultima ? crmPill(r.ultima.resultado) : '<span class="muted">Nunca ligado</span>'}</div></div>
      <div class="kpi"><div class="lbl">Próximo follow-up</div><div class="val crm-val-texto">${r.fu ? crmDataCurta(r.fu) : "—"}</div><div class="crm-kpi-sub">${r.fu ? (crmFollowupSelo(r.fu) || '<span class="muted sv-sub">data marcada</span>') : '<span class="muted">sem data marcada</span>'}</div></div>
      <div class="kpi"><div class="lbl">Ligações neste cliente</div><div class="val">${fmt(ligs.length)}</div><div class="muted sv-sub">${atendidas} atendidas · ${fechamentos} ${fechamentos === 1 ? "fechamento" : "fechamentos"}</div></div>
      ${kpiEtapa}
    </div>

    ${crmFichaAbasHtml()}
    ${crmUi.fichaAba !== "atividade" ? crmFichaPerfilHtml(c, crmUi.fichaAba) : `<div class="crm-ficha-grade">
      <div class="card">
        <div class="card-head"><h2>Contatos</h2>${crmPodeGerirCarteira() ? `<button type="button" class="btn small outline" data-crmcontatonovo="${escapeAttr(c.id)}">+ Contato</button>` : ""}</div>
        ${contatos.length ? contatos.map(p => `
          <div class="crm-contato">
            <div><b>${escapeHtml(p.nome)}</b>${p.principal ? ' <span class="status-pill pill-normal">Decisor</span>' : ""}</div>
            <div class="muted sv-sub">${escapeHtml(p.cargo || "Sem função informada")}</div>
            ${p.telefone ? `<div class="mono sv-sub">${escapeHtml(p.telefone)}</div>` : ""}
            ${p.whatsapp && p.whatsapp !== p.telefone ? `<div class="mono sv-sub">WhatsApp ${escapeHtml(p.whatsapp)}</div>` : ""}
            ${p.email ? `<div class="muted sv-sub">${escapeHtml(p.email)}</div>` : ""}
            <div class="crm-contato-acoes">${crmAtalhosHtml(p)}
              ${crmPodeGerirCarteira() ? `<button type="button" class="sv-link" data-crmcontatoedit="${escapeAttr(p.id)}">Editar</button><button type="button" class="sv-link" data-crmcontatodel="${escapeAttr(p.id)}">Excluir</button>` : ""}</div>
          </div>`).join("") : `<div class="empty-state">Nenhum contato cadastrado no CRM.${ct.nome ? ` Dados do cadastro do Torun: ${escapeHtml(ct.nome)}.` : ""}</div>`}
      </div>

      <div class="crm-ficha-direita">
        ${crmProspectCardHtml(c)}
        <div class="card">
          <div class="card-head"><h2>Histórico de ligações</h2><div class="note">${ligs.length} ${ligs.length === 1 ? "ligação" : "ligações"}</div></div>
          ${ligs.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Data</th><th>Resultado</th><th>Contato e observação</th><th>Próximo</th></tr></thead>
            <tbody>${ligs.map(l => `
              <tr>
                <td><span class="mono">${formatDateBR(crmDiaLocal(l.createdAt))}</span> <span class="muted sv-sub">${crmHoraLocal(l.createdAt)}</span><div class="muted sv-sub">${escapeHtml(l.executivoNome)}</div></td>
                <td>${crmPill(l.resultado)}${l.etapaPara ? `<div class="muted sv-sub">etapa: ${escapeHtml(l.etapaPara)}</div>` : ""}</td>
                <td>${l.contatoNome ? `<b>${escapeHtml(l.contatoNome)}</b>` : '<span class="muted">—</span>'}<div class="muted sv-sub crm-obs">${escapeHtml(l.observacao)}</div></td>
                <td>${l.proximoFollowup ? `<span class="mono">${crmDataCurta(l.proximoFollowup)}</span>` : '<span class="muted">—</span>'}</td>
              </tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Nenhuma ligação registrada ainda.</div>`}
        </div>
        ${kanban && hist.length ? `
        <div class="card">
          <div class="card-head"><h2>Mudanças de etapa</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Quem</th></tr></thead>
            <tbody>${hist.map(h => `<tr>
              <td><span class="mono">${formatDateBR(crmDiaLocal(h.quando))}</span> <span class="muted sv-sub">${crmHoraLocal(h.quando)}</span></td>
              <td>${h.de ? escapeHtml(h.de) : '<span class="muted">sem etapa</span>'}</td>
              <td><b>${escapeHtml(h.para || "—")}</b></td>
              <td>${escapeHtml(h.porNome)} <span class="muted sv-sub">${h.origem === "kanban" ? "arrastou no kanban" : h.origem === "ligacao" ? "ao registrar ligação" : "na ficha"}</span></td>
            </tr>`).join("")}</tbody></table></div>
        </div>` : ""}
      </div>
    </div>`}`;
}

/* ---------------- ficha do representante ---------------- */

// Representante é só agrupador: lista os clientes dele (cada um com o próprio follow-up) e não tem ligação nem etapa.
function crmRenderFichaRepresentante(raiz, c) {
  const filhos = crmClientesDoRepresentante(c.cliente, c.sistema).map(f => ({ c: f, r: crmResumo(f) }))
    .sort((a, b) => a.c.cliente.localeCompare(b.c.cliente));
  const hoje = todayISO();
  const atrasados = filhos.filter(x => x.r.fu && x.r.fu < hoje).length;
  const semLigacao = filhos.filter(x => x.r.total === 0).length;
  const info = crmInfoCliente(c.cliente);
  const podeNovo = crmPodeGerirCarteira() && (!crmEhExecutivo() || c.executivoId === crmMeuId());
  raiz.innerHTML = `
    <div class="page-head">
      <div>
        <button type="button" class="sv-link crm-voltar" data-crmvoltar="1">← Clientes</button>
        <h1>${escapeHtml(c.cliente)} ${crmTipoSelo(c.cliente)}</h1>
        <div class="sub">${escapeHtml(crmCidadeUF(c.cliente) || "Sem cidade no cadastro")} · ${CRM_SISTEMAS[c.sistema]} · Executivo: ${escapeHtml(c.executivoNome || "—")}</div>
      </div>
      <div class="page-head-actions crm-ficha-acoes">
        ${podeNovo ? `<button type="button" class="btn primary" data-crmnovoviarep="${escapeAttr(c.cliente)}">+ Cliente via este representante</button>` : ""}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">Clientes</div><div class="val">${fmt(filhos.length)}</div></div>
      <div class="kpi ${atrasados ? "crm-alerta" : ""}"><div class="lbl">Follow-ups atrasados</div><div class="val">${fmt(atrasados)}</div></div>
      <div class="kpi"><div class="lbl">Ainda sem ligação</div><div class="val">${fmt(semLigacao)}</div></div>
    </div>
    <div class="crm-ficha-grade">
      <div class="card">
        <div class="card-head"><h2>Dados</h2></div>
        ${crmDl([["CNPJ / CPF", escapeHtml(info.documento), true], ["Contato de referência", escapeHtml(info.contato)], ["Telefone", escapeHtml(info.telefone), true], ["Observação", escapeHtml(info.observacao)]])}
        <p class="muted sv-sub" style="margin-top:12px;">O representante não recebe ligação nem follow-up e não aparece em Hoje. Os clientes dele são clientes normais da carteira de ${escapeHtml(c.executivoNome || "do executivo")}.</p>
      </div>
      <div class="crm-ficha-direita">
        <div class="card">
          <div class="card-head"><h2>Clientes deste representante</h2><div class="note">${filhos.length} ${filhos.length === 1 ? "cliente" : "clientes"}</div></div>
          ${filhos.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>Contato</th><th>Última ligação</th><th>Próximo follow-up</th></tr></thead>
            <tbody>${filhos.map(x => { const ct = crmContatoRapido(x.c); return `<tr>
              <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button>
                <div class="muted sv-sub">${escapeHtml(crmCidadeUF(x.c.cliente))}</div></td>
              <td>${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">—</span>'}<div class="muted sv-sub">${escapeHtml(ct.cargo)}</div></td>
              <td>${crmUltimaHtml(x.r)}</td>
              <td>${crmFollowupHtml(x.r.fu)}</td>
            </tr>`; }).join("")}</tbody></table></div>` : `<div class="empty-state">Nenhum cliente neste representante ainda. Use “+ Cliente via este representante”.</div>`}
        </div>
      </div>
    </div>`;
}

/* ---------------- registrar ligação ---------------- */

let crmLigCarteiraId = null;
let crmLigResultado = null;
let crmLigSalvando = false;

function crmAbrirLigacao(id) {
  const c = crmCarteiraPorId(id);
  if (!c || !crmPodeLigarPara(c)) return;
  crmLigCarteiraId = id;
  crmLigResultado = null;
  document.getElementById("crmLigTitulo").textContent = c.cliente;
  document.getElementById("crmLigSub").textContent = [crmCidadeUF(c.cliente), CRM_SISTEMAS[c.sistema]].filter(Boolean).join(" · ");

  // "Falou com": contatos do CRM; sem nenhum, o contato do cadastro do Torun; sempre "Outra pessoa"
  const contatos = crmContatosDe(c);
  const opcoes = contatos.map(p => `<option value="c:${escapeAttr(p.id)}">${escapeHtml(p.nome)}${p.cargo ? " · " + escapeHtml(p.cargo) : ""}${p.principal ? " (principal)" : ""}</option>`);
  const cadastro = crmInfoCliente(c.cliente).contato;
  if (!contatos.length && cadastro) opcoes.push(`<option value="cad">${escapeHtml(cadastro)} (cadastro do Torun)</option>`);
  opcoes.push(`<option value="outro">Outra pessoa…</option>`);
  const sel = document.getElementById("crmLigContato");
  sel.innerHTML = opcoes.join("");
  document.getElementById("crmLigOutro").value = "";
  crmAtualizarOutroContato();

  document.getElementById("crmLigResultados").innerHTML = CRM_RESULTADOS.map(r =>
    `<button type="button" class="crm-chip" data-crmresultado="${escapeAttr(r)}" aria-pressed="false">${escapeHtml(r)}</button>`).join("");

  const comEtapa = c.sistema === "atacado";
  document.getElementById("crmLigEtapaCampo").style.display = comEtapa ? "" : "none";
  if (comEtapa) {
    document.getElementById("crmLigEtapa").innerHTML = (c.etapa ? "" : `<option value="">Sem etapa</option>`) +
      CRM_ETAPAS.map(e => `<option value="${escapeAttr(e.nome)}">${escapeHtml(e.nome)}</option>`).join("");
    document.getElementById("crmLigEtapa").value = c.etapa || "";
  }

  document.getElementById("crmLigObs").value = "";
  document.getElementById("crmLigFu").value = "";
  document.getElementById("crmLigFu").min = todayISO();
  document.getElementById("crmLigFuAtalhos").innerHTML = CRM_ATALHOS_FU.map(([rot, n]) =>
    `<button type="button" class="crm-chip" data-crmfudias="${n}" aria-pressed="false">${rot}</button>`).join("");
  crmMarcarAtalhoFu();
  document.getElementById("crmLigErro").style.display = "none";
  const agora = new Date();
  document.getElementById("crmLigRodape").textContent =
    `Ligação de ${agora.toLocaleDateString("pt-BR")} · ${crmHoraLocal(agora)} · ${currentUserNome}`;
  document.getElementById("crmLigOverlay").classList.add("show");
}

function crmFecharLigacao() {
  document.getElementById("crmLigOverlay").classList.remove("show");
  crmLigCarteiraId = null;
}

function crmAtualizarOutroContato() {
  const outro = document.getElementById("crmLigContato").value === "outro";
  document.getElementById("crmLigOutroCampo").style.display = outro ? "" : "none";
}

function crmMarcarAtalhoFu() {
  const valor = document.getElementById("crmLigFu").value;
  document.querySelectorAll("#crmLigFuAtalhos .crm-chip").forEach(b => {
    const igual = valor && valor === dataMaisDias(todayISO(), Number(b.dataset.crmfudias));
    b.classList.toggle("on", !!igual);
    b.setAttribute("aria-pressed", igual ? "true" : "false");
  });
}

function crmEscolherResultado(resultado) {
  crmLigResultado = resultado;
  document.querySelectorAll("#crmLigResultados .crm-chip").forEach(b => {
    const on = b.dataset.crmresultado === resultado;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.getElementById("crmLigErro").style.display = "none";
  const c = crmCarteiraPorId(crmLigCarteiraId);
  if (c && c.sistema === "atacado" && CRM_ETAPA_SUGERIDA[resultado]) {
    document.getElementById("crmLigEtapa").value = CRM_ETAPA_SUGERIDA[resultado];
  }
  // Não atendeu: a ligação se repete amanhã, a não ser que a pessoa escolha outra data (ou limpe o campo)
  const fu = document.getElementById("crmLigFu");
  if (resultado === "Não atendeu" && !fu.value) fu.value = dataMaisDias(todayISO(), 1);
  crmMarcarAtalhoFu();
  document.getElementById("crmLigAviso").textContent = CRM_EXIGE_RETORNO.includes(resultado)
    ? `A data do próximo follow-up é obrigatória para ${resultado}.` : "Nesse resultado a data do próximo follow-up pode ficar em branco.";
}

function crmErroLigacao(msg) {
  const el = document.getElementById("crmLigErro");
  el.textContent = msg;
  el.style.display = "block";
}

async function crmSalvarLigacao() {
  if (crmLigSalvando) return;
  const c = crmCarteiraPorId(crmLigCarteiraId);
  if (!c) return;
  if (!crmLigResultado) { crmErroLigacao("Escolha o resultado da ligação."); return; }
  const fu = document.getElementById("crmLigFu").value || null;
  if (CRM_EXIGE_RETORNO.includes(crmLigResultado) && !fu) { crmErroLigacao(`Informe a data do próximo follow-up (obrigatória para ${crmLigResultado}).`); return; }
  if (fu && fu < todayISO()) { crmErroLigacao("A data do próximo follow-up não pode ser no passado."); return; }

  const escolha = document.getElementById("crmLigContato").value;
  let contatoNome = null;
  if (escolha === "outro") contatoNome = document.getElementById("crmLigOutro").value.replace(/\s+/g, " ").trim() || null;
  else if (escolha === "cad") contatoNome = crmInfoCliente(c.cliente).contato || null;
  else { const p = crmState.contatos.find(x => "c:" + x.id === escolha); contatoNome = p ? p.nome : null; }

  const etapaEscolhida = c.sistema === "atacado" ? document.getElementById("crmLigEtapa").value : "";
  const mudouEtapa = !!etapaEscolhida && etapaEscolhida !== (c.etapa || "");

  crmLigSalvando = true;
  const botao = document.getElementById("crmLigSalvar");
  botao.disabled = true;
  try {
    const { data, error } = await sb.from("crm_ligacoes").insert({
      sistema: c.sistema, cliente: c.cliente, contato_nome: contatoNome, resultado: crmLigResultado,
      observacao: document.getElementById("crmLigObs").value.trim() || null, proximo_followup: fu,
      etapa_para: mudouEtapa ? etapaEscolhida : null, executivo_user_id: currentUser.id, executivo_nome: currentUserNome
    }).select();
    if (error) { crmErroLigacao("Erro ao salvar a ligação: " + error.message); return; }
    if (!data || !data[0]) { crmErroLigacao("Não foi possível salvar a ligação (sem permissão)."); return; }
    crmState.ligacoes.push(crmLigacaoFromRow(data[0]));
    crmReindexar();
    if (mudouEtapa) await crmGravarEtapa(c, etapaEscolhida, "ligacao");
    crmFecharLigacao();
    crmRender();
    toast("Ligação registrada.");
  } finally {
    crmLigSalvando = false;
    botao.disabled = false;
  }
}

/* ---------------- levar o cliente para a carteira do outro sistema (botão da ficha) ---------------- */
// Mesmo efeito da caixa "também compra no outro sistema" do assistente, para quem esqueceu de marcar: função crm_levar_cliente.

let crmLevarCarteiraId = null;

function crmPodeLevarOutroSistema(c) {
  return crmPodeGerirCarteira() && crmTipoDe(c.cliente) === "cliente" && (!crmEhExecutivo() || c.executivoId === crmMeuId());
}

async function crmAbrirLevar(carteiraId) {
  const c = crmCarteiraPorId(carteiraId);
  if (!c || !crmPodeLevarOutroSistema(c)) return;
  crmLevarCarteiraId = carteiraId;
  const outro = CRM_SISTEMAS[c.sistema === "atacado" ? "encomenda" : "atacado"];
  document.getElementById("crmLevarTitulo").textContent = "Levar para o " + outro;
  document.getElementById("crmLevarSub").textContent = c.cliente + " passa a ter também uma carteira no " + outro + ".";
  document.getElementById("crmLevarExecRot").textContent = "Executivo responsável no " + outro;
  document.getElementById("crmLevarContatos").checked = true;
  document.getElementById("crmLevarErro").style.display = "none";
  const sel = document.getElementById("crmLevarExec");
  sel.innerHTML = `<option value="">Carregando…</option>`;
  document.getElementById("crmLevarOverlay").classList.add("show");
  const { data, error } = await sb.rpc("crm_executivos_outro_sistema", { p_origem: c.sistema });
  if (crmLevarCarteiraId !== carteiraId) return;
  if (error || !(data || []).length) { sel.innerHTML = `<option value="">Nenhum executivo cadastrado no ${escapeHtml(outro)}</option>`; return; }
  sel.innerHTML = `<option value="">Selecione…</option>` + data.map(r => `<option value="${escapeAttr(r.user_id)}">${escapeHtml(r.nome)}</option>`).join("");
}

function crmFecharLevar() {
  document.getElementById("crmLevarOverlay").classList.remove("show");
  crmLevarCarteiraId = null;
}

async function crmSalvarLevar() {
  const c = crmCarteiraPorId(crmLevarCarteiraId);
  if (!c) return;
  const erro = document.getElementById("crmLevarErro");
  const exec = document.getElementById("crmLevarExec").value;
  if (!exec) { erro.textContent = "Escolha o executivo responsável."; erro.style.display = "block"; return; }
  const botao = document.getElementById("crmLevarSalvar");
  botao.disabled = true;
  const msg = await crmLevarParaOutroSistema(c.cliente, exec, document.getElementById("crmLevarContatos").checked);
  botao.disabled = false;
  if (msg) { erro.textContent = "Não foi possível levar: " + msg; erro.style.display = "block"; return; }
  c.tambemOutro = true;
  crmFecharLevar();
  crmRender();
  toast(c.cliente + " levado para o " + CRM_SISTEMAS[c.sistema === "atacado" ? "encomenda" : "atacado"] + ".");
}

/* ---------------- contatos ---------------- */

let crmContCarteiraId = null;
let crmContEditandoId = null;

function crmAbrirContato(carteiraId, contatoId) {
  const c = crmCarteiraPorId(carteiraId);
  if (!c || !crmPodeGerirCarteira()) return;
  crmContCarteiraId = carteiraId;
  crmContEditandoId = contatoId || null;
  const p = contatoId ? crmState.contatos.find(x => x.id === contatoId) : null;
  document.getElementById("crmContTitulo").textContent = p ? "Editar contato" : "Novo contato";
  document.getElementById("crmContNome").value = p ? p.nome : "";
  document.getElementById("crmContCargo").value = p ? p.cargo : "";
  document.getElementById("crmContTelefone").value = p ? p.telefone : "";
  document.getElementById("crmContWhats").value = p ? p.whatsapp : "";
  document.getElementById("crmContEmail").value = p ? p.email : "";
  document.getElementById("crmContPrincipal").checked = p ? p.principal : crmContatosDe(c).length === 0;
  document.getElementById("crmContErro").style.display = "none";
  document.getElementById("crmContOverlay").classList.add("show");
  document.getElementById("crmContNome").focus();
}

function crmFecharContato() {
  document.getElementById("crmContOverlay").classList.remove("show");
  crmContCarteiraId = null;
  crmContEditandoId = null;
}

async function crmSalvarContato() {
  const c = crmCarteiraPorId(crmContCarteiraId);
  if (!c) return;
  const erro = document.getElementById("crmContErro");
  const nome = document.getElementById("crmContNome").value.replace(/\s+/g, " ").trim();
  if (!nome) { erro.textContent = "Informe o nome do contato."; erro.style.display = "block"; return; }
  const campos = {
    nome, cargo: document.getElementById("crmContCargo").value.trim() || null,
    telefone: document.getElementById("crmContTelefone").value.trim() || null,
    whatsapp: document.getElementById("crmContWhats").value.trim() || null,
    email: document.getElementById("crmContEmail").value.trim() || null,
    principal: document.getElementById("crmContPrincipal").checked
  };
  const botao = document.getElementById("crmContSalvar");
  botao.disabled = true;
  try {
    // só um principal por cliente: tira a marca dos outros antes de marcar este
    if (campos.principal) {
      const outros = crmContatosDe(c).filter(p => p.principal && p.id !== crmContEditandoId);
      if (outros.length) {
        const r = await sb.from("crm_contatos").update({ principal: false }).in("id", outros.map(p => p.id)).select();
        if (r.error) { erro.textContent = "Erro ao salvar: " + r.error.message; erro.style.display = "block"; return; }
        outros.forEach(p => { p.principal = false; });
      }
    }
    const q = crmContEditandoId
      ? sb.from("crm_contatos").update(campos).eq("id", crmContEditandoId).select()
      : sb.from("crm_contatos").insert({ ...campos, sistema: c.sistema, cliente: c.cliente }).select();
    const { data, error } = await q;
    if (error) { erro.textContent = "Erro ao salvar o contato: " + error.message; erro.style.display = "block"; return; }
    if (!data || !data[0]) { erro.textContent = "Não foi possível salvar (sem permissão)."; erro.style.display = "block"; return; }
    const novo = crmContatoFromRow(data[0]);
    const i = crmState.contatos.findIndex(p => p.id === novo.id);
    if (i >= 0) crmState.contatos[i] = novo; else crmState.contatos.push(novo);
    crmReindexar();
    crmFecharContato();
    crmRender();
    toast("Contato salvo.");
  } finally { botao.disabled = false; }
}

async function crmExcluirContato(id) {
  const p = crmState.contatos.find(x => x.id === id);
  if (!p) return;
  const ok = await confirmModal("Excluir contato?", `Remove ${p.nome} dos contatos deste cliente. As ligações já registradas continuam como estão.`);
  if (!ok) return;
  const { data, error } = await sb.from("crm_contatos").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir o contato: " + error.message); return; }
  if (!data || !data.length) { toast("Não foi possível excluir (sem permissão ou já removido)."); return; }
  crmState.contatos = crmState.contatos.filter(x => x.id !== id);
  crmReindexar();
  crmRender();
  toast("Contato removido.");
}

/* adicionar cliente à carteira e editar o perfil: assistente em crm-perfil.js */

/* ---------------- ligações dos eventos da tela ---------------- */

// copia o texto e avisa; não impede o clique de seguir para o link
async function crmCopiarTexto(texto, rotulo) {
  try { await navigator.clipboard.writeText(texto); toast(rotulo + " copiado: " + texto); }
  catch (err) { toast("Não deu para copiar. " + rotulo + ": " + texto); }
}

function crmClickDelegado(e) {
  const t = e.target.closest("[data-crmficha],[data-crmligar],[data-crmvoltar],[data-crmnovoviarep],[data-crmlevar],[data-crmcontatonovo],[data-crmcontatoedit],[data-crmcontatodel],[data-crmcopiar]");
  if (!t) return;
  if (t.dataset.crmcopiar) {
    // só copia no computador (mouse); no celular o toque segue para o link de ligação
    if (t.dataset.crmsocopia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) e.preventDefault();
    crmCopiarTexto(t.dataset.crmcopiar, t.dataset.crmcopiarrot || "Texto");
  }
  else if (t.dataset.crmficha) crmAbrirFicha(t.dataset.crmficha);
  else if (t.dataset.crmligar) crmAbrirLigacao(t.dataset.crmligar);
  else if (t.dataset.crmvoltar) setView("crm-clientes");
  else if (t.dataset.crmlevar) crmAbrirLevar(t.dataset.crmlevar);
  else if (t.dataset.crmnovoviarep)crmAbrirAdicionar({ representante: t.dataset.crmnovoviarep });
  else if (t.dataset.crmcontatonovo) crmAbrirContato(t.dataset.crmcontatonovo, null);
  else if (t.dataset.crmcontatoedit) crmAbrirContato(crmUi.fichaId, t.dataset.crmcontatoedit);
  else if (t.dataset.crmcontatodel) crmExcluirContato(t.dataset.crmcontatodel);
}

function initCrmTelas() {
  if (!document.getElementById("view-crm-hoje")) return;
  ["view-crm-hoje", "view-crm-clientes", "view-crm-cliente"].forEach(id => {
    document.getElementById(id).addEventListener("click", crmClickDelegado);
  });
  ["crmCliBusca", "crmCliTipo", "crmCliSituacao", "crmCliOrdem", "crmCliExecutivo", "crmCliRepresentante"].forEach(id => {
    document.getElementById(id).addEventListener("input", crmRenderClientes);
  });
  document.getElementById("crmEscopoSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmescopo]");
    if (!b) return;
    crmUi.escopo = b.dataset.crmescopo;
    crmRenderClientes();
  });
  document.getElementById("crmModoSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmmodo]");
    if (!b) return;
    crmUi.modo = b.dataset.crmmodo;
    crmRenderClientes();
  });
  document.getElementById("crmBtnAdicionar").addEventListener("click", crmAbrirAdicionar);

  if (typeof crmFatInit === "function") crmFatInit();

  // metas
  document.getElementById("crmMetasAno").addEventListener("change", (e) => { crmMetas.ano = Number(e.target.value); crmRenderMetas(); });
  document.getElementById("crmMetasCorpo").addEventListener("input", (e) => {
    if (!e.target.classList.contains("crm-meta-in")) return;
    crmMascarar(e.target);
    crmAtualizarMetasCalculo();
  });
  document.getElementById("crmMetasCorpo").addEventListener("click", (e) => {
    if (e.target.id === "crmMetaSalvar") crmSalvarMetas();
  });
  document.getElementById("crmFicha").addEventListener("change", (e) => {
    if (e.target.id !== "crmFichaEtapa") return;
    const c = crmCarteiraPorId(crmUi.fichaId);
    if (!c || !e.target.value || e.target.value === c.etapa) return;
    crmGravarEtapa(c, e.target.value, "ficha").then(() => crmRender());
  });

  // registrar ligação
  document.getElementById("crmLigResultados").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmresultado]");
    if (b) crmEscolherResultado(b.dataset.crmresultado);
  });
  document.getElementById("crmLigContato").addEventListener("change", crmAtualizarOutroContato);
  document.getElementById("crmLigFuAtalhos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmfudias]");
    if (!b) return;
    document.getElementById("crmLigFu").value = dataMaisDias(todayISO(), Number(b.dataset.crmfudias));
    crmMarcarAtalhoFu();
    document.getElementById("crmLigErro").style.display = "none";
  });
  document.getElementById("crmLigFu").addEventListener("input", crmMarcarAtalhoFu);
  document.getElementById("crmLigCancelar").addEventListener("click", crmFecharLigacao);
  document.getElementById("crmLigFechar").addEventListener("click", crmFecharLigacao);
  document.getElementById("crmLigSalvar").addEventListener("click", crmSalvarLigacao);

  // contato
  document.getElementById("crmLevarCancelar").addEventListener("click", crmFecharLevar);
  document.getElementById("crmLevarSalvar").addEventListener("click", crmSalvarLevar);
  document.getElementById("crmContCancelar").addEventListener("click", crmFecharContato);
  document.getElementById("crmContSalvar").addEventListener("click", crmSalvarContato);

  // adicionar à carteira e editar o perfil (assistente)
  crmWizInit();
}

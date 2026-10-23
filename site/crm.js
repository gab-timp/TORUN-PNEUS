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
  { nome: "Estimativa enviada", accent: "#FF6A13", deep: "#C64F0C", pale: "#FFE7D6" },
  { nome: "Em negociação", accent: "#2563EB", deep: "#1D4FA8", pale: "#E4EEFD" },
  { nome: "Fechamento", accent: "#D97706", deep: "#92650A", pale: "#FBF3D5" },
  { nome: "Fechado", accent: "#22C55E", deep: "#15803D", pale: "#E1F8E8" },
  { nome: "Declinou", accent: "#DC2626", deep: "#991B1B", pale: "#FDE6E6" }
];
const CRM_RECARGA_MIN_MS = 3000;
const CRM_ATALHOS_FU = [["Amanhã", 1], ["Em 3 dias", 3], ["Em 1 semana", 7], ["Em 2 semanas", 14]];

let crmPapel = null;    // 'executivo' | 'financeiro' | 'gestao' | null (cadastro do usuário)
let crmSistema = null;  // 'atacado' | 'encomenda' (só do executivo)

const crmState = { carteira: [], contatos: [], ligacoes: [], historico: [] };
let crmIdx = { lig: new Map(), cont: new Map(), hist: new Map() };
const crmUi = { sistema: "atacado", modo: "lista", fichaId: null };
let crmUltimaCarga = 0;
let crmCargaEmAndamento = null;
let crmSortables = [];

/* ---------------- perfil e acesso ---------------- */

function crmDefinirPerfil(r) {
  crmPapel = (r && r.crm_papel) || null;
  crmSistema = (r && r.crm_sistema) || null;
}

// administrador sem papel marcado conta como gestão (mesma regra de current_user_crm_papel() no banco)
function crmPapelEfetivo() {
  return crmPapel || (currentUserIsAdmin ? "gestao" : null);
}
function temAcessoCrm() { return !!crmPapelEfetivo(); }
function crmEhExecutivo() { return crmPapelEfetivo() === "executivo"; }
function crmPodeEscrever() { return currentUserRole !== "viewer"; }
function crmPodeRegistrarLigacao() { return crmEhExecutivo() && crmPodeEscrever(); }
function crmPodeGerirCarteira() { return ["executivo", "gestao"].includes(crmPapelEfetivo()) && crmPodeEscrever(); }

function crmSistemasVisiveis() {
  const p = crmPapelEfetivo();
  if (p === "executivo") return crmSistema ? [crmSistema] : [];
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
  crmUi.sistema = sistema;
  crmUi.modo = "lista";
  crmUi.fichaId = null;
  ["crmCliBusca", "crmCliSituacao", "crmCliExecutivo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

// quem tem carteira própria começa em Hoje; gestão e financeiro, na lista de clientes
function crmViewInicial() {
  return crmEhExecutivo() ? "crm-hoje" : "crm-clientes";
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
    return true;
  })().finally(() => { crmCargaEmAndamento = null; });
  return crmCargaEmAndamento;
}

/* ---------------- helpers de leitura ---------------- */

function crmCarteiraPorId(id) { return crmState.carteira.find(c => c.id === id) || null; }
function crmLigacoesDe(c) { return crmIdx.lig.get(crmChave(c.sistema, c.cliente)) || []; }
function crmContatosDe(c) { return crmIdx.cont.get(crmChave(c.sistema, c.cliente)) || []; }
function crmHistoricoDe(c) { return crmIdx.hist.get(crmChave(c.sistema, c.cliente)) || []; }
function crmInfoCliente(nome) { return (state.clientes || []).find(x => x.nome === nome) || {}; }

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

function crmLinkWhats(numero) {
  let d = crmDigitos(numero);
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return "https://wa.me/" + d;
}

function crmAtalhosHtml(ct) {
  const partes = [];
  if (crmDigitos(ct.telefone)) partes.push(`<a class="btn small outline" href="tel:${escapeAttr(crmDigitos(ct.telefone))}">Ligar</a>`);
  const wa = crmLinkWhats(ct.whatsapp || ct.telefone);
  if (wa) partes.push(`<a class="btn small outline" href="${escapeAttr(wa)}" target="_blank" rel="noopener">WhatsApp</a>`);
  if (ct.email) partes.push(`<a class="btn small outline" href="mailto:${escapeAttr(ct.email)}">E-mail</a>`);
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
}

/* ---------------- Hoje ---------------- */

function crmLinhaHoje(x) {
  const { c, r } = x;
  const ct = crmContatoRapido(c);
  const acoes = [crmAtalhosHtml(ct)];
  if (crmPodeRegistrarLigacao()) acoes.push(`<button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>`);
  return `
    <tr>
      <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button>
        <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${r.total === 0 ? " · cliente novo" : ""}</div></td>
      <td class="crm-col-exec">${escapeHtml(c.executivoNome || "—")}</td>
      <td>${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">—</span>'}<div class="muted sv-sub">${escapeHtml(ct.cargo)}</div></td>
      <td>${crmUltimaHtml(r)}</td>
      <td>${crmFollowupHtml(r.fu)}</td>
      <td class="crm-acoes">${acoes.filter(Boolean).join(" ")}</td>
    </tr>`;
}

function crmRenderHoje() {
  const s = crmSistemaAtual();
  const comExecutivo = !crmEhExecutivo();
  const hoje = todayISO();
  const mes = hoje.slice(0, 7);
  const itens = crmState.carteira.filter(c => c.sistema === s).map(c => ({ c, r: crmResumo(c) }));
  const atrasados = itens.filter(x => x.r.fu && x.r.fu < hoje).sort((a, b) => a.r.fu.localeCompare(b.r.fu) || a.c.cliente.localeCompare(b.c.cliente));
  const paraHoje = itens.filter(x => x.r.fu === hoje).sort((a, b) => a.c.cliente.localeCompare(b.c.cliente));
  const ligacoes = crmState.ligacoes.filter(l => l.sistema === s);
  const feitasHoje = ligacoes.filter(l => crmDiaLocal(l.createdAt) === hoje).length;
  const fechadosMes = ligacoes.filter(l => l.resultado === "Fechou negócio" && crmDiaLocal(l.createdAt).slice(0, 7) === mes).length;

  const d = new Date();
  document.getElementById("crmHojeSub").textContent = `Quem ligar e quem retomar, dos mais atrasados aos de hoje. ${d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}.` +
    (comExecutivo ? " Você vê as carteiras de todos os executivos." : "");
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
  const ordem = document.getElementById("crmCliOrdem").value;
  const exec = document.getElementById("crmCliExecutivo").value;
  const hoje = todayISO();
  let itens = crmState.carteira.filter(c => c.sistema === s).map(c => ({ c, r: crmResumo(c) }));
  if (exec) itens = itens.filter(x => x.c.executivoId === exec);
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

function crmLinhaCliente(x) {
  const { c, r } = x;
  const ct = crmContatoRapido(c);
  return `
    <tr>
      <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button>
        <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${r.total === 0 ? " · cliente novo" : ""}</div></td>
      <td class="crm-col-exec">${escapeHtml(c.executivoNome || "—")}</td>
      <td>${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">—</span>'}<div class="muted sv-sub">${escapeHtml(ct.cargo)}</div></td>
      <td>${crmUltimaHtml(r)}</td>
      <td>${crmFollowupHtml(r.fu)}</td>
      <td class="crm-acoes">${crmAtalhosHtml(ct)}</td>
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

function crmRenderClientes() {
  const comExecutivo = !crmEhExecutivo();
  const kanban = crmTemKanban();
  if (!kanban) crmUi.modo = "lista";
  const view = document.getElementById("view-crm-clientes");
  view.classList.toggle("crm-ve-todos", comExecutivo);
  document.getElementById("crmCliExecutivoCampo").style.display = comExecutivo ? "" : "none";
  document.getElementById("crmModoSeg").style.display = kanban ? "" : "none";
  document.querySelectorAll("#crmModoSeg button").forEach(b => b.classList.toggle("on", b.dataset.crmmodo === crmUi.modo));
  document.getElementById("crmBtnAdicionar").style.display = crmPodeGerirCarteira() ? "" : "none";
  document.getElementById("crmCliSub").textContent = comExecutivo
    ? "A carteira de cada executivo: contato, última ligação e próximo follow-up."
    : "Sua carteira: contato, última ligação e próximo follow-up de cada cliente.";
  crmAtualizarFiltroExecutivo();

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
  else crmRenderKanban(itens);
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
  if (crmDigitos(ct.telefone)) acoes.push(`<a class="btn small outline" href="tel:${escapeAttr(crmDigitos(ct.telefone))}">Ligar</a>`);
  if (crmPodeRegistrarLigacao()) acoes.push(`<button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>`);
  return `
    <div class="kanban-card crm-cartao" data-id="${escapeAttr(c.id)}">
      <button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button>
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

/* ---------------- ficha do cliente ---------------- */

function crmAbrirFicha(id) {
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
        <h1>${escapeHtml(c.cliente)}</h1>
        <div class="sub">${escapeHtml(crmCidadeUF(c.cliente) || "Sem cidade no cadastro")} · ${CRM_SISTEMAS[c.sistema]} · Executivo: ${escapeHtml(c.executivoNome || "—")}${c.tambemOutro ? ` · também compra em ${CRM_SISTEMAS[c.sistema === "atacado" ? "encomenda" : "atacado"]}` : ""}</div>
      </div>
      <div class="page-head-actions crm-ficha-acoes">
        ${crmAtalhosHtml(ct)}
        ${crmPodeRegistrarLigacao() ? `<button type="button" class="btn primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>` : ""}
      </div>
    </div>
    ${etapaCampo ? `<div class="crm-ficha-etapa">${etapaCampo}</div>` : ""}
    <div class="kpis">
      <div class="kpi"><div class="lbl">Última ligação</div><div class="val crm-val-texto">${r.ultima ? crmDataCurta(crmDiaLocal(r.ultima.createdAt)) : "—"}</div><div class="crm-kpi-sub">${r.ultima ? crmPill(r.ultima.resultado) : '<span class="muted">Nunca ligado</span>'}</div></div>
      <div class="kpi"><div class="lbl">Próximo follow-up</div><div class="val crm-val-texto">${r.fu ? crmDataCurta(r.fu) : "—"}</div><div class="crm-kpi-sub">${r.fu ? (crmFollowupSelo(r.fu) || '<span class="muted sv-sub">data marcada</span>') : '<span class="muted">sem data marcada</span>'}</div></div>
      <div class="kpi"><div class="lbl">Ligações neste cliente</div><div class="val">${fmt(ligs.length)}</div><div class="muted sv-sub">${atendidas} atendidas · ${fechamentos} ${fechamentos === 1 ? "fechamento" : "fechamentos"}</div></div>
      ${kpiEtapa}
    </div>

    <div class="crm-ficha-grade">
      <div class="card">
        <div class="card-head"><h2>Contatos</h2>${crmPodeGerirCarteira() ? `<button type="button" class="btn small outline" data-crmcontatonovo="${escapeAttr(c.id)}">+ Contato</button>` : ""}</div>
        ${contatos.length ? contatos.map(p => `
          <div class="crm-contato">
            <div><b>${escapeHtml(p.nome)}</b>${p.principal ? ' <span class="status-pill pill-normal">Principal</span>' : ""}</div>
            <div class="muted sv-sub">${escapeHtml(p.cargo)}</div>
            ${p.telefone ? `<div class="mono sv-sub">${escapeHtml(p.telefone)}</div>` : ""}
            ${p.whatsapp && p.whatsapp !== p.telefone ? `<div class="mono sv-sub">WhatsApp ${escapeHtml(p.whatsapp)}</div>` : ""}
            ${p.email ? `<div class="muted sv-sub">${escapeHtml(p.email)}</div>` : ""}
            <div class="crm-contato-acoes">${crmAtalhosHtml(p)}
              ${crmPodeGerirCarteira() ? `<button type="button" class="sv-link" data-crmcontatoedit="${escapeAttr(p.id)}">Editar</button><button type="button" class="sv-link" data-crmcontatodel="${escapeAttr(p.id)}">Excluir</button>` : ""}</div>
          </div>`).join("") : `<div class="empty-state">Nenhum contato cadastrado no CRM.${ct.nome ? ` Dados do cadastro do Torun: ${escapeHtml(ct.nome)}.` : ""}</div>`}
      </div>

      <div class="crm-ficha-direita">
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
    </div>`;
}

/* ---------------- registrar ligação ---------------- */

let crmLigCarteiraId = null;
let crmLigResultado = null;
let crmLigSalvando = false;

function crmAbrirLigacao(id) {
  const c = crmCarteiraPorId(id);
  if (!c || !crmPodeRegistrarLigacao()) return;
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

/* ---------------- adicionar cliente à carteira ---------------- */

let crmAddSelecionado = null;   // nome do cliente escolhido no cadastro do Torun
let crmAddOcupados = new Map(); // cliente -> executivo, de quem já tem o cliente neste sistema
let crmAddExecutivos = [];      // [{ id, nome }] (gestão escolhe o responsável)
let crmAddContatoSeq = 0;
let crmAddSalvando = false;

async function crmAbrirAdicionar() {
  if (!crmPodeGerirCarteira()) return;
  const s = crmSistemaAtual();
  crmAddSelecionado = null;
  document.getElementById("crmAddBusca").value = "";
  document.getElementById("crmAddErro").style.display = "none";
  document.getElementById("crmAddSistemaNome").textContent = CRM_SISTEMAS[s];
  document.getElementById("crmAddOutroTexto").textContent = CRM_SISTEMAS[s === "atacado" ? "encomenda" : "atacado"];
  document.getElementById("crmAddOutro").checked = false;
  document.getElementById("crmAddContatos").innerHTML = "";
  crmAddContatoSeq = 0;
  crmAddNovoContato(true);
  document.getElementById("crmAddOverlay").classList.add("show");

  const [ocupados, execs] = await Promise.all([
    sb.rpc("crm_carteira_ocupada", { p_sistema: s }),
    crmEhExecutivo() ? Promise.resolve({ data: [] }) : sb.rpc("crm_executivos", { p_sistema: s })
  ]);
  if (ocupados.error) toast("Não deu pra conferir quem já tem cada cliente: " + ocupados.error.message);
  crmAddOcupados = new Map((ocupados.data || []).map(r => [r.cliente, r.executivo_nome || "outro executivo"]));
  crmAddExecutivos = (execs.data || []).map(r => ({ id: r.user_id, nome: r.nome }));
  const campoExec = document.getElementById("crmAddExecCampo");
  campoExec.style.display = crmEhExecutivo() ? "none" : "";
  document.getElementById("crmAddExec").innerHTML = crmAddExecutivos.length
    ? `<option value="">Selecione…</option>` + crmAddExecutivos.map(e => `<option value="${escapeAttr(e.id)}">${escapeHtml(e.nome)}</option>`).join("")
    : `<option value="">Nenhum executivo cadastrado neste sistema</option>`;
  crmAddRenderBusca();
  crmAddRenderSelecionado();
}

function crmFecharAdicionar() {
  document.getElementById("crmAddOverlay").classList.remove("show");
}

function crmAddRenderBusca() {
  const busca = (document.getElementById("crmAddBusca").value || "").trim().toLowerCase();
  const achados = (state.clientes || []).filter(cl => !busca || cl.nome.toLowerCase().includes(busca)).slice(0, 40);
  const lista = document.getElementById("crmAddResultados");
  lista.innerHTML = achados.length ? achados.map(cl => {
    const dono = crmAddOcupados.get(cl.nome);
    const cidade = [cl.cidade, cl.estado].filter(Boolean).join("/");
    if (dono) {
      return `<div class="crm-add-res crm-add-ocupado"><b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml(cidade)}</div><div class="crm-add-aviso">Já está na carteira de ${escapeHtml(dono)}</div></div>`;
    }
    const on = crmAddSelecionado === cl.nome;
    return `<button type="button" class="crm-add-res ${on ? "on" : ""}" data-crmaddcli="${escapeAttr(cl.nome)}" aria-pressed="${on}"><b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml(cidade)}</div></button>`;
  }).join("") : `<div class="muted sv-sub">Nenhum cliente com esse nome no cadastro do Torun.</div>`;
}

function crmAddRenderSelecionado() {
  const cl = crmAddSelecionado ? crmInfoCliente(crmAddSelecionado) : null;
  const box = document.getElementById("crmAddSelecionado");
  box.innerHTML = cl && cl.nome
    ? `<b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml([cl.cidade, cl.estado].filter(Boolean).join("/"))} · do cadastro do Torun</div>`
    : `<span class="muted">Escolha um cliente na lista ao lado.</span>`;
}

function crmAddNovoContato(primeiro) {
  const n = ++crmAddContatoSeq;
  const el = document.createElement("div");
  el.className = "crm-add-contato";
  el.dataset.n = String(n);
  el.innerHTML = `
    <div class="form-row">
      <div class="field grow"><label>Nome${primeiro ? " *" : ""}</label><input type="text" data-f="nome" autocomplete="off"></div>
      <div class="field"><label>Cargo</label><input type="text" data-f="cargo" autocomplete="off"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Telefone</label><input type="text" data-f="telefone" autocomplete="off"></div>
      <div class="field"><label>WhatsApp</label><input type="text" data-f="whatsapp" autocomplete="off"></div>
      <div class="field grow"><label>E-mail</label><input type="email" data-f="email" autocomplete="off"></div>
    </div>
    <label class="crm-add-principal"><input type="radio" name="crmAddPrincipal" ${primeiro ? "checked" : ""}> Contato principal</label>`;
  document.getElementById("crmAddContatos").appendChild(el);
}

function crmErroAdicionar(msg) {
  const el = document.getElementById("crmAddErro");
  el.textContent = msg;
  el.style.display = "block";
}

async function crmSalvarAdicionar() {
  if (crmAddSalvando) return;
  const s = crmSistemaAtual();
  if (!crmAddSelecionado) { crmErroAdicionar("Escolha um cliente do cadastro do Torun."); return; }
  const linhas = Array.from(document.querySelectorAll("#crmAddContatos .crm-add-contato"));
  const contatos = linhas.map(l => ({
    nome: l.querySelector('[data-f="nome"]').value.replace(/\s+/g, " ").trim(),
    cargo: l.querySelector('[data-f="cargo"]').value.trim(),
    telefone: l.querySelector('[data-f="telefone"]').value.trim(),
    whatsapp: l.querySelector('[data-f="whatsapp"]').value.trim(),
    email: l.querySelector('[data-f="email"]').value.trim(),
    principal: l.querySelector('input[type="radio"]').checked
  })).filter(c => c.nome || c.cargo || c.telefone || c.whatsapp || c.email);
  if (!contatos.length || !contatos[0].nome) { crmErroAdicionar("Informe pelo menos o nome do primeiro contato."); return; }
  if (contatos.some(c => !c.nome)) { crmErroAdicionar("Todo contato preenchido precisa de nome."); return; }
  if (!contatos.some(c => c.principal)) contatos[0].principal = true;

  let execId = currentUser.id, execNome = currentUserNome;
  if (!crmEhExecutivo()) {
    execId = document.getElementById("crmAddExec").value;
    const e = crmAddExecutivos.find(x => x.id === execId);
    if (!e) { crmErroAdicionar("Escolha o executivo responsável."); return; }
    execNome = e.nome;
  }

  crmAddSalvando = true;
  const botao = document.getElementById("crmAddSalvar");
  botao.disabled = true;
  try {
    const cart = await sb.from("crm_carteira").insert({
      sistema: s, cliente: crmAddSelecionado, executivo_user_id: execId, executivo_nome: execNome,
      tambem_outro_sistema: document.getElementById("crmAddOutro").checked, primeiro_followup: todayISO()
    }).select();
    if (cart.error) {
      crmErroAdicionar(cart.error.code === "23505"
        ? "Esse cliente já está na carteira de outro executivo deste sistema."
        : "Erro ao adicionar à carteira: " + cart.error.message);
      return;
    }
    if (!cart.data || !cart.data[0]) { crmErroAdicionar("Não foi possível adicionar (sem permissão)."); return; }
    crmState.carteira.push(crmCarteiraFromRow(cart.data[0]));
    const cont = await sb.from("crm_contatos").insert(contatos.map(c => ({
      sistema: s, cliente: crmAddSelecionado, nome: c.nome, cargo: c.cargo || null, telefone: c.telefone || null,
      whatsapp: c.whatsapp || null, email: c.email || null, principal: c.principal
    }))).select();
    if (cont.error) toast("O cliente entrou na carteira, mas os contatos não foram salvos: " + cont.error.message);
    else (cont.data || []).forEach(r => crmState.contatos.push(crmContatoFromRow(r)));
    crmReindexar();
    crmFecharAdicionar();
    crmRender();
    toast("Cliente adicionado à carteira.");
  } finally {
    crmAddSalvando = false;
    botao.disabled = false;
  }
}

/* ---------------- ganchos do app.js ---------------- */

// Excluir/mesclar cliente do Torun: quantas carteiras do CRM apontam pra ele. Devolve { nome: quantidade } só dos que
// estão em alguma carteira, ou null se não deu pra checar (SQL do CRM ainda não rodou, erro de rede): aí o fluxo segue
// como antes e o banco continua barrando.
async function carteiraCrmDosClientes(nomes) {
  const { data, error } = await sb.rpc("clientes_na_carteira_crm", { p_nomes: nomes });
  if (error) { console.warn("Não deu pra checar a carteira do CRM:", error.message); return null; }
  const porCliente = {};
  (data || []).forEach(r => { porCliente[r.cliente] = Number(r.carteiras); });
  return porCliente;
}

// Administração > Usuários: papel no CRM. Sem a coluna no banco (SQL do CRM não rodou) o bloco some e o salvamento
// fica como era.
function crmPreencherCamposUsuario(u) {
  const existe = "crm_papel" in u;
  document.getElementById("usuarioEditCrmBloco").style.display = existe ? "" : "none";
  document.getElementById("usuarioEditCrmAviso").style.display = existe ? "none" : "";
  document.getElementById("usuarioEditCrmPapel").value = u.crm_papel || "";
  document.getElementById("usuarioEditCrmSistema").value = u.crm_sistema || "atacado";
  crmAtualizarCampoSistemaUsuario();
}

function crmAtualizarCampoSistemaUsuario() {
  document.getElementById("usuarioEditCrmSistemaCampo").style.display =
    document.getElementById("usuarioEditCrmPapel").value === "executivo" ? "" : "none";
}

// campos do CRM pro update do usuário: {} se a coluna não existe, null se faltou o sistema do executivo
function crmLerCamposUsuario(u) {
  if (!("crm_papel" in u)) return {};
  const papel = document.getElementById("usuarioEditCrmPapel").value || null;
  const sistema = document.getElementById("usuarioEditCrmSistema").value || null;
  if (papel === "executivo" && !sistema) return null;
  return { crm_papel: papel, crm_sistema: papel === "executivo" ? sistema : null };
}

/* ---------------- ligações dos eventos da tela ---------------- */

function crmClickDelegado(e) {
  const t = e.target.closest("[data-crmficha],[data-crmligar],[data-crmvoltar],[data-crmcontatonovo],[data-crmcontatoedit],[data-crmcontatodel]");
  if (!t) return;
  if (t.dataset.crmficha) crmAbrirFicha(t.dataset.crmficha);
  else if (t.dataset.crmligar) crmAbrirLigacao(t.dataset.crmligar);
  else if (t.dataset.crmvoltar) setView("crm-clientes");
  else if (t.dataset.crmcontatonovo) crmAbrirContato(t.dataset.crmcontatonovo, null);
  else if (t.dataset.crmcontatoedit) crmAbrirContato(crmUi.fichaId, t.dataset.crmcontatoedit);
  else if (t.dataset.crmcontatodel) crmExcluirContato(t.dataset.crmcontatodel);
}

function initCrmTelas() {
  if (!document.getElementById("view-crm-hoje")) return;
  ["view-crm-hoje", "view-crm-clientes", "view-crm-cliente"].forEach(id => {
    document.getElementById(id).addEventListener("click", crmClickDelegado);
  });
  ["crmCliBusca", "crmCliSituacao", "crmCliOrdem", "crmCliExecutivo"].forEach(id => {
    document.getElementById(id).addEventListener("input", crmRenderClientes);
  });
  document.getElementById("crmModoSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmmodo]");
    if (!b) return;
    crmUi.modo = b.dataset.crmmodo;
    crmRenderClientes();
  });
  document.getElementById("crmBtnAdicionar").addEventListener("click", crmAbrirAdicionar);
  document.getElementById("usuarioEditCrmPapel").addEventListener("change", crmAtualizarCampoSistemaUsuario);
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
  document.getElementById("crmContCancelar").addEventListener("click", crmFecharContato);
  document.getElementById("crmContSalvar").addEventListener("click", crmSalvarContato);

  // adicionar à carteira
  document.getElementById("crmAddBusca").addEventListener("input", crmAddRenderBusca);
  document.getElementById("crmAddResultados").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmaddcli]");
    if (!b) return;
    crmAddSelecionado = b.dataset.crmaddcli;
    document.getElementById("crmAddErro").style.display = "none";
    crmAddRenderBusca();
    crmAddRenderSelecionado();
  });
  document.getElementById("crmAddMaisContato").addEventListener("click", () => crmAddNovoContato(false));
  document.getElementById("crmAddCancelar").addEventListener("click", crmFecharAdicionar);
  document.getElementById("crmAddFechar").addEventListener("click", crmFecharAdicionar);
  document.getElementById("crmAddSalvar").addEventListener("click", crmSalvarAdicionar);
}

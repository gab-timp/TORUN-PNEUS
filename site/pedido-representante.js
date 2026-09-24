/* ==========================================================
   TORUN PNEUS · Pedido de Compra (representantes)
   ========================================================== */

const SUPABASE_URL = "https://ypygfgpqaupnjsjxgjfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aLmz08KOlT7P7e_Ae4-AEw_aaWpTyKz";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentUserNome = "";
let produtos = [];
let produtosPrecos = [];
let movimentos = [];
let entregas = [];
let vendas = [];
let meusPreCadastros = [];
let clienteAtual = null;
let ultimoPedidoSalvo = null;
let itemRowSeq = 0;
let toastTimer;
let currentUserTema = null;
let currentUserNotifMudancaEtapa = true;
let propostaValidadeDias = 14;
let ESTOQUE_BAIXO_LIMITE = 20;
const ESTOQUE_ATENCAO_MARGEM = 5;
function statusEstoque(saldo) {
  if (saldo <= 0) return "esgotado";
  if (saldo < ESTOQUE_BAIXO_LIMITE) return "baixo";
  if (saldo < ESTOQUE_BAIXO_LIMITE + ESTOQUE_ATENCAO_MARGEM) return "atencao";
  return "normal";
}

const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const CATALOGO_REGIOES = ["SC/RS", "PR", "MG", "MT"];
const CATALOGO_CONDICOES = ["A VISTA", "30 DIAS", "2X", "3X", "4X", "5X", "6X"];
const CATALOGO_TODOS_TIPOS = "TODOS"; // valor do filtro "Tipo de cliente" que lista todos os pneus
const TIPO_CLIENTE_OPCOES = ["CONSUMO", "FROTA", "REVENDA"];
const TIPO_CLIENTE_LABEL = { REVENDA: "Revenda", FROTA: "Frota/TTD", CONSUMO: "Consumo" };
const UF_PARA_REGIAO = { SC: "SC/RS", RS: "SC/RS", PR: "PR", MG: "MG", MT: "MT" };
const CATEGORIA_LABEL = { PASSEIO: "Passeio", CARGAS_TBR: "Cargas/TBR", AGRICOLA_FLORESTAL: "Agrícola/Florestal", OUTRO: "Outro" };

// tira acento/maiúsc./"/"/"_"/espaço pra comparar -- só usado como chave de busca, nunca aparece na tela
function normalizarCategoria(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
const CATEGORIA_NORM_LOOKUP = {};
Object.entries(CATEGORIA_LABEL).forEach(([key, label]) => {
  CATEGORIA_NORM_LOOKUP[normalizarCategoria(key)] = label;
  CATEGORIA_NORM_LOOKUP[normalizarCategoria(label)] = label;
});

const ETAPA_LABEL = {
  PRE_VENDA: "Pré-venda", ENTRADA: "Entrada", AUTORIZACAO_GERENCIA: "Autorização de Gerência", ANALISE_CREDITO: "Análise de Crédito",
  AGUARDANDO_PAGAMENTO: "Aguardando Pagamento", VALIDACAO_TRANSPORTE: "Validação de Transporte",
  FATURAMENTO: "Faturamento", SEPARACAO: "Separação",
  AGUARDANDO_COLETA: "Aguardando Coleta", COLETA: "Coletado", RASTREIO: "Rastreio", FINALIZADOS: "Finalizados",
  FINANCEIRO: "Financeiro (etapa antiga)"
};

/* ---------------- utils ---------------- */

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(n);
}
function formatMoney(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function formatDateBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function normalizarDocumento(doc) {
  return (doc || "").replace(/\D/g, "");
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------------- tema (claro / escuro / sistema) ---------------- */

const THEME_KEY = "torun_theme_v1";

function applyThemeChoice(choice) {
  if (choice === "light" || choice === "dark") {
    document.documentElement.setAttribute("data-theme", choice);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  document.querySelectorAll(".theme-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeChoice === choice);
  });
}

function initThemeToggle() {
  const salvo = localStorage.getItem(THEME_KEY) || "system";
  applyThemeChoice(salvo);
  document.querySelectorAll(".theme-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.themeChoice;
      localStorage.setItem(THEME_KEY, choice);
      applyThemeChoice(choice);
      currentUserTema = choice;
      if (currentUser) {
        sb.from("user_preferences").upsert({ user_id: currentUser.id, tema: choice }, { onConflict: "user_id" })
          .then(({ error }) => { if (error) console.error("Erro ao salvar tema:", error); });
      }
    });
  });
}

/* ---------------- minhas configurações ---------------- */

function abrirMinhasConfiguracoesModal() {
  document.getElementById("minhasConfigNome").value = currentUserNome || "";
  document.getElementById("minhasConfigNotifEtapa").checked = currentUserNotifMudancaEtapa;
  document.getElementById("minhasConfigOverlay").classList.add("show");
}

function closeMinhasConfiguracoesModal() {
  document.getElementById("minhasConfigOverlay").classList.remove("show");
}

async function salvarNomeExibicao() {
  const novoNome = document.getElementById("minhasConfigNome").value.trim();
  if (!novoNome) { toast("O nome não pode ficar em branco."); return; }
  const { error } = await sb.rpc("atualizar_meu_nome", { novo_nome: novoNome });
  if (error) { toast("Erro ao salvar nome: " + error.message); return; }
  currentUserNome = novoNome;
  document.getElementById("repNomeVendedor").textContent = currentUserNome;
  toast("Nome atualizado.");
}

async function salvarNotificacaoEtapaPreferencia(checked) {
  currentUserNotifMudancaEtapa = checked;
  const { error } = await sb.from("user_preferences").upsert(
    { user_id: currentUser.id, notif_mudanca_etapa: checked }, { onConflict: "user_id" }
  );
  if (error) toast("Erro ao salvar preferência: " + error.message);
}

function initMinhasConfiguracoes() {
  document.getElementById("repNomeVendedor").addEventListener("click", abrirMinhasConfiguracoesModal);
  document.getElementById("minhasConfigCancelar").addEventListener("click", closeMinhasConfiguracoesModal);
  document.getElementById("minhasConfigOverlay").addEventListener("click", (e) => {
    if (e.target.id === "minhasConfigOverlay") closeMinhasConfiguracoesModal();
  });
  document.getElementById("minhasConfigSalvar").addEventListener("click", async () => {
    await salvarNomeExibicao();
    await salvarNotificacaoEtapaPreferencia(document.getElementById("minhasConfigNotifEtapa").checked);
    closeMinhasConfiguracoesModal();
  });
}

/* ---------------- realtime (produtos / produtos_precos / movimentos / entregas) ---------------- */
/* Mesmo padrão do app.js (subscribeRealtime()): UM CANAL POR TABELA, de
   propósito -- o realtime-js tem um bug com várias assinaturas postgres_changes
   no mesmo canal (os bindings do fim da lista nunca recebem evento). Só as 4
   tabelas que esta tela realmente usa (produtos/produtos_precos/movimentos/
   entregas) -- fretes/clientes/vendas/previsoes/notificacoes não aparecem em
   nenhuma tela do representante, então não precisam de canal aqui. */

const REALTIME_TABLES_REP = [
  { table: "produtos", key: "codigo", getList: () => produtos, setList: (l) => { produtos = l; } },
  { table: "produtos_precos", key: "id", getList: () => produtosPrecos, setList: (l) => { produtosPrecos = l; } },
  { table: "movimentos", key: "id", getList: () => movimentos, setList: (l) => { movimentos = l; } },
  { table: "entregas", key: "id", getList: () => entregas, setList: (l) => { entregas = l; } }
];

let realtimeChannelsRep = [];
let realtimeReconnectTimerRep = null;
let realtimeReconnectTentativasRep = 0;

function agendarReconexaoRealtimeRep(motivo) {
  if (realtimeReconnectTimerRep) return;
  const espera = Math.min(60000, 5000 * Math.pow(2, realtimeReconnectTentativasRep));
  realtimeReconnectTentativasRep++;
  console.error(`Realtime desconectado (${motivo}) — reconectando em ${Math.round(espera / 1000)}s.`);
  realtimeReconnectTimerRep = setTimeout(() => { realtimeReconnectTimerRep = null; subscribeRealtimeRep(); }, espera);
}

function subscribeRealtimeRep() {
  clearTimeout(realtimeReconnectTimerRep);
  realtimeReconnectTimerRep = null;
  realtimeChannelsRep.forEach(ch => sb.removeChannel(ch));
  realtimeChannelsRep = [];

  let conectados = 0;
  REALTIME_TABLES_REP.forEach((def) => {
    const channel = sb.channel(`rt-rep-${def.table}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: def.table },
      (payload) => aplicarMudancaRealtimeRep(def, payload));
    channel.subscribe((status) => {
      if (!realtimeChannelsRep.includes(channel)) return;
      if (status === "SUBSCRIBED") {
        realtimeReconnectTentativasRep = 0;
        if (++conectados === REALTIME_TABLES_REP.length) {
          console.log("Realtime conectado — atualizações automáticas ativas.");
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        agendarReconexaoRealtimeRep(`${def.table}: ${status}`);
      }
    });
    realtimeChannelsRep.push(channel);
  });
}

let rerenderTimerRep = null;
// Só re-renderiza as telas que já existem no DOM com o que já está em
// produtos/produtosPrecos/movimentos/entregas -- barato o bastante aqui (volume
// bem menor que o app principal) pra não precisar saber qual aba está ativa.
function scheduleRerenderRep() {
  clearTimeout(rerenderTimerRep);
  rerenderTimerRep = setTimeout(() => {
    renderRepCatalogo();
    renderRepEntregas();
    renderAcompanhamento();
  }, 200);
}

function aplicarMudancaRealtimeRep(def, payload) {
  const list = def.getList();
  if (payload.eventType === "DELETE") {
    def.setList(list.filter(x => x[def.key] !== payload.old[def.key]));
  } else {
    const row = payload.new;
    // acha pelo valor ANTIGO da chave -- produtos.codigo é editável, então
    // payload.new já vem com o valor novo (mesmo cuidado do app.js).
    const chaveAntiga = payload.old && payload.old[def.key] !== undefined ? payload.old[def.key] : row[def.key];
    const idx = list.findIndex(x => x[def.key] === chaveAntiga);
    if (idx === -1) list.push(row);
    else list[idx] = row;
    def.setList(list);
  }
  // Pedido do próprio representante mudou de etapa -- dispara o popup na hora,
  // não só na próxima visita (a comparação por localStorage abaixo continua
  // existindo como rede de segurança pra quando a aba estava fechada).
  if (def.table === "entregas" && currentUser) atualizarAlertaMudancaEtapa();
  scheduleRerenderRep();
}

/* ---------------- aviso: minha proposta mudou de etapa (só popup, sem card fixo) ---------------- */
/* Com o realtime acima, o popup já dispara na hora quando um pedido do
   representante muda de etapa enquanto a aba está aberta. A comparação por
   localStorage abaixo é a rede de segurança pra quando a aba estava FECHADA --
   assim o aviso também aparece ao reabrir o sistema depois de um tempo. */

const ETAPAS_CONHECIDAS_KEY = "torun_etapas_conhecidas_v1";

function carregarEtapasConhecidas() {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(ETAPAS_CONHECIDAS_KEY)) || {}));
  } catch (e) {
    return new Map();
  }
}

function salvarEtapasConhecidas(mapa) {
  localStorage.setItem(ETAPAS_CONHECIDAS_KEY, JSON.stringify(Object.fromEntries(mapa)));
}

function mostrarAlertaMudancaEtapaPopup(pedido) {
  const container = document.getElementById("propostaAlerts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "proposta-alert-item";
  el.innerHTML = `
    <div class="titulo">
      <span>Pedido atualizado</span>
      <button type="button" class="fechar">✕</button>
    </div>
    <div>Nº ${escapeHtml(pedido.numero_pedido || "—")} agora está em "${escapeHtml(ETAPA_LABEL[pedido.etapa] || pedido.etapa)}"</div>
  `;
  container.appendChild(el);
  el.querySelector(".fechar").addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), 8000);
}

function atualizarAlertaMudancaEtapa() {
  const meusPedidos = entregas.filter(e => e.created_by === currentUser.id);
  const anteriores = carregarEtapasConhecidas();
  if (anteriores.size > 0 && currentUserNotifMudancaEtapa) {
    meusPedidos.forEach(p => {
      const etapaAnterior = anteriores.get(p.id);
      if (etapaAnterior !== undefined && etapaAnterior !== p.etapa) {
        mostrarAlertaMudancaEtapaPopup(p);
      }
    });
  }
  salvarEtapasConhecidas(new Map(meusPedidos.map(p => [p.id, p.etapa])));
}

/* ---------------- boot / auth ---------------- */

async function boot() {
  initAuthUI();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await afterLogin();
  } else {
    showLogin();
  }
}
document.addEventListener("DOMContentLoaded", boot);

function showLogin(message) {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("repShell").style.display = "none";
  const erro = document.getElementById("loginErro");
  if (message) {
    erro.textContent = message;
    erro.style.display = "block";
  } else {
    erro.style.display = "none";
  }
}

function initAuthUI() {
  document.getElementById("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { showLogin("E-mail ou senha inválidos."); return; }
    currentUser = data.user;
    await afterLogin();
  });
  document.getElementById("btnLogoutRep").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });
}

async function afterLogin() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("loadingScreen").style.display = "flex";

  const { data: roleData, error: roleError } = await sb.from("user_roles")
    .select("role, nome, is_admin").eq("user_id", currentUser.id).maybeSingle();

  if (roleError || !roleData || (roleData.role !== "representante" && !roleData.is_admin)) {
    await sb.auth.signOut();
    showLogin("Este acesso é exclusivo para representantes.");
    return;
  }
  currentUserNome = roleData.nome || currentUser.email;
  document.getElementById("repNomeVendedor").textContent = currentUserNome;

  const [produtosRes, precosRes, movimentosRes, entregasRes, vendasRes, preCadastrosRes, prefRes, configRes] = await Promise.all([
    sb.from("produtos").select("codigo, medida, categoria, modelo, marca, carcaca, ic_iv, pr, cintas, cap_carga, psi, sulco_mm, larg_banda_mm, peso_kg, ncm, situacao, foto_path, foto_path_2").order("codigo"),
    sb.from("produtos_precos").select("id, codigo, regiao, tipo_cliente, condicao_pagamento, preco"),
    sb.from("movimentos").select("id, codigo, tipo, quantidade, data, entrega_id"),
    sb.from("entregas").select("*").order("data", { ascending: false }),
    sb.from("vendas").select("id, data, numero_nf_venda, cliente, quantidade_pneus, valor_venda, vendedor, comissao").order("data", { ascending: false }),
    sb.from("clientes_pendentes").select("*").eq("created_by", currentUser.id).order("created_at", { ascending: false }),
    sb.from("user_preferences").select("tema, notif_mudanca_etapa").eq("user_id", currentUser.id).maybeSingle(),
    sb.from("configuracoes_site").select("proposta_validade_dias, estoque_baixo_limite").maybeSingle()
  ]);
  if (produtosRes.error) toast("Erro ao carregar produtos.");
  if (precosRes.error) toast("Erro ao carregar tabela de preços.");
  if (movimentosRes.error) toast("Erro ao carregar movimentações de estoque.");
  if (entregasRes.error) toast("Erro ao carregar entregas.");
  if (vendasRes.error) toast("Erro ao carregar vendas (meu desempenho ficará incompleto).");
  produtos = produtosRes.data || [];
  produtosPrecos = precosRes.data || [];
  movimentos = movimentosRes.data || [];
  entregas = entregasRes.data || [];
  vendas = vendasRes.data || [];
  meusPreCadastros = preCadastrosRes.data || [];
  currentUserTema = (prefRes.data && prefRes.data.tema) || null;
  currentUserNotifMudancaEtapa = prefRes.data ? prefRes.data.notif_mudanca_etapa !== false : true;
  propostaValidadeDias = (configRes.data && configRes.data.proposta_validade_dias) || 14;
  ESTOQUE_BAIXO_LIMITE = (configRes.data && configRes.data.estoque_baixo_limite) || 20;
  if (currentUserTema && localStorage.getItem(THEME_KEY) !== currentUserTema) {
    localStorage.setItem(THEME_KEY, currentUserTema);
    applyThemeChoice(currentUserTema);
  }
  atualizarAlertaMudancaEtapa();

  document.getElementById("repDataPedido").textContent = formatDateBR(todayISO());
  document.getElementById("preCadEstado").innerHTML = UF_LIST.map(uf => `<option value="${uf}">${uf}</option>`).join("");
  document.getElementById("repCatalogoRegiao").innerHTML = `<option value="">Selecione…</option>` + CATALOGO_REGIOES.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  document.getElementById("repCatalogoCondicao").innerHTML = `<option value="">Selecione…</option>` + CATALOGO_CONDICOES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const tipoClienteOpcoesHtml = `<option value="">Selecione…</option>` + TIPO_CLIENTE_OPCOES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(TIPO_CLIENTE_LABEL[t])}</option>`).join("");
  document.getElementById("repCatalogoTipoCliente").innerHTML = tipoClienteOpcoesHtml;
  document.getElementById("preCadTipoCliente").innerHTML = tipoClienteOpcoesHtml;

  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("repShell").style.display = "block";
  initForm();
  initRepTabs();
  initRepCatalogo();
  initRepEntregas();
  initPreCadastroForm();
  initThemeToggle();
  initMinhasConfiguracoes();
  initRepDashboard();
  renderRepCatalogo();
  renderRepEntregas();
  renderMeusPreCadastros();
  renderAcompanhamento();
  subscribeRealtimeRep();
}

/* ---------------- cliente ---------------- */

async function buscarClienteRep() {
  const docInput = document.getElementById("repDocumento").value;
  const docNormalizado = normalizarDocumento(docInput);
  const erroEl = document.getElementById("repClienteErro");
  erroEl.style.display = "none";
  document.getElementById("repClienteGrid").style.display = "none";
  document.getElementById("repItensBox").style.display = "none";
  clienteAtual = null;

  if (!docNormalizado) {
    erroEl.textContent = "Digite o CNPJ ou CPF do cliente.";
    erroEl.style.display = "block";
    return;
  }

  const { data, error } = await sb.from("clientes")
    .select("nome, razao_social, documento, endereco, estado, cidade, tipo_cliente");

  if (error) {
    erroEl.textContent = "Erro ao consultar cliente. Tente novamente.";
    erroEl.style.display = "block";
    return;
  }

  const encontrado = (data || []).find(c => normalizarDocumento(c.documento) === docNormalizado);
  if (!encontrado) {
    erroEl.textContent = "Cliente não encontrado — solicite o cadastro antes de continuar.";
    erroEl.style.display = "block";
    return;
  }

  clienteAtual = encontrado;
  document.getElementById("repClienteNome").textContent = encontrado.nome || "—";
  document.getElementById("repRazaoSocial").textContent = encontrado.razao_social || "—";
  document.getElementById("repEndereco").textContent = [encontrado.endereco, encontrado.cidade, encontrado.estado].filter(Boolean).join(" — ") || "—";
  document.getElementById("repVendedorDisplay").textContent = currentUserNome;
  document.getElementById("repClienteGrid").style.display = "flex";
  document.getElementById("repItensBox").style.display = "block";

  document.getElementById("repCatalogoRegiao").value = UF_PARA_REGIAO[encontrado.estado] || "";
  document.getElementById("repCatalogoTipoCliente").value = encontrado.tipo_cliente || "";
  document.querySelectorAll("#repItens tr").forEach(tr => {
    preencherValorSugerido(tr, tr.querySelector(".rep-item-produto").value);
  });

  if (!document.querySelectorAll("#repItens tr").length) {
    document.getElementById("repItens").appendChild(createItemRowRep());
    updateRemoveVisibilityRep();
  }
}

/* ---------------- itens ---------------- */

// Destaca a parte do texto que bateu com o termo digitado (achado igual em
// vários lugares do app -- busca simples de substring, não regex).
function destacarBuscaProduto(texto, termo) {
  if (!termo) return escapeHtml(texto);
  const i = texto.toLowerCase().indexOf(termo.toLowerCase());
  if (i === -1) return escapeHtml(texto);
  return escapeHtml(texto.slice(0, i)) + "<mark>" + escapeHtml(texto.slice(i, i + termo.length)) + "</mark>" + escapeHtml(texto.slice(i + termo.length));
}

const PRODUTO_COMBO_LIMITE = 50;

function renderProdutoComboLista(lista, termo) {
  const t = termo.trim().toLowerCase();
  const achados = t
    ? produtos.filter(p => p.codigo.toLowerCase().includes(t) || p.medida.toLowerCase().includes(t))
    : produtos;
  if (achados.length === 0) {
    lista.innerHTML = `<div class="produto-combo-empty">Nenhum produto encontrado.</div>`;
    lista.classList.add("show");
    return;
  }
  const cortado = achados.length > PRODUTO_COMBO_LIMITE;
  lista.innerHTML = achados.slice(0, PRODUTO_COMBO_LIMITE).map(p => `
    <div class="produto-combo-item" data-codigo="${escapeHtml(p.codigo)}" data-medida="${escapeHtml(p.medida)}">
      <span class="med">${destacarBuscaProduto(p.medida, termo)}</span>
      <span class="cod">${destacarBuscaProduto(p.codigo, termo)}</span>
    </div>
  `).join("") + (cortado ? `<div class="produto-combo-empty">+${achados.length - PRODUTO_COMBO_LIMITE} outros — digite mais pra refinar</div>` : "");
  lista.classList.add("show");
}

function createItemRowRep() {
  itemRowSeq++;
  const tr = document.createElement("tr");
  tr.dataset.rowId = itemRowSeq;
  tr.innerHTML = `
    <td>
      <div class="produto-combo">
        <input type="text" class="rep-item-produto-busca" placeholder="Digite o código ou a medida..." autocomplete="off">
        <input type="hidden" class="rep-item-produto">
        <div class="produto-combo-lista"></div>
      </div>
    </td>
    <td class="num"><input type="number" class="rep-item-qtd" min="1" step="1" placeholder="Qtd"></td>
    <td class="num"><input type="number" class="rep-item-valor" min="0" step="0.01" placeholder="0,00"></td>
    <td class="num"><input type="number" class="rep-item-desconto" min="0" max="100" step="0.01" placeholder="0"></td>
    <td class="num rep-item-valor-total">${formatMoney(0)}</td>
    <td><button type="button" class="rep-item-remove" title="Remover item">×</button></td>
  `;
  tr.querySelectorAll(".rep-item-qtd, .rep-item-valor, .rep-item-desconto").forEach(inp => {
    inp.addEventListener("input", recalcularTotais);
  });
  // Marca o valor como digitado à mão -- só dispara em digitação de verdade
  // (setar .value por JS, como preencherValorSugerido faz, não dispara "input"),
  // então dá pra distinguir sugestão automática de edição manual sem precisar
  // rastrear estado à parte (achado em revisão de código).
  tr.querySelector(".rep-item-valor").addEventListener("input", (e) => {
    e.target.dataset.manual = "1";
  });

  // Busca de produto: campo de texto (filtra por código OU medida) + lista de
  // sugestões, em vez do <select> nativo com todos os produtos -- pedido do
  // usuário, mais fácil de achar a medida digitando o código. `.rep-item-produto`
  // (hidden) continua guardando só o código, igual antes -- todo o resto do
  // código (preencherValorSugerido, salvarPedidoRep etc.) lê só esse .value,
  // sem precisar saber que por trás agora é um campo de busca.
  const buscaInput = tr.querySelector(".rep-item-produto-busca");
  const codigoInput = tr.querySelector(".rep-item-produto");
  const combolista = tr.querySelector(".produto-combo-lista");

  function selecionarProduto(codigo, medida) {
    buscaInput.value = `${codigo} — ${medida}`;
    codigoInput.value = codigo;
    combolista.classList.remove("show");
    // Trocou de produto na linha -- o valor manual antigo era de OUTRO pneu,
    // não faz sentido continuar "travado" pro produto novo.
    delete tr.querySelector(".rep-item-valor").dataset.manual;
    preencherValorSugerido(tr, codigo);
  }

  buscaInput.addEventListener("input", () => {
    codigoInput.value = "";
    renderProdutoComboLista(combolista, buscaInput.value);
  });
  buscaInput.addEventListener("focus", () => renderProdutoComboLista(combolista, buscaInput.value));
  buscaInput.addEventListener("blur", () => {
    // pequeno atraso pra deixar o "mousedown" da lista disparar antes do blur
    // fechar tudo -- clicar numa opção conta como clique, não como "saiu do campo"
    setTimeout(() => combolista.classList.remove("show"), 150);
  });
  buscaInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") combolista.classList.remove("show");
  });
  combolista.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".produto-combo-item");
    if (!item) return;
    selecionarProduto(item.dataset.codigo, item.dataset.medida);
  });

  tr.querySelector(".rep-item-remove").addEventListener("click", () => {
    tr.remove();
    recalcularTotais();
    updateRemoveVisibilityRep();
  });
  return tr;
}

function preencherValorSugerido(tr, codigo) {
  if (!codigo) return;
  const valorInput = tr.querySelector(".rep-item-valor");
  // Representante já digitou um valor à mão nessa linha -- não mexe. Sem isso,
  // mudar região/tipo/condição enquanto ainda está preenchendo os filtros
  // (comum -- ninguém preenche os 3 de uma vez) apagava o valor digitado, sem
  // ter preço nenhum pra sugerir no lugar (achado em revisão de código).
  if (valorInput.dataset.manual === "1") return;
  const regiao = document.getElementById("repCatalogoRegiao").value;
  const tipoCliente = document.getElementById("repCatalogoTipoCliente").value;
  const condicao = document.getElementById("repCatalogoCondicao").value;
  // sem os 3 filtros preenchidos, ou sem preço cadastrado pra essa combinação,
  // limpa o campo -- nunca deixa um valor de uma combinação anterior (regiao/
  // tipo/condição diferente, ou já desmarcada) parecer que ainda é o certo.
  const preco = (regiao && tipoCliente && condicao)
    ? produtosPrecos.find(p =>
        p.codigo === codigo && p.regiao === regiao && p.tipo_cliente === tipoCliente && p.condicao_pagamento === condicao)
    : null;
  valorInput.value = preco ? Number(preco.preco).toFixed(2) : "";
  recalcularTotais();
}

function updateRemoveVisibilityRep() {
  const rows = document.querySelectorAll("#repItens tr");
  rows.forEach(r => { r.querySelector(".rep-item-remove").style.visibility = rows.length > 1 ? "visible" : "hidden"; });
}

/* ---------------- catálogo (somente leitura) ---------------- */

const CATALOGO_BUCKET = "produtos-fotos";
const repCatalogoPrazosAbertos = new Set();

function fotoProdutoUrlRep(path) {
  if (!path) return null;
  const { data } = sb.storage.from(CATALOGO_BUCKET).getPublicUrl(path);
  return data ? data.publicUrl : null;
}

function getPrecoProdutoRep(codigo, regiao, tipoCliente, condicao) {
  const p = produtosPrecos.find(x => x.codigo === codigo && x.regiao === regiao && x.tipo_cliente === tipoCliente && x.condicao_pagamento === condicao);
  return p ? Number(p.preco) : null;
}

function populateRepCatalogoFiltros() {
  const selCategoria = document.getElementById("repCatFiltroCategoria");
  const atual = selCategoria.value;
  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort();
  // valor da option continua o bruto (comparado direto contra p.categoria) -- só o texto
  // mostrado passa pela normalização, senão o dropdown mostrava "CARGAS_TBR" em vez de "Cargas/TBR"
  selCategoria.innerHTML = `<option value="">Todas</option>` + categorias.map(c =>
    `<option value="${escapeHtml(c)}">${escapeHtml(CATEGORIA_NORM_LOOKUP[normalizarCategoria(c)] || c)}</option>`
  ).join("");
  if (categorias.includes(atual)) selCategoria.value = atual;

  const selCondicao = document.getElementById("repCatCondicaoView");
  if (selCondicao.options.length <= 1) {
    selCondicao.innerHTML = `<option value="">Todas as condições</option>` + CATALOGO_CONDICOES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }
  const selRegiao = document.getElementById("repCatRegiao");
  if (selRegiao.options.length <= 1) {
    selRegiao.innerHTML = `<option value="">Todas as regiões</option>` + CATALOGO_REGIOES.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  }

  const opcoesHtml = TIPO_CLIENTE_OPCOES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(TIPO_CLIENTE_LABEL[t])}</option>`).join("");
  // "Todos os tipos" só existe no filtro da lista (mostra todos os pneus, sem valores); o
  // seletor do modal precisa de um tipo concreto pra montar a grade de preços.
  [[document.getElementById("repCatTipoClienteView"), `<option value="${CATALOGO_TODOS_TIPOS}">Todos os tipos</option>`],
   [document.getElementById("repCatalogoModalTipoCliente"), ""]].forEach(([sel, extra]) => {
    if (sel && sel.options.length === 0) {
      sel.innerHTML = extra + opcoesHtml;
      sel.value = "CONSUMO";
    }
  });
}

function getPrecosDoProdutoRep(codigo, tipoCliente) {
  return produtosPrecos.filter(p => p.codigo === codigo && (!tipoCliente || p.tipo_cliente === tipoCliente));
}

function buildPrecoMatrixHtmlRep(codigo, tipoCliente) {
  const precos = getPrecosDoProdutoRep(codigo, tipoCliente);
  if (precos.length === 0) {
    return `<div class="muted" style="padding:8px 0;">Nenhum preço cadastrado para este produto (${escapeHtml(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente)}) ainda.</div>`;
  }
  const linhas = CATALOGO_CONDICOES.map(cond => {
    const cells = CATALOGO_REGIOES.map(r => precos.find(x => x.regiao === r && x.condicao_pagamento === cond));
    if (cells.every(c => !c)) return "";
    return `<tr><td class="mono">${escapeHtml(cond)}</td>${cells.map(c => `<td class="num mono">${c ? formatMoney(Number(c.preco)) : "—"}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="catalogo-preco-table">
    <thead><tr><th>Condição</th>${CATALOGO_REGIOES.map(r => `<th>${escapeHtml(r)}</th>`).join("")}</tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`;
}

// Pneus que o Catálogo considera antes dos filtros de preço -- mesma regra do Catálogo interno
// (app.js catalogoProdutosVisiveis()), exceto que aqui o representante SEMPRE só vê o que tem
// estoque (essa parte já era assim antes e continua igual -- é a regra intencional do portal).
function catalogoProdutosVisiveisRep(search, categoria) {
  let rows = produtos.filter(p => p.situacao !== "DESCONTINUADO" && computeSaldoProduto(p.codigo) > 0);
  if (search) {
    rows = rows.filter(p =>
      p.codigo.toLowerCase().includes(search) ||
      p.medida.toLowerCase().includes(search) ||
      (p.modelo || "").toLowerCase().includes(search)
    );
  }
  if (categoria) rows = rows.filter(p => p.categoria === categoria);
  return rows;
}

function renderRepCatalogo() {
  populateRepCatalogoFiltros();

  const search = (document.getElementById("repCatSearch").value || "").trim().toLowerCase();
  const categoria = document.getElementById("repCatFiltroCategoria").value;
  const condicao = document.getElementById("repCatCondicaoView").value;
  const regiao = document.getElementById("repCatRegiao").value;
  const tipoSelecionado = document.getElementById("repCatTipoClienteView").value || "CONSUMO";
  const todosTipos = tipoSelecionado === CATALOGO_TODOS_TIPOS;
  const tipoCliente = todosTipos ? "CONSUMO" : tipoSelecionado;
  const tipoFiltro = todosTipos ? "" : tipoCliente;

  let rows = catalogoProdutosVisiveisRep(search, categoria);

  // Pneu com preço só aparece se tiver preço que bata com TODOS os filtros de preço ativos
  // (tipo de cliente sempre, condição/região quando escolhidas); pneu sem preço NENHUM
  // aparece com o aviso "Sem preço cadastrado" -- mesma regra do Catálogo interno.
  const codigosComPreco = new Set(produtosPrecos.map(x => x.codigo));
  const rowsAntesFiltroPreco = rows.length;
  rows = rows.filter(p => !codigosComPreco.has(p.codigo)
    ? (!condicao && !regiao)
    : getPrecosDoProdutoRep(p.codigo, tipoFiltro).some(x =>
        (!condicao || x.condicao_pagamento === condicao) && (!regiao || x.regiao === regiao)
      ));

  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const semPrecoMostrados = rows.filter(p => !codigosComPreco.has(p.codigo)).length;
  const ocultos = rowsAntesFiltroPreco - rows.length;
  const partesContador = [`Mostrando <span class="num">${fmt(rows.length)}</span> de <span class="num">${fmt(rowsAntesFiltroPreco)}</span> pneus`];
  if (semPrecoMostrados) partesContador.push(`<span class="num">${fmt(semPrecoMostrados)}</span> sem preço cadastrado`);
  if (ocultos) {
    partesContador.push(`<span class="aviso-oculto">${condicao || regiao
      ? `${fmt(ocultos)} sem preço que bata com os filtros de preço`
      : `${fmt(ocultos)} ${ocultos === 1 ? "tem" : "têm"} preço só de outro tipo de cliente — escolha "Todos os tipos" para ver`}</span>`);
  }
  document.getElementById("repCatalogoContador").innerHTML = partesContador.map(t => `<span>${t}</span>`).join("");

  const grid = document.getElementById("repCatalogoGrid");
  const empty = document.getElementById("repCatalogoEmpty");
  if (rows.length === 0) {
    const alvoPartes = [];
    if (!todosTipos) alvoPartes.push(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente);
    if (condicao) alvoPartes.push(condicao);
    if (regiao) alvoPartes.push(`região ${regiao}`);
    const alvo = alvoPartes.join(" · ");
    grid.innerHTML = "";
    empty.textContent = rowsAntesFiltroPreco > 0
      ? (todosTipos
          ? `Nenhum pneu com preço cadastrado para ${alvo} (entre os que batem com a busca e a categoria).`
          : `Nenhum pneu com preço de ${alvo} cadastrado (entre os que batem com a busca e a categoria).`)
      : "Nenhum produto em estoque encontrado.";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const condicaoAtual = condicao || "A VISTA";

  grid.innerHTML = rows.map(p => {
    const fotoUrl = fotoProdutoUrlRep(p.foto_path);
    const fotoUrl2 = fotoProdutoUrlRep(p.foto_path_2);
    const fotosCard = [fotoUrl, fotoUrl2].filter(Boolean);
    const aberto = repCatalogoPrazosAbertos.has(p.codigo);
    const specs = [
      ["PR / Lonas", p.pr], ["Cintas", p.cintas], ["Cap. carga", p.cap_carga],
      ["PSI", p.psi], ["Sulco (mm)", p.sulco_mm], ["Peso (kg)", p.peso_kg]
    ];
    const temAlgumSpec = specs.some(([, v]) => v);
    const saldoProduto = computeSaldoProduto(p.codigo);
    const statusSaldo = statusEstoque(saldoProduto);

    const semPrecoNenhum = !codigosComPreco.has(p.codigo);
    const chipsTipos = todosTipos ? TIPO_CLIENTE_OPCOES.map(t => {
      const tem = getPrecosDoProdutoRep(p.codigo, t).some(x =>
        (!condicao || x.condicao_pagamento === condicao) && (!regiao || x.regiao === regiao));
      return `<span class="cat-tipo-chip${tem ? " tem" : ""}">${tem ? "✓ " : "— "}${escapeHtml(TIPO_CLIENTE_LABEL[t])}</span>`;
    }).join("") : "";
    const temPrecoNestaCondicao = getPrecosDoProdutoRep(p.codigo, tipoCliente)
      .some(x => x.condicao_pagamento === condicaoAtual && (!regiao || x.regiao === regiao));
    // Card compacto: só as regiões COM preço pra essa condição (linha "—" escondida); com
    // região filtrada, mostra só ela. A tabela "Ver todos os prazos" mostra tudo, com "—".
    const precoPorRegiao = temPrecoNestaCondicao ? CATALOGO_REGIOES
      .filter(r => !regiao || r === regiao)
      .map(r => ({ r, preco: getPrecoProdutoRep(p.codigo, r, tipoCliente, condicaoAtual) }))
      .filter(x => x.preco !== null)
      .map(({ r, preco }) => `<div class="catalogo-prazo-row">
        <span>${escapeHtml(r)}</span>
        <span class="mono">${formatMoney(preco)}</span>
      </div>`).join("") : "";

    // foto em destaque: 2 fotos dividem lado a lado, 1 ocupa tudo, 0 mostra um placeholder
    const slotsFoto = fotosCard.length > 0 ? fotosCard : [null];
    const fotoHeroHtml = slotsFoto.map((url, i) => `
      <div class="catalogo-card-foto-slot" ${url ? `data-repcatfoto="${escapeHtml(p.codigo)}" data-repcatfotoidx="${i}"` : ""}>
        ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(p.codigo)}">` : `<div class="catalogo-foto-vazia"><svg class="ic" viewBox="0 0 20 20"><use href="#i-image"/></svg></div>`}
      </div>
    `).join("");

    return `
      <div class="catalogo-card" data-repcatcard="${escapeHtml(p.codigo)}">
        <div class="catalogo-foto-hero">${fotoHeroHtml}</div>
        <div class="catalogo-foto-overlay-top">
          ${p.categoria ? `<span class="catalogo-badge">${escapeHtml(CATEGORIA_NORM_LOOKUP[normalizarCategoria(p.categoria)] || p.categoria)}</span>` : "<span></span>"}
          <span class="status-pill pill-${statusSaldo}">${saldoProduto > 0 ? `${fmt(saldoProduto)} un.` : "Sem estoque"}</span>
        </div>
        <button type="button" class="catalogo-card-editbtn" data-repeditcard="${escapeHtml(p.codigo)}" title="Ver no Catálogo (fotos e preços)">
          <svg class="ic" viewBox="0 0 20 20"><use href="#i-pencil"/></svg>
        </button>
        ${fotosCard.length > 1 ? `<span class="catalogo-foto-count"><svg class="ic" viewBox="0 0 20 20"><use href="#i-image"/></svg>${fotosCard.length} fotos</span>` : ""}

        <div class="catalogo-card-body">
          <div class="catalogo-card-titulo-wrap">
            <div class="catalogo-card-titulo">${escapeHtml(p.modelo || p.codigo)}</div>
            <div class="catalogo-card-codigo mono muted">${escapeHtml(p.codigo)}</div>
          </div>
          <div class="catalogo-card-medida">${escapeHtml(p.medida)}</div>

        ${temAlgumSpec ? `
          <div class="catalogo-card-divider"></div>
          <div class="catalogo-specs-grid">
            ${specs.map(([lbl, v]) => `<div><span class="lbl">${escapeHtml(lbl)}</span><span class="val">${v ? escapeHtml(v) : "—"}</span></div>`).join("")}
          </div>
        ` : ""}

        <div class="catalogo-card-divider"></div>
        ${semPrecoNenhum ? `<div class="catalogo-preco-aviso" style="margin-top:0;">Sem preço cadastrado ainda.</div>` : todosTipos ? `
        <div class="catalogo-preco-condicao">Preços cadastrados</div>
        <div class="cat-tipos">${chipsTipos}</div>
        <div class="cat-dica">Escolha um tipo de cliente acima para ver os valores.</div>` : `
        <div class="catalogo-preco-condicao">Preço —${escapeHtml(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente)} · ${escapeHtml(condicaoAtual)}${regiao ? ` · ${escapeHtml(regiao)}` : ""}</div>
        ${temPrecoNestaCondicao
          ? `<div class="catalogo-prazos-lista aberto">${precoPorRegiao}</div>`
          : `<div class="catalogo-preco-aviso">Tem preço de ${escapeHtml(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente)}, mas não pra "${escapeHtml(condicaoAtual)}"${regiao ? ` na região ${escapeHtml(regiao)}` : ""}. Veja "Ver todos os prazos" abaixo.</div>`}

        <button type="button" class="btn small outline" style="width:100%;margin-top:10px;" data-reptoggleprazos="${escapeHtml(p.codigo)}">${aberto ? "Ocultar todos os prazos" : "Ver todos os prazos"}</button>
        <div class="catalogo-prazos-matriz" style="display:${aberto ? "" : "none"};">
          ${aberto ? buildPrecoMatrixHtmlRep(p.codigo, tipoCliente) : ""}
        </div>`}
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-repeditcard]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRepCatalogoModal(btn.dataset.repeditcard);
    });
  });
  grid.querySelectorAll("[data-repcatfoto]").forEach(slotEl => {
    slotEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const prod = produtos.find(x => x.codigo === slotEl.dataset.repcatfoto);
      if (!prod) return;
      const urls = [fotoProdutoUrlRep(prod.foto_path), fotoProdutoUrlRep(prod.foto_path_2)].filter(Boolean);
      openCatalogoFotoLightbox(urls, Number(slotEl.dataset.repcatfotoidx) || 0);
    });
  });
  grid.querySelectorAll("[data-reptoggleprazos]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const codigo = btn.dataset.reptoggleprazos;
      if (repCatalogoPrazosAbertos.has(codigo)) repCatalogoPrazosAbertos.delete(codigo);
      else repCatalogoPrazosAbertos.add(codigo);
      renderRepCatalogo();
    });
  });
}

let repCatalogoEditingCodigo = null;

function renderRepCatalogoModalPrecos(codigo) {
  const tipoCliente = document.getElementById("repCatalogoModalTipoCliente").value || "CONSUMO";
  document.getElementById("repCatalogoModalPrecoWrap").innerHTML = buildPrecoMatrixHtmlRep(codigo, tipoCliente);
}

function openRepCatalogoModal(codigo) {
  const p = produtos.find(x => x.codigo === codigo);
  if (!p) return;
  repCatalogoEditingCodigo = codigo;

  document.getElementById("repCatalogoModalTitulo").textContent = `${p.codigo} — ${p.medida}`;

  const fotoUrl = fotoProdutoUrlRep(p.foto_path);
  const fotoUrl2 = fotoProdutoUrlRep(p.foto_path_2);
  const fotosModal = [fotoUrl, fotoUrl2].filter(Boolean);
  [[1, fotoUrl], [2, fotoUrl2]].forEach(([slot, url]) => {
    const previewEl = document.getElementById(`repCatalogoModalFotoPreview${slot}`);
    previewEl.classList.toggle("sem-foto", !url);
    previewEl.innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(p.codigo)} - foto ${slot}">`
      : `<div class="catalogo-foto-placeholder">Sem foto</div>`;
    previewEl.onclick = url ? () => openCatalogoFotoLightbox(fotosModal, fotosModal.indexOf(url)) : null;
  });

  const specs = [
    ["Marca", p.marca], ["Categoria", p.categoria ? (CATEGORIA_NORM_LOOKUP[normalizarCategoria(p.categoria)] || p.categoria) : ""], ["Modelo", p.modelo],
    ["Carcaça", p.carcaca === "RADIAL" ? "Radial" : p.carcaca === "DIAGONAL" ? "Diagonal" : ""],
    ["IC/IV", p.ic_iv], ["PR", p.pr], ["Cintas", p.cintas], ["Cap. carga", p.cap_carga], ["PSI", p.psi],
    ["Sulco (mm)", p.sulco_mm], ["Larg. banda (mm)", p.larg_banda_mm], ["Peso (kg)", p.peso_kg], ["NCM", p.ncm]
  ].filter(([, v]) => v);
  document.getElementById("repCatalogoModalInfo").innerHTML = specs.length
    ? specs.map(([lbl, v]) => `<div class="catalogo-info-row"><span class="lbl">${escapeHtml(lbl)}</span><span class="val">${escapeHtml(v)}</span></div>`).join("")
    : `<div class="muted">Nenhuma especificação técnica cadastrada ainda.</div>`;

  populateRepCatalogoFiltros();
  renderRepCatalogoModalPrecos(codigo);

  document.getElementById("repCatalogoModalOverlay").classList.add("show");
}

function closeRepCatalogoModal() {
  document.getElementById("repCatalogoModalOverlay").classList.remove("show");
  repCatalogoEditingCodigo = null;
}

/* ---------------- lightbox de fotos (catálogo) ---------------- */

let catalogoLightboxUrls = [];
let catalogoLightboxIndex = 0;

function renderCatalogoFotoLightbox() {
  const total = catalogoLightboxUrls.length;
  document.getElementById("catalogoFotoLightboxImg").src = catalogoLightboxUrls[catalogoLightboxIndex] || "";
  const temVarias = total > 1;
  document.getElementById("catalogoFotoLightboxPrev").style.display = temVarias ? "" : "none";
  document.getElementById("catalogoFotoLightboxNext").style.display = temVarias ? "" : "none";
  const counter = document.getElementById("catalogoFotoLightboxCounter");
  counter.style.display = temVarias ? "" : "none";
  if (temVarias) counter.textContent = `${catalogoLightboxIndex + 1} / ${total}`;
}

function openCatalogoFotoLightbox(urls, index) {
  catalogoLightboxUrls = Array.isArray(urls) ? urls : [urls];
  catalogoLightboxIndex = index || 0;
  renderCatalogoFotoLightbox();
  document.getElementById("catalogoFotoLightboxOverlay").classList.add("show");
}

function catalogoFotoLightboxPrev() {
  if (catalogoLightboxUrls.length < 2) return;
  catalogoLightboxIndex = (catalogoLightboxIndex - 1 + catalogoLightboxUrls.length) % catalogoLightboxUrls.length;
  renderCatalogoFotoLightbox();
}

function catalogoFotoLightboxNext() {
  if (catalogoLightboxUrls.length < 2) return;
  catalogoLightboxIndex = (catalogoLightboxIndex + 1) % catalogoLightboxUrls.length;
  renderCatalogoFotoLightbox();
}

function closeCatalogoFotoLightbox() {
  document.getElementById("catalogoFotoLightboxOverlay").classList.remove("show");
  document.getElementById("catalogoFotoLightboxImg").src = "";
  catalogoLightboxUrls = [];
}

function initRepCatalogo() {
  document.getElementById("repCatSearch").addEventListener("input", renderRepCatalogo);
  document.getElementById("repCatFiltroCategoria").addEventListener("change", renderRepCatalogo);
  document.getElementById("repCatCondicaoView").addEventListener("change", renderRepCatalogo);
  document.getElementById("repCatRegiao").addEventListener("change", renderRepCatalogo);
  document.getElementById("repCatTipoClienteView").addEventListener("change", renderRepCatalogo);

  document.getElementById("repCatalogoModalClose").addEventListener("click", closeRepCatalogoModal);
  document.getElementById("repCatalogoModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "repCatalogoModalOverlay") closeRepCatalogoModal();
  });
  document.getElementById("repCatalogoModalTipoCliente").addEventListener("change", () => {
    if (repCatalogoEditingCodigo) renderRepCatalogoModalPrecos(repCatalogoEditingCodigo);
  });

  document.getElementById("catalogoFotoLightboxClose").addEventListener("click", closeCatalogoFotoLightbox);
  document.getElementById("catalogoFotoLightboxOverlay").addEventListener("click", (e) => {
    if (e.target.id === "catalogoFotoLightboxOverlay") closeCatalogoFotoLightbox();
  });
  document.getElementById("catalogoFotoLightboxPrev").addEventListener("click", (e) => { e.stopPropagation(); catalogoFotoLightboxPrev(); });
  document.getElementById("catalogoFotoLightboxNext").addEventListener("click", (e) => { e.stopPropagation(); catalogoFotoLightboxNext(); });
}

function recalcularTotais() {
  let total = 0;
  document.querySelectorAll("#repItens tr").forEach(tr => {
    const qtd = parseFloat(tr.querySelector(".rep-item-qtd").value) || 0;
    const valorUnit = parseFloat(tr.querySelector(".rep-item-valor").value) || 0;
    const desconto = parseFloat(tr.querySelector(".rep-item-desconto").value) || 0;
    const valorTotal = qtd * valorUnit * (1 - desconto / 100);
    tr.querySelector(".rep-item-valor-total").textContent = formatMoney(valorTotal);
    total += valorTotal;
  });
  document.getElementById("repTotalGeral").textContent = formatMoney(total);
}

/* ---------------- impressão ---------------- */

function buildPedidoPrintHtml(pedido) {
  const itensHtml = pedido.itens.map(it => {
    const prod = produtos.find(p => p.codigo === it.codigo);
    const specParts = prod ? [prod.categoria, prod.pr ? prod.pr + "PR" : "", prod.capCarga ? "carga " + prod.capCarga : ""].filter(Boolean) : [];
    return `
      <tr>
        <td>
          ${escapeHtml(prod ? prod.medida : it.codigo)}
          ${specParts.length ? `<div class="ficha-spec">${escapeHtml(specParts.join(" · "))}</div>` : ""}
        </td>
        <td class="num mono">${fmt(it.quantidade)}</td>
        <td class="num mono">${formatMoney(it.valorUnitario)}</td>
        <td class="num mono">${formatMoney(it.valorTotal)}</td>
      </tr>
    `;
  }).join("");
  const total = pedido.itens.reduce((a, it) => a + it.valorTotal, 0);
  const dataEmissao = new Date(pedido.data + "T00:00:00");
  const dataValidade = new Date(dataEmissao.getTime() + propostaValidadeDias * 24 * 3600 * 1000);
  const validadeStr = formatDateBR(dataValidade.toISOString().slice(0, 10));
  const contatoVendedor = [pedido.vendedor, (currentUser && currentUser.email) || null].filter(Boolean).join(" — ");
  const tabelaPreco = [pedido.tabela_preco_regiao, TIPO_CLIENTE_LABEL[pedido.tabela_preco_tipo_cliente] || null, pedido.tabela_preco_condicao].filter(Boolean).join(" · ");

  return `
    <div class="ficha-proposta">
      <div class="ficha-top">
        <div class="ficha-brand">TORUN <span>PNEUS</span></div>
        <div class="ficha-meta">PROPOSTA <b>Nº ${escapeHtml(pedido.numero_pedido)}</b><br>Emitida ${formatDateBR(pedido.data)} · Válida até <b>${validadeStr}</b></div>
      </div>
      <div class="ficha-section-title">Dados do cliente</div>
      <div class="ficha-info">
        <div><b>Cliente</b>${escapeHtml(pedido.cliente || "—")}</div>
        <div><b>CNPJ/CPF</b>${escapeHtml(pedido.documento_cliente || "—")}</div>
        <div><b>Endereço de entrega</b>${escapeHtml(pedido.destino || "—")}</div>
        <div><b>Condição de frete</b>${escapeHtml(pedido.condicao_frete || "—")}</div>
      </div>
      <table class="ficha-table">
        <thead><tr><th>Item</th><th>Qtd.</th><th>Vl. unitário</th><th>Total</th></tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>
      <div class="ficha-foot">
        <div class="ficha-terms">
          <div class="ficha-term"><span>Pagamento</span><b>${escapeHtml(pedido.condicao_pagamento || "—")}</b></div>
          <div class="ficha-term"><span>Forma</span><b>${escapeHtml(pedido.forma_pagamento || "—")}</b></div>
          ${tabelaPreco ? `<div class="ficha-term"><span>Tabela</span><b>${escapeHtml(tabelaPreco)}</b></div>` : ""}
        </div>
        <div class="ficha-total">${formatMoney(total)}</div>
      </div>
      <div class="ficha-bottom">
        <span>${escapeHtml(contatoVendedor || "—")}</span>
        <span>Proposta sujeita a confirmação de estoque</span>
      </div>
      ${(pedido.obs || pedido.obs_impressao_nf) ? `
        <div class="ficha-obs">
          ${pedido.obs ? `<div><b>Observações:</b> ${escapeHtml(pedido.obs)}</div>` : ""}
          ${pedido.obs_impressao_nf ? `<div><b>Observações para impressão na NF:</b> ${escapeHtml(pedido.obs_impressao_nf)}</div>` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

/* ---------------- form ---------------- */

function resetFormularioRep() {
  document.getElementById("formPedidoRepresentante").reset();
  document.getElementById("formPedidoRepresentante").style.display = "block";
  document.getElementById("repConfirmacao").style.display = "none";
  document.getElementById("repConfirmacaoReserva").style.display = "none";
  document.getElementById("repClienteGrid").style.display = "none";
  document.getElementById("repItensBox").style.display = "none";
  document.getElementById("repItens").innerHTML = "";
  document.getElementById("repClienteErro").style.display = "none";
  document.getElementById("repNumeroPedido").textContent = "a gerar";
  clienteAtual = null;
  ultimoPedidoSalvo = null;
}

let formInitialized = false;
function initForm() {
  if (formInitialized) return;
  formInitialized = true;

  document.getElementById("btnBuscarCliente").addEventListener("click", buscarClienteRep);
  document.getElementById("repDocumento").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); buscarClienteRep(); }
  });
  document.getElementById("btnAddItemRep").addEventListener("click", () => {
    document.getElementById("repItens").appendChild(createItemRowRep());
    updateRemoveVisibilityRep();
  });
  ["repCatalogoRegiao", "repCatalogoTipoCliente", "repCatalogoCondicao"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      document.querySelectorAll("#repItens tr").forEach(tr => {
        preencherValorSugerido(tr, tr.querySelector(".rep-item-produto").value);
      });
    });
  });
  document.getElementById("btnNovoPedidoRep").addEventListener("click", resetFormularioRep);
  document.getElementById("btnImprimirPedidoRep").addEventListener("click", () => {
    if (!ultimoPedidoSalvo) return;
    document.getElementById("printArea").innerHTML = buildPedidoPrintHtml(ultimoPedidoSalvo);
    window.print();
  });

  document.getElementById("formPedidoRepresentante").addEventListener("submit", (e) => {
    e.preventDefault();
    salvarPedidoRep();
  });
}

async function salvarPedidoRep() {
  if (!clienteAtual) {
    toast("Busque um cliente antes de salvar.");
    return;
  }
  const rows = Array.from(document.querySelectorAll("#repItens tr"));
  const itens = [];
  for (const tr of rows) {
    const codigo = tr.querySelector(".rep-item-produto").value;
    const qtdRaw = tr.querySelector(".rep-item-qtd").value;
    const valorRaw = tr.querySelector(".rep-item-valor").value;
    const desconto = parseFloat(tr.querySelector(".rep-item-desconto").value) || 0;
    if (!codigo && !qtdRaw && !valorRaw) continue;
    const qtd = parseFloat(qtdRaw);
    const valorUnit = parseFloat(valorRaw);
    if (!codigo || !qtd || qtd <= 0 || !(valorUnit >= 0)) {
      toast("Preencha produto, quantidade e valor unitário em todos os itens.");
      return;
    }
    const valorTotal = qtd * valorUnit * (1 - desconto / 100);
    itens.push({ codigo, quantidade: qtd, valorUnitario: valorUnit, desconto, valorTotal });
  }
  if (!itens.length) {
    toast("Adicione ao menos um item ao pedido.");
    return;
  }
  const btnProposta = document.getElementById("btnGerarPropostaRep");
  btnProposta.disabled = true;
  const labelOriginal = btnProposta.textContent;
  btnProposta.textContent = "Salvando...";

  const resetBotoes = () => {
    btnProposta.disabled = false;
    btnProposta.textContent = labelOriginal;
  };

  const { data: numeroData, error: numeroError } = await sb.rpc("proximo_numero_pedido_representante");
  if (numeroError) {
    toast("Erro ao gerar número: " + numeroError.message);
    resetBotoes();
    return;
  }
  const numeroFormatado = String(numeroData).padStart(6, "0");

  const payload = {
    id: uid("ped"),
    numero_pedido: numeroFormatado,
    data: todayISO(),
    vendedor: currentUserNome,
    cliente: clienteAtual.nome,
    razao_social: clienteAtual.razao_social || null,
    documento_cliente: clienteAtual.documento || null,
    destino: clienteAtual.endereco || null,
    condicao_frete: document.getElementById("repFrete").value.trim() || null,
    // Condição de pagamento não tem mais campo de texto próprio aqui -- vem
    // direto da "Tabela de preço — Condição de pagamento" dos Itens do
    // pedido, pra não perguntar a mesma coisa duas vezes com nomes parecidos.
    condicao_pagamento: document.getElementById("repCatalogoCondicao").value || null,
    forma_pagamento: document.getElementById("repFormaPagamento").value.trim() || null,
    obs: document.getElementById("repObs").value.trim() || null,
    obs_impressao_nf: document.getElementById("repObsImpressaoNF").value.trim() || null,
    itens,
    etapa: "PRE_VENDA",
    cte_status: "aguardando",
    origem: "representante",
    created_by: currentUser.id,
    reserva: false,
    reserva_status: null,
    reserva_expira_em: null,
    tabela_preco_regiao: document.getElementById("repCatalogoRegiao").value || null,
    tabela_preco_tipo_cliente: document.getElementById("repCatalogoTipoCliente").value || null,
    tabela_preco_condicao: document.getElementById("repCatalogoCondicao").value || null
  };

  const { error: insertError } = await sb.from("entregas").insert(payload).select();
  if (insertError) {
    resetBotoes();
    toast("Erro ao salvar: " + insertError.message);
    return;
  }

  resetBotoes();

  ultimoPedidoSalvo = payload;
  document.getElementById("repTipoConfirmado").textContent = "Proposta";
  document.getElementById("repNumeroConfirmado").textContent = numeroFormatado;
  document.getElementById("repNumeroPedido").textContent = numeroFormatado;
  document.getElementById("formPedidoRepresentante").style.display = "none";
  document.getElementById("repConfirmacao").style.display = "flex";
  document.getElementById("repConfirmacaoReserva").style.display = "none";
  entregas.unshift(payload);
  renderRepEntregas();
  acompanhamentoSelecionadoId = payload.id;
  renderAcompanhamento();
}

/* ---------------- abas ---------------- */

const REP_TAB_IDS = {
  pedido: "repTabPedido", catalogo: "repTabCatalogo", entregas: "repTabEntregas",
  precadastro: "repTabPreCadastro", acompanhamento: "repTabAcompanhamento", dashboard: "repTabDashboard"
};

function initRepTabs() {
  document.querySelectorAll(".rep-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".rep-tab").forEach(t => t.classList.toggle("active", t === tab));
      const alvo = tab.dataset.reptab;
      Object.entries(REP_TAB_IDS).forEach(([nome, id]) => {
        const el = document.getElementById(id);
        el.classList.toggle("active", nome === alvo);
        el.style.display = nome === alvo ? "" : "none";
      });
      if (alvo === "acompanhamento") renderAcompanhamento();
      if (alvo === "catalogo") renderRepCatalogo();
      if (alvo === "dashboard") renderRepDashboard();
    });
  });
}

/* ---------------- meu desempenho (dashboard do vendedor) ---------------- */

// vendas.vendedor é texto livre digitado pela equipe interna ao faturar -- não tem vínculo
// direto com o login. Liga pelo nome batendo (sem diferenciar maiúsc./minúsc. ou espaço),
// mesmo risco de digitação que já existe hoje em qualquer relatório por vendedor.
function minhasVendas() {
  const meuNome = (currentUserNome || "").trim().toLowerCase();
  return vendas.filter(v => (v.vendedor || "").trim().toLowerCase() === meuNome);
}

let repDashMesAtual = null;

function formatMesLabel(mesIso) {
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [ano, mes] = mesIso.split("-");
  return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

function initRepDashboard() {
  document.getElementById("btnRepDashVoltar").addEventListener("click", () => {
    document.getElementById("repDashDetalheWrap").style.display = "none";
    document.getElementById("repDashListaWrap").style.display = "";
  });
  document.getElementById("repDashMesFiltro").addEventListener("change", (e) => {
    repDashMesAtual = e.target.value;
    renderRepDashboard();
  });
}

// eixo Y da evolução: arredonda o teto pra um número redondo acima do maior valor do ano,
// senão a grade fica com valores estranhos tipo "R$ 68.400,00" numa linha
function tetoArredondado(valor) {
  if (valor <= 0) return 100;
  const ordem = Math.pow(10, Math.floor(Math.log10(valor)));
  return Math.ceil(valor / ordem) * ordem;
}

function buildEvolucaoSvg(pontos, ano) {
  const teto = tetoArredondado(Math.max(...pontos.map(p => p.valor), 1));
  const passos = 4;
  const largura = 900, alturaBase = 220, alturaTexto = 240, margemEsq = 60, margemDir = 40;
  const passoX = (largura - margemEsq - margemDir) / (pontos.length - 1);
  const nomesMes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const anoCurto = String(ano).slice(2);
  const hoje = new Date();
  const mesAtualChave = String(hoje.getMonth() + 1).padStart(2, "0");
  const anoAtualReal = String(hoje.getFullYear());

  const coords = pontos.map((p, i) => ({
    x: margemEsq + i * passoX,
    y: alturaBase - (p.valor / teto) * (alturaBase - 20),
    ...p
  }));

  const linhaPoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `M${coords[0].x.toFixed(1)},${alturaBase} L` +
    coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L") +
    ` L${coords[coords.length - 1].x.toFixed(1)},${alturaBase} Z`;

  let gridEEixos = "";
  for (let i = 0; i <= passos; i++) {
    const valor = (teto / passos) * i;
    const y = alturaBase - (valor / teto) * (alturaBase - 20);
    gridEEixos += `<line x1="${margemEsq}" y1="${y.toFixed(1)}" x2="${largura - margemDir}" y2="${y.toFixed(1)}" stroke="#EFEEEA" stroke-width="1"/>`;
    gridEEixos += `<text x="${margemEsq - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6B6B6B" font-family="'Space Mono',monospace">${escapeHtml(formatMoney(valor))}</text>`;
  }

  const dots = coords.map(c =>
    `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="#FFFFFF" stroke="#FF6A13" stroke-width="2.5"/>`
  ).join("");
  const mesLabels = coords.map(c => {
    const ehAtual = c.mes === mesAtualChave && String(ano) === anoAtualReal;
    return `<text x="${c.x.toFixed(1)}" y="${alturaTexto}" text-anchor="middle" font-size="11" fill="${ehAtual ? "#161616" : "#6B6B6B"}" font-weight="${ehAtual ? "700" : "400"}">${nomesMes[parseInt(c.mes, 10) - 1]}/${anoCurto}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 900 250" width="100%" height="220" style="overflow:visible;">
      <defs>
        <linearGradient id="repDashAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF6A13" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#FF6A13" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridEEixos}
      <path d="${areaPath}" fill="url(#repDashAreaGrad)"/>
      <polyline points="${linhaPoints}" fill="none" stroke="#FF6A13" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${mesLabels}
    </svg>
  `;
}

function renderRepDashboard() {
  document.getElementById("repDashDetalheWrap").style.display = "none";
  document.getElementById("repDashListaWrap").style.display = "";
  document.getElementById("repDashSaudacao").textContent = `Olá, ${currentUserNome}`;

  const minhas = minhasVendas();
  const mesesDisponiveis = Array.from(new Set(minhas.map(v => (v.data || "").slice(0, 7)))).sort().reverse();
  const selectMes = document.getElementById("repDashMesFiltro");

  if (mesesDisponiveis.length === 0) {
    selectMes.innerHTML = `<option value="">Sem vendas ainda</option>`;
    document.getElementById("repDashKpis").innerHTML = `<div class="muted" style="padding:16px 0;">Nenhuma venda registrada com seu nome ainda.</div>`;
    document.getElementById("repDashEvolucaoChart").innerHTML = "";
    document.getElementById("repDashEvolucaoTotal").textContent = formatMoney(0);
    document.getElementById("repDashClientesLista").innerHTML = "";
    return;
  }
  if (!repDashMesAtual || !mesesDisponiveis.includes(repDashMesAtual)) repDashMesAtual = mesesDisponiveis[0];
  selectMes.innerHTML = mesesDisponiveis.map(m =>
    `<option value="${m}" ${m === repDashMesAtual ? "selected" : ""}>${formatMesLabel(m)}</option>`
  ).join("");

  const anoAtual = repDashMesAtual.slice(0, 4);
  const vendasDoMes = minhas.filter(v => (v.data || "").slice(0, 7) === repDashMesAtual);
  const vendasDoAno = minhas.filter(v => (v.data || "").slice(0, 4) === anoAtual);

  const faturamentoMes = vendasDoMes.reduce((a, v) => a + Number(v.valor_venda || 0), 0);
  const faturamentoAno = vendasDoAno.reduce((a, v) => a + Number(v.valor_venda || 0), 0);
  const comissaoMes = vendasDoMes.reduce((a, v) => a + Number(v.comissao || 0), 0);
  const pneusMes = vendasDoMes.reduce((a, v) => a + Number(v.quantidade_pneus || 0), 0);

  document.getElementById("repDashKpis").innerHTML = [
    { lbl: "Faturamento do mês", val: formatMoney(faturamentoMes) },
    { lbl: "Faturamento no ano", val: formatMoney(faturamentoAno) },
    { lbl: "Comissão do mês", val: formatMoney(comissaoMes), accent: true },
    { lbl: "Pneus vendidos (mês)", val: `${fmt(pneusMes)} un.` }
  ].map(k => `
    <div class="kpi ${k.accent ? "accent" : ""}">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}</div>
    </div>
  `).join("");

  const porMes = {};
  vendasDoAno.forEach(v => {
    const mes = (v.data || "").slice(5, 7);
    porMes[mes] = (porMes[mes] || 0) + Number(v.valor_venda || 0);
  });
  const pontosEvolucao = [];
  for (let m = 1; m <= 12; m++) {
    const chave = String(m).padStart(2, "0");
    pontosEvolucao.push({ mes: chave, valor: porMes[chave] || 0 });
  }
  document.getElementById("repDashEvolucaoChart").innerHTML = buildEvolucaoSvg(pontosEvolucao, anoAtual);
  document.getElementById("repDashEvolucaoTotal").textContent = formatMoney(faturamentoAno);

  const porCliente = {};
  minhas.forEach(v => {
    if (!porCliente[v.cliente]) porCliente[v.cliente] = { qtd: 0, faturamento: 0 };
    porCliente[v.cliente].qtd += 1;
    porCliente[v.cliente].faturamento += Number(v.valor_venda || 0);
  });
  const clientesOrdenados = Object.entries(porCliente).sort((a, b) => b[1].faturamento - a[1].faturamento);
  document.getElementById("repDashClientesLista").innerHTML = clientesOrdenados.length === 0
    ? `<div class="muted" style="padding:12px 0;">Nenhum cliente ainda.</div>`
    : clientesOrdenados.map(([nome, d]) => `
      <button type="button" class="rep-dash-cliente-row" data-repdashcliente="${escapeHtml(nome)}">
        <span class="rep-dash-cliente-info">
          <span class="nome">${escapeHtml(nome)}</span>
          <span class="qtd">${d.qtd} compra${d.qtd === 1 ? "" : "s"}</span>
        </span>
        <span class="valor mono">${formatMoney(d.faturamento)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    `).join("");
  document.querySelectorAll("[data-repdashcliente]").forEach(btn => {
    btn.addEventListener("click", () => abrirRepDashClienteDetalhe(btn.dataset.repdashcliente));
  });
}

// medida mais comprada por um cliente: não dá pra tirar de "vendas" (só guarda quantidade
// total, não por medida) -- vem de movimentos (baixa de estoque real) ligados à entrega
// daquele cliente com o mesmo vendedor, igual ao Dashboard interno faz pra "Pneus Mais Vendidos"
function abrirRepDashClienteDetalhe(clienteNome) {
  document.getElementById("repDashListaWrap").style.display = "none";
  document.getElementById("repDashDetalheWrap").style.display = "";

  const minhasDoCliente = minhasVendas().filter(v => v.cliente === clienteNome);
  const faturamentoTotal = minhasDoCliente.reduce((a, v) => a + Number(v.valor_venda || 0), 0);

  const meuNome = (currentUserNome || "").trim().toLowerCase();
  const idsEntregasDoCliente = new Set(
    entregas.filter(e => e.cliente === clienteNome && (e.vendedor || "").trim().toLowerCase() === meuNome).map(e => e.id)
  );
  const porMedida = {};
  movimentos.filter(m => m.tipo === "venda" && idsEntregasDoCliente.has(m.entrega_id)).forEach(m => {
    const p = produtos.find(x => x.codigo === m.codigo);
    const medida = (p && p.medida) || "—";
    porMedida[medida] = (porMedida[medida] || 0) + Number(m.quantidade || 0);
  });
  const medidasOrdenadas = Object.entries(porMedida).sort((a, b) => b[1] - a[1]);
  const maxMedida = medidasOrdenadas.length ? medidasOrdenadas[0][1] : 1;

  const ultimasCompras = [...minhasDoCliente].sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 5);

  document.getElementById("repDashDetalheConteudo").innerHTML = `
    <div class="rep-dash-detalhe-head">
      <div class="nome">${escapeHtml(clienteNome)}</div>
      <div class="sub">${minhasDoCliente.length} compra${minhasDoCliente.length === 1 ? "" : "s"} · ${formatMoney(faturamentoTotal)} no total</div>
    </div>
    <div class="rep-dash-card">
      <div class="rep-dash-card-head"><span>Medidas que mais compra</span></div>
      ${medidasOrdenadas.length === 0
        ? `<div class="muted" style="padding:12px 0;">Sem histórico de medida vinculado ainda.</div>`
        : `<div class="rank-list">${medidasOrdenadas.map(([medida, qtd]) => `
          <div class="rank-row">
            <div class="rank-main">
              <div class="rank-label"><span class="mono">${escapeHtml(medida)}</span><span class="n">${fmt(qtd)} un.</span></div>
              <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(4, (qtd / maxMedida) * 100)}%"></div></div>
            </div>
          </div>
        `).join("")}</div>`}
    </div>
    <div class="rep-dash-card">
      <div class="rep-dash-card-head"><span>Últimas compras</span></div>
      ${ultimasCompras.map(v => `
        <div class="rep-dash-compra-row">
          <span class="mono">${formatDateBR(v.data)} · NF ${escapeHtml(v.numero_nf_venda || "—")}</span>
          <span class="mono">${formatMoney(v.valor_venda)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* ---------------- saldo de produto (usado no Catálogo) ---------------- */

function computeSaldoProduto(codigo) {
  return movimentos
    .filter(m => m.codigo === codigo)
    .reduce((saldo, m) => saldo + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)), 0);
}

/* ---------------- entregas (somente leitura) ---------------- */

function initRepEntregas() {
  document.getElementById("repEntregasSearch").addEventListener("input", renderRepEntregas);
  document.getElementById("repEntregasFiltroEtapa").addEventListener("change", renderRepEntregas);
  document.getElementById("repEntregaDetalheClose").addEventListener("click", () => {
    document.getElementById("repEntregaDetalheOverlay").classList.remove("show");
  });
  document.getElementById("repEntregaDetalheOverlay").addEventListener("click", (e) => {
    if (e.target.id === "repEntregaDetalheOverlay") document.getElementById("repEntregaDetalheOverlay").classList.remove("show");
  });
}

function renderRepEntregas() {
  const search = (document.getElementById("repEntregasSearch").value || "").trim().toLowerCase();
  const filtroEtapa = document.getElementById("repEntregasFiltroEtapa").value;
  let rows = entregas.slice();
  if (filtroEtapa) rows = rows.filter(e => e.etapa === filtroEtapa);
  if (search) {
    rows = rows.filter(e => [e.numero_nf, e.numero_pedido, e.cliente, e.transportadora].join(" ").toLowerCase().includes(search));
  }

  document.getElementById("repEntregasEmpty").style.display = rows.length ? "none" : "block";
  document.getElementById("repEntregasTbody").innerHTML = rows.map(e => `
    <tr class="rep-entrega-row" data-entid="${escapeHtml(e.id)}">
      <td class="mono">${escapeHtml(e.numero_nf || e.numero_pedido || "Sem NF")}${e.reserva ? ` <span class="rep-tag-reserva">RESERVA</span>` : ""}</td>
      <td>${escapeHtml(e.cliente || "—")}</td>
      <td>${escapeHtml(e.vendedor || "—")}</td>
      <td>${escapeHtml(ETAPA_LABEL[e.etapa] || e.etapa || "—")}</td>
      <td class="mono">${formatDateBR(e.data)}</td>
      <td>${escapeHtml(e.transportadora || "—")}</td>
    </tr>
  `).join("");

  document.querySelectorAll(".rep-entrega-row").forEach(tr => {
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => abrirDetalheEntregaRep(tr.dataset.entid));
  });
}

function abrirDetalheEntregaRep(id) {
  const e = entregas.find(x => x.id === id);
  if (!e) return;
  document.getElementById("repEntregaDetalheTitulo").textContent = e.numero_nf || e.numero_pedido || "Sem NF";
  document.getElementById("repEntregaDetalheInfo").innerHTML = [
    ["Cliente", e.cliente], ["Vendedor", e.vendedor], ["Etapa", ETAPA_LABEL[e.etapa] || e.etapa],
    ["Data", formatDateBR(e.data)], ["Transportadora", e.transportadora], ["Destino", e.destino]
  ].map(([lbl, val]) => `<div><label>${lbl}</label><div class="rep-readonly">${escapeHtml(val || "—")}</div></div>`).join("");

  const itens = e.itens || [];
  const temValores = itens.some(it => it.valorUnitario != null);
  const theadRow = document.querySelector("#repEntregaDetalheOverlay .rep-itens-table thead tr");
  theadRow.innerHTML = `<th>Código</th><th>Medida</th><th>Quantidade</th>` +
    (temValores ? `<th>Valor unitário</th><th>Desc.</th><th>Valor total</th>` : "");

  document.getElementById("repEntregaDetalheItens").innerHTML = itens.length
    ? itens.map(it => {
        const prod = produtos.find(p => p.codigo === it.codigo);
        return `<tr>
          <td class="mono">${escapeHtml(it.codigo)}</td>
          <td>${escapeHtml(prod ? prod.medida : "—")}</td>
          <td class="num mono">${fmt(it.quantidade)}</td>
          ${temValores ? `
            <td class="num mono">${it.valorUnitario != null ? formatMoney(it.valorUnitario) : "—"}</td>
            <td class="num mono">${it.desconto ? it.desconto + "%" : "—"}</td>
            <td class="num mono">${it.valorTotal != null ? formatMoney(it.valorTotal) : "—"}</td>
          ` : ""}
        </tr>`;
      }).join("") + (temValores ? `<tr><td colspan="5" style="text-align:right;font-weight:800;">Total</td><td class="num mono" style="font-weight:800;">${formatMoney(itens.reduce((a, it) => a + (it.valorTotal || 0), 0))}</td></tr>` : "")
    : `<tr><td colspan="3" style="text-align:center;color:var(--ink-soft);">Nenhum item.</td></tr>`;

  document.getElementById("repEntregaDetalheOverlay").classList.add("show");
}

/* ---------------- pré-cadastro de cliente ---------------- */

function initPreCadastroForm() {
  document.getElementById("formPreCadastroCliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("preCadNome").value.trim();
    if (!nome) { toast("Informe o nome do cliente."); return; }

    const payload = {
      nome,
      documento: document.getElementById("preCadDocumento").value.trim() || null,
      razao_social: document.getElementById("preCadRazaoSocial").value.trim() || null,
      contato: document.getElementById("preCadContato").value.trim() || null,
      telefone: document.getElementById("preCadTelefone").value.trim() || null,
      email: document.getElementById("preCadEmail").value.trim() || null,
      estado: document.getElementById("preCadEstado").value || null,
      cidade: document.getElementById("preCadCidade").value.trim() || null,
      endereco: document.getElementById("preCadEndereco").value.trim() || null,
      tipo_cliente: document.getElementById("preCadTipoCliente").value || null,
      status: "pendente",
      created_by: currentUser.id,
      enviado_por: currentUserNome
    };

    const { data: inserido, error } = await sb.from("clientes_pendentes").insert(payload).select();
    if (error) { toast("Erro ao enviar pré-cadastro: " + error.message); return; }

    meusPreCadastros.unshift(inserido[0]);
    e.target.reset();
    renderMeusPreCadastros();
    toast("Pré-cadastro enviado. Aguarde a aprovação do escritório.");
  });

  document.getElementById("btnAnexarPreCad").addEventListener("click", () => {
    document.getElementById("repPreCadAnexoInput").click();
  });
  document.getElementById("repPreCadAnexoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await uploadAnexoPreCad(file);
  });
}

function renderMeusPreCadastros() {
  document.getElementById("repPreCadastrosEmpty").style.display = meusPreCadastros.length ? "none" : "block";
  const STATUS_LABEL = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };
  document.getElementById("repPreCadastrosTbody").innerHTML = meusPreCadastros.map(p => `
    <tr class="rep-clickable-row" data-precadid="${escapeHtml(p.id)}">
      <td>${escapeHtml(p.nome)}</td>
      <td class="mono">${escapeHtml(p.documento || "—")}</td>
      <td class="mono">${formatDateBR((p.created_at || "").slice(0, 10))}</td>
      <td>${escapeHtml(STATUS_LABEL[p.status] || p.status)}${p.status === "rejeitado" && p.motivo_rejeicao ? ` — ${escapeHtml(p.motivo_rejeicao)}` : ""}</td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-precadid]").forEach(tr => {
    tr.addEventListener("click", () => abrirPreCadAnexos(tr.dataset.precadid));
  });

  if (preCadSelecionadoId && meusPreCadastros.some(p => p.id === preCadSelecionadoId)) {
    abrirPreCadAnexos(preCadSelecionadoId);
  }
}

/* ---------------- anexos (pré-cadastro de cliente) ---------------- */

const PRECAD_ANEXOS_BUCKET = "clientes-pendentes-anexos";
let preCadSelecionadoId = null;

function abrirPreCadAnexos(id) {
  const p = meusPreCadastros.find(x => x.id === id);
  if (!p) return;
  preCadSelecionadoId = id;
  document.getElementById("repPreCadAnexosCard").style.display = "block";
  document.getElementById("repPreCadAnexosTitulo").textContent = p.nome;
  renderAnexosPreCad(p);
}

function renderAnexosPreCad(p) {
  const container = document.getElementById("repPreCadAnexosList");
  const anexos = p.anexos || [];
  container.innerHTML = anexos.length
    ? anexos.map(a => `
        <div class="anexo-row">
          <span class="anexo-nome" data-abrirprecadanexo="${escapeHtml(a.path)}">${escapeHtml(a.nome)}</span>
          <span class="anexo-tamanho">${escapeHtml(formatFileSize(a.tamanho))}</span>
        </div>
      `).join("")
    : `<div class="note">Nenhum arquivo anexado ainda.</div>`;

  container.querySelectorAll("[data-abrirprecadanexo]").forEach(el => {
    el.addEventListener("click", () => abrirAnexoPreCad(el.dataset.abrirprecadanexo));
  });
}

async function uploadAnexoPreCad(file) {
  if (!preCadSelecionadoId) return;
  if (file.size > 10 * 1024 * 1024) { toast("Arquivo muito grande (máximo 10MB)."); return; }

  const path = `${preCadSelecionadoId}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: uploadError } = await sb.storage.from(PRECAD_ANEXOS_BUCKET).upload(path, file);
  if (uploadError) { toast("Erro ao anexar arquivo: " + uploadError.message); return; }

  const p = meusPreCadastros.find(x => x.id === preCadSelecionadoId);
  const novosAnexos = [...(p.anexos || []), { nome: file.name, path, tamanho: file.size, criadoEm: new Date().toISOString(), criadoPor: currentUser.email }];
  const { error } = await sb.from("clientes_pendentes").update({ anexos: novosAnexos }).eq("id", preCadSelecionadoId);
  if (error) { toast("Erro ao salvar anexo: " + error.message); return; }

  p.anexos = novosAnexos;
  renderAnexosPreCad(p);
  toast("Arquivo anexado.");
}

async function abrirAnexoPreCad(path) {
  const { data, error } = await sb.storage.from(PRECAD_ANEXOS_BUCKET).createSignedUrl(path, 60);
  if (error) { toast("Erro ao abrir arquivo: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

/* ---------------- acompanhamento ---------------- */

const ANEXOS_BUCKET = "entregas-anexos";
let acompanhamentoSelecionadoId = null;

function renderAcompanhamento() {
  const meusPedidos = entregas.filter(e => e.created_by === currentUser.id).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  document.getElementById("repAcompanhamentoEmpty").style.display = meusPedidos.length ? "none" : "block";

  if (!acompanhamentoSelecionadoId || !meusPedidos.some(p => p.id === acompanhamentoSelecionadoId)) {
    acompanhamentoSelecionadoId = meusPedidos.length ? meusPedidos[0].id : null;
  }

  document.getElementById("repAcompanhamentoTabs").innerHTML = meusPedidos.map(p => {
    const statusClasse = p.reserva_status === "pendente" ? "pendente"
      : p.reserva_status === "finalizada" ? "finalizada"
      : p.reserva_status === "estornada" ? "estornada" : "normal";
    return `
      <button type="button" class="rep-acomp-tab-btn ${p.id === acompanhamentoSelecionadoId ? "active" : ""}" data-acompid="${escapeHtml(p.id)}">
        <span class="rep-acomp-status-dot ${statusClasse}"></span>
        Nº ${escapeHtml(p.numero_pedido || "—")}
      </button>
    `;
  }).join("");

  document.querySelectorAll(".rep-acomp-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      acompanhamentoSelecionadoId = btn.dataset.acompid;
      renderAcompanhamento();
    });
  });

  const pedido = meusPedidos.find(p => p.id === acompanhamentoSelecionadoId);
  renderDetalheAcompanhamento(pedido);
}

function renderDetalheAcompanhamento(pedido) {
  const container = document.getElementById("repAcompanhamentoDetalhe");
  if (!pedido) { container.innerHTML = ""; return; }

  const temValores = (pedido.itens || []).some(it => it.valorUnitario != null);
  const itensHtml = (pedido.itens || []).map(it => {
    const prod = produtos.find(p => p.codigo === it.codigo);
    return `
      <tr>
        <td class="mono">${escapeHtml(it.codigo)}</td>
        <td>${escapeHtml(prod ? prod.medida : "—")}</td>
        <td class="num mono">${fmt(it.quantidade)}</td>
        ${temValores ? `
          <td class="num mono">${it.valorUnitario != null ? formatMoney(it.valorUnitario) : "—"}</td>
          <td class="num mono">${it.desconto ? it.desconto + "%" : "—"}</td>
          <td class="num mono">${it.valorTotal != null ? formatMoney(it.valorTotal) : "—"}</td>
        ` : ""}
      </tr>
    `;
  }).join("");

  let confirmarVendaHtml = "";
  if (pedido.etapa === "PRE_VENDA") {
    confirmarVendaHtml = `
      <div class="rep-acomp-reserva-aviso">
        <span>Esta é uma proposta — ainda não é um pedido em processamento.</span>
        <button type="button" class="btn primary" id="btnConfirmarVendaRep">Confirmar venda</button>
      </div>
    `;
  }

  let reservaHtml = "";
  if (pedido.reserva_status === "pendente") {
    const expiraEm = new Date(pedido.reserva_expira_em);
    const horasRestantes = Math.max(0, Math.round((expiraEm - new Date()) / 3600000));
    reservaHtml = `
      <div class="rep-acomp-reserva-aviso">
        <span>Reserva pendente — expira em ${formatDateBR(pedido.reserva_expira_em.slice(0, 10))} às ${expiraEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (faltam ${horasRestantes}h)</span>
        <button type="button" class="btn primary" id="btnFinalizarReserva">Finalizar pedido</button>
      </div>
    `;
  } else if (pedido.reserva_status === "estornada") {
    reservaHtml = `<div class="rep-acomp-reserva-estornada">Esta reserva expirou e foi estornada automaticamente — o estoque foi liberado.</div>`;
  }

  container.innerHTML = `
    <div class="rep-doc-cliente-info" style="margin-bottom:14px;">
      <div><label>Cliente</label><div class="rep-readonly">${escapeHtml(pedido.cliente || "—")}</div></div>
      <div><label>Etapa</label><div class="rep-readonly">${escapeHtml(ETAPA_LABEL[pedido.etapa] || pedido.etapa || "—")}</div></div>
      <div><label>Data</label><div class="rep-readonly">${formatDateBR(pedido.data)}</div></div>
      <div><label>Transportadora</label><div class="rep-readonly">${escapeHtml(pedido.transportadora || "—")}</div></div>
    </div>
    ${confirmarVendaHtml}
    ${reservaHtml}
    <div class="rep-itens-table-wrap">
      <table class="rep-itens-table">
        <thead><tr><th>Código</th><th>Medida</th><th>Quantidade</th>${temValores ? `<th>Valor unitário</th><th>Desc.</th><th>Valor total</th>` : ""}</tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>
    </div>
    <div class="rep-acomp-anexos">
      <h4>Anexos</h4>
      <div id="repAcompAnexosList" class="anexos-list"></div>
      <input type="file" id="repAcompAnexoInput" style="display:none;" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx">
      <button type="button" class="btn small outline" id="btnAnexarAcomp" style="margin-top:8px;">+ Anexar arquivo</button>
    </div>
  `;

  if (pedido.etapa === "PRE_VENDA") {
    document.getElementById("btnConfirmarVendaRep").addEventListener("click", () => confirmarVendaRep(pedido.id));
  }
  if (pedido.reserva_status === "pendente") {
    document.getElementById("btnFinalizarReserva").addEventListener("click", () => finalizarReservaRep(pedido.id));
  }
  document.getElementById("btnAnexarAcomp").addEventListener("click", () => document.getElementById("repAcompAnexoInput").click());
  document.getElementById("repAcompAnexoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await uploadAnexoAcompanhamento(file, pedido.id);
  });
  renderAnexosAcompanhamento(pedido);
}

async function confirmarVendaRep(id) {
  const ok = window.confirm('Confirmar essa proposta como venda? O pedido vai avançar para a etapa "Entrada" e o escritório vai dar sequência ao processo.');
  if (!ok) return;
  const { error } = await sb.from("entregas").update({ etapa: "ENTRADA" }).eq("id", id);
  if (error) { toast("Erro ao confirmar venda: " + error.message); return; }
  const pedido = entregas.find(e => e.id === id);
  if (pedido) pedido.etapa = "ENTRADA";
  toast("Venda confirmada — pedido avançou para Entrada.");
  renderAcompanhamento();
  renderRepEntregas();
}

async function finalizarReservaRep(id) {
  const { error } = await sb.from("entregas").update({ reserva_status: "finalizada" }).eq("id", id);
  if (error) { toast("Erro ao finalizar pedido: " + error.message); return; }
  const pedido = entregas.find(e => e.id === id);
  if (pedido) pedido.reserva_status = "finalizada";
  toast("Pedido finalizado.");
  renderAcompanhamento();
}

/* ---------------- anexos (acompanhamento) ---------------- */

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function renderAnexosAcompanhamento(pedido) {
  const container = document.getElementById("repAcompAnexosList");
  const anexos = pedido.anexos || [];
  container.innerHTML = anexos.length
    ? anexos.map(a => `
        <div class="anexo-row">
          <span class="anexo-nome" data-abriranexo="${escapeHtml(a.path)}">${escapeHtml(a.nome)}</span>
          <span class="anexo-tamanho">${escapeHtml(formatFileSize(a.tamanho))}</span>
        </div>
      `).join("")
    : `<div class="note">Nenhum arquivo anexado ainda.</div>`;

  document.querySelectorAll("[data-abriranexo]").forEach(el => {
    el.addEventListener("click", () => abrirAnexoAcompanhamento(el.dataset.abriranexo));
  });
}

function sanitizarNomeArquivo(nome) {
  const semAcentos = nome.normalize("NFKD").split("").filter(ch => ch.charCodeAt(0) < 128).join("");
  return semAcentos.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadAnexoAcompanhamento(file, entregaId) {
  if (file.size > 10 * 1024 * 1024) { toast("Arquivo muito grande (máximo 10MB)."); return; }
  const path = `${entregaId}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: uploadError } = await sb.storage.from(ANEXOS_BUCKET).upload(path, file);
  if (uploadError) { toast("Erro ao anexar arquivo: " + uploadError.message); return; }

  const pedido = entregas.find(e => e.id === entregaId);
  const novosAnexos = [...(pedido.anexos || []), { nome: file.name, path, tamanho: file.size, criadoEm: new Date().toISOString(), criadoPor: currentUser.email }];
  const { error } = await sb.from("entregas").update({ anexos: novosAnexos }).eq("id", entregaId);
  if (error) { toast("Erro ao salvar anexo: " + error.message); return; }

  pedido.anexos = novosAnexos;
  renderAnexosAcompanhamento(pedido);
  toast("Arquivo anexado.");
}

async function abrirAnexoAcompanhamento(path) {
  const { data, error } = await sb.storage.from(ANEXOS_BUCKET).createSignedUrl(path, 60);
  if (error) { toast("Erro ao abrir arquivo: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

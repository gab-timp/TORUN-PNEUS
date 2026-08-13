/* ==========================================================
   TORUN PNEUS · Controle de Estoque — dados no Supabase
   ========================================================== */

const SUPABASE_URL = "https://ypygfgpqaupnjsjxgjfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aLmz08KOlT7P7e_Ae4-AEw_aaWpTyKz";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let currentUserRole = "editor";
let currentUserVisibleViews = null;
let currentUserIsAdmin = false;
let currentUserPodeAutorizarGerencia = false;
let currentUserEditableTables = null;
let currentUserKanbanColapsadas = [];
let currentUserNome = "";
let currentUserTema = null;
let currentUserNotifNovaProposta = true;
let currentUserTelefone = "";
let currentUserAvatarPath = null;
let currentUserTamanhoLetra = null;
const AVATAR_BUCKET = "avatares-usuarios";
const FONT_SIZE_KEY = "torun_font_size_v1";
let configuracoesSite = null;

const TIPO_LABEL = {
  entrada: "Entrada",
  venda: "Venda",
  reserva: "Reserva",
  transferencia: "Transferência",
  avariado: "Avariado"
};

const SAIDA_TIPOS = ["venda", "reserva", "transferencia", "avariado"];

const MES_ABREV = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez"
};

const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

let state = { produtos: [], movimentos: [], fretes: [], clientes: [], vendas: [], previsoes: [], entregas: [] };

let editingMovimentoId = null;
let editingFreteId = null;
let editingPrevistoId = null;
let editingMovimentoUpdatedAt = null;
let editingFreteUpdatedAt = null;
let editingPrevistoUpdatedAt = null;
let editingVendaId = null;
let editingVendaUpdatedAt = null;
const VENDAS_LIMITE = 10;
let vendasMostrarTodas = false;

const CONFLITO_MSG = "Este registro foi alterado por outra pessoa enquanto você editava. A tela foi atualizada com a versão mais recente — confira e tente salvar de novo.";

const PREVISTO_STATUS = ["AG DATA DE CHEGADA", "AG RETIRADA NO PORTO", "DTC"];

/* ---------------- persistence ---------------- */

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

async function updateWithConflictCheck(table, id, updatedAtSnapshot, payload) {
  const { data, error } = await sb.from(table).update(payload).eq("id", id).eq("updated_at", updatedAtSnapshot).select();
  if (error) return { conflict: false, error };
  if (!data || data.length === 0) return { conflict: true, error: null, row: null };
  return { conflict: false, error: null, row: data[0] };
}

function encontrarMovimentoDuplicado(tipo, data, numero, itens) {
  if (!numero) return null;
  return itens.find(it => state.movimentos.some(m =>
    m.tipo === tipo && m.data === data && m.numero === numero &&
    m.codigo === it.codigo && m.quantidade === it.quantidade
  )) || null;
}

function freteToRow(f) {
  return {
    id: f.id, referencia: f.referencia, cep: f.cep || null, localidade: f.localidade || null,
    valor_nf: f.valorNF, data: f.data, obs: f.obs || null,
    cotacoes: f.cotacoes || [], contratada_id: f.contratadaId || null
  };
}
function freteFromRow(r) {
  return {
    id: r.id, referencia: r.referencia, cep: r.cep || "", localidade: r.localidade || "",
    valorNF: r.valor_nf != null ? Number(r.valor_nf) : null, data: r.data, obs: r.obs || "",
    cotacoes: r.cotacoes || [], contratadaId: r.contratada_id, createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function clienteToRow(c) {
  return {
    nome: c.nome, estado: c.estado || null, cidade: c.cidade || null,
    documento: c.documento || null, telefone: c.telefone || null, email: c.email || null,
    endereco: c.endereco || null, contato: c.contato || null, razao_social: c.razaoSocial || null,
    tags: c.tags || [], notas: c.notas || [], tipo_cliente: c.tipoCliente || null
  };
}
function clienteFromRow(r) {
  return {
    nome: r.nome, estado: r.estado || "", cidade: r.cidade || "",
    documento: r.documento || "", telefone: r.telefone || "", email: r.email || "",
    endereco: r.endereco || "", contato: r.contato || "", razaoSocial: r.razao_social || "",
    tags: r.tags || [], notas: r.notas || [], createdAt: r.created_at, tipoCliente: r.tipo_cliente || ""
  };
}

function vendaToRow(v) {
  return {
    id: v.id, data: v.data, numero_pedido: v.numeroPedido || null, numero_nf_venda: v.numeroNFVenda || null,
    numero_nf_entrada: v.numeroNFEntrada || null, cliente: v.cliente, quantidade_pneus: v.quantidadePneus,
    valor_venda: v.valorVenda, forma_pagamento: v.formaPagamento || null, vendedor: v.vendedor || null,
    comissao_percentual: v.comissaoPercentual || 0, comissao: v.comissao || 0,
    valor_frete: v.valorFrete, transportadora: v.transportadora || null, obs: v.obs || null,
    valor_recebido: v.valorRecebido != null ? v.valorRecebido : null, parcelas: v.parcelas != null ? v.parcelas : null
  };
}
function vendaFromRow(r) {
  return {
    id: r.id, data: r.data, numeroPedido: r.numero_pedido || "", numeroNFVenda: r.numero_nf_venda || "",
    numeroNFEntrada: r.numero_nf_entrada || "", cliente: r.cliente, quantidadePneus: Number(r.quantidade_pneus),
    valorVenda: Number(r.valor_venda), formaPagamento: r.forma_pagamento || "", vendedor: r.vendedor || "",
    comissaoPercentual: Number(r.comissao_percentual || 0), comissao: Number(r.comissao || 0),
    valorFrete: r.valor_frete != null ? Number(r.valor_frete) : null,
    transportadora: r.transportadora, obs: r.obs || "",
    valorRecebido: r.valor_recebido != null ? Number(r.valor_recebido) : null,
    parcelas: r.parcelas || null,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function previstoToRow(p) {
  return {
    id: p.id, numero_processo: p.numeroProcesso, itens: p.itens || [],
    data_chegada: p.dataChegada || null, status: p.status, obs: p.obs || null
  };
}
function previstoFromRow(r) {
  return {
    id: r.id, numeroProcesso: r.numero_processo, itens: r.itens || [],
    dataChegada: r.data_chegada || "", status: r.status, obs: r.obs || "", createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function entregaToRow(e) {
  return {
    id: e.id, numero_nf: e.numeroNF || null, numero_pedido: e.numeroPedido || null, data: e.data || null,
    vendedor: e.vendedor || null, cliente: e.cliente || null, destino: e.destino || null,
    transportadora: e.transportadora || null, itens: e.itens || [], etapa: e.etapa,
    data_prevista: e.dataPrevista || null, data_entrega: e.dataEntrega || null, cte_status: e.cteStatus || "aguardando", obs: e.obs || null,
    razao_social: e.razaoSocial || null, documento_cliente: e.documentoCliente || null, condicao_frete: e.condicaoFrete || null,
    finalidade: e.finalidade || null, condicao_pagamento: e.condicaoPagamento || null, forma_pagamento: e.formaPagamento || null,
    prazo_pagamento: e.prazoPagamento || null, obs_impressao_nf: e.obsImpressaoNF || null, origem: e.origem || "interno",
    reserva: !!e.reserva, reserva_status: e.reservaStatus || null, reserva_expira_em: e.reservaExpiraEm || null,
    tabela_preco_regiao: e.tabelaPrecoRegiao || null, tabela_preco_condicao: e.tabelaPrecoCondicao || null,
    tabela_preco_tipo_cliente: e.tabelaPrecoTipoCliente || null
  };
}
function entregaFromRow(r) {
  return {
    id: r.id, numeroNF: r.numero_nf || "", numeroPedido: r.numero_pedido || "", data: r.data || "",
    vendedor: r.vendedor || "", cliente: r.cliente || "", destino: r.destino || "",
    transportadora: r.transportadora || "", itens: r.itens || [], etapa: r.etapa,
    dataPrevista: r.data_prevista || "", dataEntrega: r.data_entrega || "", cteStatus: r.cte_status || "aguardando",
    obs: r.obs || "", anexos: r.anexos || [], createdAt: r.created_at, updatedAt: r.updated_at,
    razaoSocial: r.razao_social || "", documentoCliente: r.documento_cliente || "", condicaoFrete: r.condicao_frete || "",
    finalidade: r.finalidade || "", condicaoPagamento: r.condicao_pagamento || "", formaPagamento: r.forma_pagamento || "",
    prazoPagamento: r.prazo_pagamento || "", obsImpressaoNF: r.obs_impressao_nf || "", origem: r.origem || "interno",
    reserva: !!r.reserva, reservaStatus: r.reserva_status || null, reservaExpiraEm: r.reserva_expira_em || null,
    tabelaPrecoRegiao: r.tabela_preco_regiao || "", tabelaPrecoCondicao: r.tabela_preco_condicao || "",
    tabelaPrecoTipoCliente: r.tabela_preco_tipo_cliente || "",
    cancelado: !!r.cancelado, canceladoMotivo: r.cancelado_motivo || "",
    canceladoEm: r.cancelado_em || null, canceladoPor: r.cancelado_por || null
  };
}

const ETAPA_LABEL = {
  PRE_VENDA: "Pré-venda", ENTRADA: "Entrada", AUTORIZACAO_GERENCIA: "Autorização de Gerência", ANALISE_CREDITO: "Análise de Crédito",
  AGUARDANDO_PAGAMENTO: "Aguardando Pagamento", VALIDACAO_TRANSPORTE: "Validação de Transporte",
  FATURAMENTO: "Faturamento", SEPARACAO: "Separação",
  AGUARDANDO_COLETA: "Aguardando Coleta", COLETA: "Coletado", RASTREIO: "Rastreio", FINALIZADOS: "Finalizados",
  FINANCEIRO: "Financeiro (etapa antiga)"
};

const CTE_STATUS_ORDEM = ["aguardando", "recebido", "cliente_retira"];
const CTE_STATUS_LABEL = { aguardando: "CTE aguardando", recebido: "CTE recebido", cliente_retira: "Cliente retira" };

function produtoFromRow(r) {
  return {
    codigo: r.codigo, medida: r.medida, createdAt: r.created_at,
    categoria: r.categoria || "", modelo: r.modelo || "", icIv: r.ic_iv || "", pr: r.pr || "",
    cintas: r.cintas || "", capCarga: r.cap_carga || "", psi: r.psi || "",
    sulcoMm: r.sulco_mm || "", largBandaMm: r.larg_banda_mm || "", pesoKg: r.peso_kg || "",
    fotoPath: r.foto_path || null, fotoPath2: r.foto_path_2 || null
  };
}
function precoFromRow(r) {
  return { id: r.id, codigo: r.codigo, regiao: r.regiao, tipoCliente: r.tipo_cliente, condicaoPagamento: r.condicao_pagamento, preco: Number(r.preco) };
}
function movimentoFromRow(r) {
  return {
    id: r.id, data: r.data, tipo: r.tipo, codigo: r.codigo, quantidade: Number(r.quantidade),
    numero: r.numero || "", pedido: r.pedido || "", processo: r.processo || "", obs: r.obs || "",
    entregaId: r.entrega_id || null,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

async function fetchComRetry(builderFn, tentativas = 3, delayMs = 800) {
  let ultimoResultado = null;
  for (let i = 0; i < tentativas; i++) {
    ultimoResultado = await builderFn();
    if (!ultimoResultado.error) return ultimoResultado;
    if (i < tentativas - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return ultimoResultado;
}

async function loadState() {
  const [results, configRes] = await Promise.all([
    Promise.all([
      fetchComRetry(() => sb.from("produtos").select("*").order("codigo")),
      fetchComRetry(() => sb.from("produtos_precos").select("*")),
      fetchComRetry(() => sb.from("movimentos").select("*").order("data")),
      fetchComRetry(() => sb.from("fretes").select("*").order("data")),
      fetchComRetry(() => sb.from("clientes").select("*").order("nome")),
      fetchComRetry(() => sb.from("vendas").select("*").order("data")),
      fetchComRetry(() => sb.from("previsoes").select("*")),
      fetchComRetry(() => sb.from("entregas").select("*").order("data", { ascending: false })),
      fetchComRetry(() => sb.from("user_roles").select("role, nome, email, visible_views, is_admin, editable_tables, pode_autorizar_gerencia, telefone, avatar_path").eq("user_id", currentUser.id).maybeSingle()),
      fetchComRetry(() => sb.from("user_preferences").select("kanban_colunas_recolhidas, tema, notif_nova_proposta, tamanho_letra").eq("user_id", currentUser.id).maybeSingle()),
      fetchComRetry(() => sb.from("clientes_pendentes").select("*").eq("status", "pendente").order("created_at"))
    ]),
    fetchComRetry(() => sb.from("configuracoes_site").select("*").maybeSingle())
  ]);
  const [produtosRes, precosRes, movRes, fretesRes, clientesRes, vendasRes, previsoesRes, entregasRes, roleRes, prefRes, preCadRes] = results;
  if (configRes.error) console.error("Erro ao carregar configurações do site (usando padrões):", configRes.error);
  configuracoesSite = configRes.data || null;
  ESTOQUE_BAIXO_LIMITE = (configuracoesSite && configuracoesSite.estoque_baixo_limite) || 20;
  const labels = ["produtos", "preços do catálogo", "movimentos", "fretes", "clientes", "vendas", "previsões", "entregas", "papel do usuário", "preferências do usuário", "pré-cadastros de clientes"];
  let falhaCritica = false;
  results.forEach((r, i) => {
    if (r.error) {
      console.error(`Erro ao carregar ${labels[i]}:`, r.error);
      toast(`Erro ao carregar ${labels[i]} do servidor.`);
      if (labels[i] === "produtos" || labels[i] === "movimentos") falhaCritica = true;
    }
  });
  if (falhaCritica) {
    await confirmModal(
      "Falha ao carregar dados de estoque",
      "Não foi possível carregar produtos/movimentações após várias tentativas. Os números de estoque e relatórios podem aparecer errados (zerados). Recarregue a página antes de continuar."
    );
  }
  currentUserRole = (roleRes.data && roleRes.data.role) || "editor";
  currentUserVisibleViews = (roleRes.data && roleRes.data.visible_views) || null;
  currentUserIsAdmin = !!(roleRes.data && roleRes.data.is_admin);
  currentUserPodeAutorizarGerencia = !!(roleRes.data && roleRes.data.pode_autorizar_gerencia);
  currentUserEditableTables = (roleRes.data && roleRes.data.editable_tables) || null;
  currentUserNome = (roleRes.data && roleRes.data.nome) || currentUser.email;
  currentUserTelefone = (roleRes.data && roleRes.data.telefone) || "";
  currentUserAvatarPath = (roleRes.data && roleRes.data.avatar_path) || null;
  currentUserKanbanColapsadas = (prefRes.data && prefRes.data.kanban_colunas_recolhidas) || [];
  currentUserTema = (prefRes.data && prefRes.data.tema) || null;
  currentUserNotifNovaProposta = prefRes.data ? prefRes.data.notif_nova_proposta !== false : true;
  currentUserTamanhoLetra = (prefRes.data && prefRes.data.tamanho_letra) || null;
  document.body.classList.toggle("is-viewer", currentUserRole === "viewer");
  document.body.classList.toggle("is-admin", currentUserIsAdmin);
  if (currentUserEditableTables) {
    document.body.setAttribute("data-editable-tables", currentUserEditableTables.join(" "));
  } else {
    document.body.removeAttribute("data-editable-tables");
  }
  applyViewRestrictions();
  updateSidebarUserChip();
  if (currentUserTema && localStorage.getItem(THEME_KEY) !== currentUserTema) {
    localStorage.setItem(THEME_KEY, currentUserTema);
    applyThemeChoice(currentUserTema);
  }
  if (currentUserTamanhoLetra && localStorage.getItem(FONT_SIZE_KEY) !== currentUserTamanhoLetra) {
    localStorage.setItem(FONT_SIZE_KEY, currentUserTamanhoLetra);
    applyFontSizeChoice(currentUserTamanhoLetra);
  }

  state = {
    produtos: (produtosRes.data || []).map(produtoFromRow),
    produtos_precos: (precosRes.data || []).map(precoFromRow),
    movimentos: (movRes.data || []).map(movimentoFromRow),
    fretes: (fretesRes.data || []).map(freteFromRow),
    clientes: (clientesRes.data || []).map(clienteFromRow),
    vendas: (vendasRes.data || []).map(vendaFromRow),
    previsoes: (previsoesRes.data || []).map(previstoFromRow),
    entregas: (entregasRes.data || []).map(entregaFromRow),
    clientesPendentes: preCadRes.data || []
  };

  atualizarAlertaEstoqueBaixo();
  atualizarAlertaNovaProposta();
  renderPreCadastrosClientes();
}

/* ---------------- derived data ---------------- */

function getProduto(codigo) {
  return state.produtos.find(p => p.codigo === codigo);
}

/* ---------------- catálogo: preços por região e condição ---------------- */

const CATALOGO_BUCKET = "produtos-fotos";
const CATALOGO_REGIOES = ["SC/RS", "PR", "MG", "MT"];
const CATALOGO_CONDICOES = ["A VISTA", "30 DIAS", "30/60", "30/60/90", "30/60/90/120", "30/60/90/120/150", "30/60/90/120/150/180"];
const TIPO_CLIENTE_OPCOES = ["REVENDA", "FROTA", "CONSUMO", "CONSUMO_DIFAL"];
const TIPO_CLIENTE_LABEL = { REVENDA: "Revenda", FROTA: "Frota", CONSUMO: "Consumo", CONSUMO_DIFAL: "Consumo com DIFAL" };

function getPrecoProduto(codigo, regiao, tipoCliente, condicaoPagamento) {
  const p = state.produtos_precos.find(x => x.codigo === codigo && x.regiao === regiao && x.tipoCliente === tipoCliente && x.condicaoPagamento === condicaoPagamento);
  return p ? p.preco : null;
}

function getPrecosDoProduto(codigo, tipoCliente) {
  return state.produtos_precos.filter(p => p.codigo === codigo && (!tipoCliente || p.tipoCliente === tipoCliente));
}

function fotoProdutoUrl(fotoPath) {
  if (!fotoPath) return null;
  const { data } = sb.storage.from(CATALOGO_BUCKET).getPublicUrl(fotoPath);
  return data ? data.publicUrl : null;
}

function fotoAvatarUsuarioUrl(avatarPath) {
  if (!avatarPath) return null;
  const { data } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  return data ? data.publicUrl : null;
}

function extractMedidaBase(medida) {
  const m = medida.match(/^\s*(\d{3}\/\d{2}\s?R\s?\d{1,2}(?:[.,]\d)?)/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "OUTRA";
}

function computeProdutoTotais(codigo) {
  let entradas = 0, saidas = 0, vendas = 0, reservas = 0, transferencias = 0, avariados = 0;
  state.movimentos.forEach(m => {
    if (m.codigo !== codigo) return;
    if (m.tipo === "entrada") entradas += m.quantidade;
    else {
      saidas += m.quantidade;
      if (m.tipo === "venda") vendas += m.quantidade;
      if (m.tipo === "reserva") reservas += m.quantidade;
      if (m.tipo === "transferencia") transferencias += m.quantidade;
      if (m.tipo === "avariado") avariados += m.quantidade;
    }
  });
  return {
    entradas, saidas, vendas, reservas, transferencias, avariados,
    saldo: entradas - saidas
  };
}

function getProcessosProduto(codigo) {
  const processos = state.movimentos
    .filter(m => m.codigo === codigo && m.tipo === "entrada" && m.processo)
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(m => m.processo);
  return [...new Set(processos)];
}

function getProcessoBreakdown(codigo) {
  const porProcesso = {};
  state.movimentos.forEach(m => {
    if (m.codigo !== codigo) return;
    const chave = m.processo || "Sem processo";
    if (m.tipo === "entrada") {
      porProcesso[chave] = (porProcesso[chave] || 0) + m.quantidade;
    } else {
      porProcesso[chave] = (porProcesso[chave] || 0) - m.quantidade;
    }
  });
  return Object.entries(porProcesso)
    .filter(([, qtd]) => qtd !== 0)
    .sort((a, b) => b[1] - a[1]);
}

function openProcessoModal(codigo) {
  const p = getProduto(codigo);
  const breakdown = getProcessoBreakdown(codigo);
  if (breakdown.length === 0) { toast("Nenhuma entrada registrada para esse produto ainda."); return; }
  const saldo = computeProdutoTotais(codigo).saldo;

  document.getElementById("processoModalTitle").textContent = p ? p.medida : codigo;
  document.getElementById("processoModalTotal").innerHTML = `
    <span class="lbl">Estoque atual</span>
    <span class="val">${fmt(saldo)} un.</span>
  `;
  document.getElementById("processoModalList").innerHTML = breakdown.map(([proc, qtd]) => `
    <div class="processo-modal-row">
      <span>${escapeHtml(proc)}</span>
      <span class="val">${fmt(qtd)} un.</span>
    </div>
  `).join("");

  document.getElementById("processoModalOverlay").classList.add("show");
}

function closeProcessoModal() {
  document.getElementById("processoModalOverlay").classList.remove("show");
}

function listEstoque() {
  return state.produtos.map(p => ({
    ...p,
    ...computeProdutoTotais(p.codigo),
    processos: getProcessosProduto(p.codigo)
  }));
}

let ESTOQUE_BAIXO_LIMITE = 20;

function getProdutosEstoqueBaixo() {
  return listEstoque()
    .filter(p => p.saldo < ESTOQUE_BAIXO_LIMITE)
    .sort((a, b) => a.saldo - b.saldo);
}

// mesma regra do getProdutosEstoqueBaixo() (saldo < ESTOQUE_BAIXO_LIMITE), só que
// separando o caso mais grave (esgotado) e somando uma faixa de "atenção" (perto
// do limite, mas ainda não baixo) -- usada pela pilula/barra da tabela de Estoque.
// getProdutosEstoqueBaixo()/os tiles de "saldo baixo" continuam só com baixo+esgotado.
const ESTOQUE_ATENCAO_MARGEM = 5;
function statusEstoque(saldo) {
  if (saldo <= 0) return "esgotado";
  if (saldo < ESTOQUE_BAIXO_LIMITE) return "baixo";
  if (saldo < ESTOQUE_BAIXO_LIMITE + ESTOQUE_ATENCAO_MARGEM) return "atencao";
  return "normal";
}

let codigosEstoqueBaixoConhecidos = null;

function mostrarAlertaEstoqueBaixoPopup(p) {
  const container = document.getElementById("estoqueBaixoAlerts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "estoque-baixo-alert-item";
  el.innerHTML = `
    <div class="titulo">
      <span>Estoque baixo</span>
      <button type="button" class="fechar">✕</button>
    </div>
    <div>${escapeHtml(p.codigo)} — ${escapeHtml(p.medida)}: ${fmt(p.saldo)} un.</div>
  `;
  container.appendChild(el);
  el.querySelector(".fechar").addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), 8000);
}

function atualizarAlertaEstoqueBaixo() {
  const baixos = getProdutosEstoqueBaixo();

  if (codigosEstoqueBaixoConhecidos !== null) {
    baixos.forEach(p => {
      if (!codigosEstoqueBaixoConhecidos.has(p.codigo)) {
        mostrarAlertaEstoqueBaixoPopup(p);
      }
    });
  }
  codigosEstoqueBaixoConhecidos = new Set(baixos.map(p => p.codigo));

  const badge = document.getElementById("navBadgeEstoque");
  if (baixos.length > 0) {
    badge.textContent = baixos.length;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }

  const card = document.getElementById("cardAlertaEstoqueBaixo");
  if (!card) return;
  if (baixos.length === 0) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";
  document.getElementById("alertaEstoqueBaixoCount").textContent = baixos.length;
  document.getElementById("alertaEstoqueBaixoLista").innerHTML = baixos.map(p => `
    <div class="alerta-item">
      <span class="codigo">${escapeHtml(p.codigo)}</span>
      <span class="medida">${escapeHtml(p.medida)}</span>
      <span class="saldo ${p.saldo <= 0 ? "saldo-zero" : "saldo-baixo"}">${fmt(p.saldo)} un.</span>
    </div>
  `).join("");
}

/* ---------------- aviso: nova proposta de representante (só popup, sem card fixo) ---------------- */

let idsPropostasConhecidos = null;

function mostrarAlertaNovaPropostaPopup(p) {
  const container = document.getElementById("propostaAlerts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "proposta-alert-item";
  el.innerHTML = `
    <div class="titulo">
      <span>Nova proposta</span>
      <button type="button" class="fechar">✕</button>
    </div>
    <div>${escapeHtml(p.cliente || "—")} — ${escapeHtml(p.vendedor || "—")}${p.numeroPedido ? ` · Nº ${escapeHtml(p.numeroPedido)}` : ""}</div>
  `;
  container.appendChild(el);
  el.querySelector(".fechar").addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), 8000);
}

function atualizarAlertaNovaProposta() {
  const propostas = state.entregas.filter(e => e.origem === "representante" && e.etapa === "PRE_VENDA");
  if (idsPropostasConhecidos !== null && currentUserNotifNovaProposta) {
    propostas.forEach(p => {
      if (!idsPropostasConhecidos.has(p.id)) mostrarAlertaNovaPropostaPopup(p);
    });
  }
  idsPropostasConhecidos = new Set(propostas.map(p => p.id));
}

/* ---------------- toast / modal ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function confirmModal(title, text) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmOverlay");
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = text;
    overlay.classList.add("show");
    const cleanup = (result) => {
      overlay.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("confirmOk");
    const cancelBtn = document.getElementById("confirmCancel");
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function initMotivoSugestoes() {
  document.getElementById("motivoSugestoes").addEventListener("change", (e) => {
    if (e.target.value) document.getElementById("motivoInput").value = e.target.value;
  });
}

function motivoModal(title, text) {
  return new Promise(resolve => {
    const overlay = document.getElementById("motivoOverlay");
    document.getElementById("motivoTitle").textContent = title;
    document.getElementById("motivoText").textContent = text;
    const input = document.getElementById("motivoInput");
    const erro = document.getElementById("motivoErro");
    input.value = "";
    document.getElementById("motivoSugestoes").value = "";
    erro.style.display = "none";
    overlay.classList.add("show");
    const cleanup = (result) => {
      overlay.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById("motivoOk");
    const cancelBtn = document.getElementById("motivoCancel");
    const onOk = () => {
      const motivo = input.value.trim();
      if (!motivo) {
        erro.textContent = "Informe o motivo para continuar.";
        erro.style.display = "block";
        return;
      }
      if (!/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(motivo)) {
        erro.textContent = "O motivo não pode ser só números — descreva o que aconteceu.";
        erro.style.display = "block";
        return;
      }
      cleanup(motivo);
    };
    const onCancel = () => cleanup(null);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

async function registrarLog(tabela, registroId, acao, motivo, descricao) {
  const { error } = await sb.from("log_alteracoes").insert({
    tabela, registro_id: String(registroId), acao, motivo, descricao,
    user_id: currentUser ? currentUser.id : null,
    user_email: currentUser ? currentUser.email : null
  });
  if (error) console.error("Erro ao registrar log de alteração:", error);
}

/* ---------------- navigation ---------------- */

function applyViewRestrictions() {
  document.querySelectorAll(".nav-item").forEach(b => {
    b.style.display = (!currentUserVisibleViews || currentUserVisibleViews.includes(b.dataset.view)) ? "" : "none";
  });
}

function primeiraViewPermitida() {
  if (!currentUserVisibleViews || currentUserVisibleViews.length === 0) return "dashboard";
  return currentUserVisibleViews[0];
}

function setView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "dashboard") renderDashboard();
  if (view === "estoque") renderEstoque();
  if (view === "previsto") { renderProdutoSelects(); renderPrevistos(); }
  if (view === "movimentacoes") { renderProdutoSelects(); renderMovimentos(); }
  if (view === "produtos") renderProdutos();
  if (view === "catalogo") renderCatalogo();
  if (view === "fretes") renderFretes();
  if (view === "entregas") { renderClienteSelect(); renderFaturamentoDatalists(); renderEntregas(); }
  if (view === "faturamento") { renderClienteSelect(); renderFaturamentoDatalists(); renderFaturamento(); renderVendas(); }
  if (view === "clientes") renderClientes();
  if (view === "historico") renderHistorico();
  if (view === "relatorios") renderRelatorioCodigoListas();
  if (view === "administracao") renderAdministracao();
}

/* ---------------- render: ESTOQUE ---------------- */

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function formatMoney(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function renderEstoqueKpis() {
  const rows = listEstoque();
  const totalSaldo = rows.reduce((a, r) => a + r.saldo, 0);
  const totalEntradas = rows.reduce((a, r) => a + r.entradas, 0);
  const totalSaidas = rows.reduce((a, r) => a + r.saidas, 0);
  const zerados = rows.filter(r => r.saldo <= 0).length;
  const baixos = getProdutosEstoqueBaixo().length;
  const hoje = todayISO();
  const movHoje = state.movimentos.filter(m => m.data === hoje).length;

  const kpis = [
    { lbl: "Pneus em estoque (saldo)", val: fmt(totalSaldo), accent: true },
    { lbl: "Total recebido (histórico)", val: fmt(totalEntradas) },
    { lbl: "Total de saídas (histórico)", val: fmt(totalSaidas) },
    { lbl: "Produtos com saldo zerado", val: fmt(zerados) },
    { lbl: "Produtos com saldo baixo", val: fmt(baixos) },
    { lbl: "Movimentações hoje", val: fmt(movHoje) }
  ];
  document.getElementById("estoqueKpis").innerHTML = kpis.map(k => `
    <div class="kpi ${k.accent ? "accent" : ""}">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}</div>
    </div>
  `).join("");
}

function renderEstoqueDonutMedida() {
  const rows = listEstoque().filter(r => r.saldo > 0);
  const porMedida = {};
  rows.forEach(r => {
    const base = extractMedidaBase(r.medida);
    porMedida[base] = (porMedida[base] || 0) + r.saldo;
  });
  const entries = Object.entries(porMedida).sort((a, b) => b[1] - a[1]);
  const empty = document.getElementById("estoqueDonutEmpty");
  if (entries.length === 0) {
    if (dashCharts["chartEstoqueMedida"]) { dashCharts["chartEstoqueMedida"].destroy(); delete dashCharts["chartEstoqueMedida"]; }
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  const folded = foldTopN(entries.map(([m]) => m), entries.map(([, q]) => q), 6);
  dashChart("chartEstoqueMedida",
    dashDonutConfig(folded.labels, folded.data, { valueIsMoney: false }),
    { type: "donut", title: "Estoque por Medida", labels: folded.labels, data: folded.data, opts: { valueIsMoney: false } }
  );
}

function renderEstoqueSaldoBaixoLista() {
  const baixos = getProdutosEstoqueBaixo();
  const countEl = document.getElementById("estoqueSaldoBaixoCount");
  const listEl = document.getElementById("estoqueSaldoBaixoLista");
  countEl.textContent = baixos.length;
  if (baixos.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Nenhum produto com saldo baixo.</div>`;
    return;
  }
  listEl.innerHTML = baixos.map(p => `
    <div class="alerta-item">
      <span class="codigo">${escapeHtml(p.codigo)}</span>
      <span class="medida">${escapeHtml(p.medida)}</span>
      <span class="saldo ${p.saldo <= 0 ? "saldo-zero" : "saldo-baixo"}">${fmt(p.saldo)} un.</span>
    </div>
  `).join("");
}

const ESTOQUE_SIDE_WIDTH_KEY = "torun_estoque_side_width_v1";
const ESTOQUE_SIDE_WIDTH_MIN = 240;
const ESTOQUE_SIDE_WIDTH_MAX = 560;

function initEstoqueResize() {
  const layout = document.querySelector(".estoque-layout");
  const handle = document.getElementById("estoqueResizeHandle");
  if (!layout || !handle) return;

  const salvo = parseInt(localStorage.getItem(ESTOQUE_SIDE_WIDTH_KEY), 10);
  if (salvo && salvo >= ESTOQUE_SIDE_WIDTH_MIN && salvo <= ESTOQUE_SIDE_WIDTH_MAX) {
    layout.style.setProperty("--estoque-side-width", salvo + "px");
  }

  let arrastando = false;

  handle.addEventListener("mousedown", (e) => {
    arrastando = true;
    handle.classList.add("dragging");
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    const rect = layout.getBoundingClientRect();
    let largura = rect.right - e.clientX;
    largura = Math.max(ESTOQUE_SIDE_WIDTH_MIN, Math.min(ESTOQUE_SIDE_WIDTH_MAX, largura));
    layout.style.setProperty("--estoque-side-width", largura + "px");
  });

  document.addEventListener("mouseup", () => {
    if (!arrastando) return;
    arrastando = false;
    handle.classList.remove("dragging");
    document.body.style.userSelect = "";
    const largura = layout.style.getPropertyValue("--estoque-side-width");
    if (largura) {
      localStorage.setItem(ESTOQUE_SIDE_WIDTH_KEY, parseInt(largura, 10));
    }
    if (dashCharts["chartEstoqueMedida"]) dashCharts["chartEstoqueMedida"].resize();
  });
}

function renderEstoque() {
  renderEstoqueKpis();
  renderEstoqueDonutMedida();
  renderEstoqueSaldoBaixoLista();
  const search = (document.getElementById("estoqueSearch").value || "").trim().toLowerCase();
  const filtro = document.getElementById("estoqueFiltro").value;

  let rows = listEstoque();
  if (search) {
    rows = rows.filter(r =>
      r.codigo.toLowerCase().includes(search) ||
      r.medida.toLowerCase().includes(search) ||
      r.processos.some(proc => proc.toLowerCase().includes(search))
    );
  }
  if (filtro === "disponivel") rows = rows.filter(r => r.saldo > 0);
  if (filtro === "zerado") rows = rows.filter(r => r.saldo <= 0);

  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const tbody = document.getElementById("estoqueTbody");
  const empty = document.getElementById("estoqueEmpty");

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = rows.map(r => {
    const status = statusEstoque(r.saldo);
    const pillLabel = status === "esgotado" ? "Esgotado" : status === "baixo" ? "Baixo" : status === "atencao" ? "Atenção" : "Normal";
    const pct = r.entradas > 0 ? Math.max(0, Math.min(100, (r.saldo / r.entradas) * 100)) : 0;
    return `
      <tr>
        <td class="mono">${escapeHtml(r.codigo)}</td>
        <td class="${r.entradas > 0 ? "estoque-medida-click" : ""}" ${r.entradas > 0 ? `data-medidacodigo="${escapeAttr(r.codigo)}"` : ""}>${escapeHtml(r.medida)}</td>
        <td class="mono muted">${r.processos.length ? escapeHtml(r.processos.join(", ")) : "—"}</td>
        <td class="num">${fmt(r.entradas)}</td>
        <td class="num">${fmt(r.saidas)}</td>
        <td class="num">
          <div class="saldo-cell">
            <span class="saldo-bar"><span class="saldo-bar-fill fill-${status}" style="width:${pct}%"></span></span>
            <span class="saldo-val">${fmt(r.saldo)}</span>
            <span class="status-pill pill-${status}">${pillLabel}</span>
          </div>
        </td>
        <td>
          <button class="btn small outline" data-hist="${escapeAttr(r.codigo)}">Histórico</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-hist]").forEach(btn => {
    btn.addEventListener("click", () => {
      setView("movimentacoes");
      document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === "movimentacoes"));
      document.getElementById("movSearch").value = btn.dataset.hist;
      renderMovimentos();
      document.getElementById("view-movimentacoes").scrollIntoView({ behavior: "smooth" });
    });
  });

  tbody.querySelectorAll("[data-medidacodigo]").forEach(td => {
    td.addEventListener("click", () => openProcessoModal(td.dataset.medidacodigo));
  });
}

/* ---------------- render: ESTOQUE PREVISTO ---------------- */

function statusBadgeClass(status) {
  if (status === "AG RETIRADA NO PORTO") return "st-porto";
  if (status === "DTC") return "st-dtc";
  return "st-aguardando";
}

function renderPrevistos() {
  const search = (document.getElementById("prevSearch").value || "").trim().toLowerCase();
  const filtroStatus = document.getElementById("prevFiltroStatus").value;

  let rows = state.previsoes.slice();
  if (search) {
    rows = rows.filter(p => {
      const medidas = p.itens.map(it => { const prod = getProduto(it.codigo); return prod ? prod.medida : it.codigo; }).join(" ");
      return (p.numeroProcesso + " " + medidas).toLowerCase().includes(search);
    });
  }
  if (filtroStatus !== "todos") rows = rows.filter(p => p.status === filtroStatus);

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const grid = document.getElementById("prevGrid");
  const empty = document.getElementById("prevEmpty");
  if (rows.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = rows.map(p => {
    const itensHtml = p.itens.map(it => {
      const prod = getProduto(it.codigo);
      return `
        <li>
          <span class="mono">${escapeHtml(it.codigo)}</span>
          <span class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span>
          <span class="num mono">${fmt(it.quantidade)}</span>
        </li>
      `;
    }).join("");

    const statusOptions = PREVISTO_STATUS.map(s => `<option value="${escapeAttr(s)}" ${s === p.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");

    return `
      <div class="prev-card ${statusBadgeClass(p.status)}">
        <div class="prev-card-head">
          <div>
            <span class="prev-card-eyebrow">Processo</span>
            <span class="mono prev-card-title">${escapeHtml(p.numeroProcesso)}</span>
            <span class="prev-status-badge ${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
          </div>
          <div class="prev-card-actions write-ui">
            <button class="btn small outline" data-editprev="${p.id}">Editar</button>
            <button class="btn small danger" data-delprev="${p.id}">✕</button>
          </div>
        </div>
        <ul class="prev-itens-list">${itensHtml}</ul>
        ${p.obs ? `<div class="muted prev-card-obs">${escapeHtml(p.obs)}</div>` : ""}
        <div class="prev-card-footer">
          <div class="field">
            <label>Data de chegada</label>
            <input type="date" value="${escapeAttr(p.dataChegada || "")}" data-datachegada="${p.id}" ${currentUserRole === "viewer" ? "disabled" : ""}>
          </div>
          <div class="field">
            <label>Status</label>
            <select data-statusfield="${p.id}" ${currentUserRole === "viewer" ? "disabled" : ""}>${statusOptions}</select>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-datachegada]").forEach(inp => {
    inp.addEventListener("change", async () => {
      const p = state.previsoes.find(x => x.id === inp.dataset.datachegada);
      if (!p) return;
      const { error } = await sb.from("previsoes").update({ data_chegada: inp.value || null }).eq("id", p.id);
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      p.dataChegada = inp.value;
      await registrarLog("previsoes", p.id, "edicao", "Ação automática",
        `Data de chegada do processo ${p.numeroProcesso} alterada para ${inp.value ? formatDateBR(inp.value) : "(vazio)"}`);
      toast("Data de chegada atualizada.");
    });
  });

  grid.querySelectorAll("[data-statusfield]").forEach(sel => {
    sel.addEventListener("change", async () => {
      const p = state.previsoes.find(x => x.id === sel.dataset.statusfield);
      if (!p) return;
      const { error } = await sb.from("previsoes").update({ status: sel.value }).eq("id", p.id);
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      p.status = sel.value;
      await registrarLog("previsoes", p.id, "edicao", "Ação automática", `Status do processo ${p.numeroProcesso} alterado para ${sel.value}`);
      renderPrevistos();
      toast("Status atualizado.");
    });
  });

  grid.querySelectorAll("[data-editprev]").forEach(btn => {
    btn.addEventListener("click", () => startEditPrevisto(btn.dataset.editprev));
  });

  grid.querySelectorAll("[data-delprev]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const motivo = await motivoModal("Excluir processo previsto?", "Remove esse processo e as medidas associadas a ele desta lista. Informe o motivo da exclusão.");
      if (!motivo) return;
      const alvo = state.previsoes.find(p => p.id === btn.dataset.delprev);
      const { error } = await sb.from("previsoes").delete().eq("id", btn.dataset.delprev);
      if (error) { toast("Erro ao excluir: " + error.message); return; }
      await registrarLog("previsoes", btn.dataset.delprev, "exclusao", motivo, alvo ? `Processo ${alvo.numeroProcesso}` : "");
      if (editingPrevistoId === btn.dataset.delprev) cancelEditPrevisto();
      state.previsoes = state.previsoes.filter(p => p.id !== btn.dataset.delprev);
      renderPrevistos();
      toast("Processo removido.");
    });
  });
}

function startEditPrevisto(id) {
  const p = state.previsoes.find(x => x.id === id);
  if (!p) return;
  editingPrevistoId = id;
  editingPrevistoUpdatedAt = p.updatedAt;

  document.getElementById("prevNumeroProcesso").value = p.numeroProcesso;
  document.getElementById("prevDataChegada").value = p.dataChegada || "";
  document.getElementById("prevStatus").value = p.status;
  document.getElementById("prevObs").value = p.obs || "";

  const container = document.getElementById("prevItens");
  container.innerHTML = "";
  (p.itens.length ? p.itens : [{ codigo: "", quantidade: "" }]).forEach(it => {
    const row = createItemRow("prevItens");
    container.appendChild(row);
    if (it.codigo) row.querySelector(".item-produto").value = it.codigo;
    row.querySelector(".item-qtd").value = it.quantidade;
  });
  updateItemRemoveVisibility("prevItens");

  document.getElementById("prevFormTitle").textContent = "Editar processo previsto";
  document.getElementById("prevEditBanner").style.display = "block";
  document.getElementById("btnSubmitPrevisto").textContent = "Salvar alterações";
  document.getElementById("formPrevisto").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditPrevisto() {
  editingPrevistoId = null;
  editingPrevistoUpdatedAt = null;
  document.getElementById("formPrevisto").reset();
  document.getElementById("prevStatus").value = "AG DATA DE CHEGADA";
  resetItens("prevItens");
  document.getElementById("prevFormTitle").textContent = "Novo processo previsto";
  document.getElementById("prevEditBanner").style.display = "none";
  document.getElementById("btnSubmitPrevisto").textContent = "Adicionar processo";
}

/* ---------------- render: PRODUTO SELECTS (movimentações) ---------------- */

function produtoOptionsHTML() {
  return state.produtos
    .slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map(p => `<option value="${escapeAttr(p.codigo)}">${escapeHtml(p.codigo)} — ${escapeHtml(p.medida)}</option>`)
    .join("");
}

function relatorioCodigoCards() {
  return Array.from(document.querySelectorAll(".report-card")).filter(c => c.querySelector(".report-codigo-lista"));
}

function relatorioCodigosSelecionados(card) {
  return Array.from(card.querySelectorAll(".report-codigo-lista input")).filter(cb => cb.checked).map(cb => cb.dataset.codigo);
}

function atualizarBotaoCodigoRelatorio(card) {
  const checkboxes = card.querySelectorAll(".report-codigo-lista input");
  const total = checkboxes.length;
  const marcados = Array.from(checkboxes).filter(cb => cb.checked).length;
  const btn = card.querySelector(".report-codigo-btn");
  if (total === 0 || marcados === total) btn.textContent = "☰ Todos os produtos";
  else if (marcados === 0) btn.textContent = "☰ Nenhum produto selecionado";
  else btn.textContent = `☰ ${marcados} produto${marcados > 1 ? "s" : ""} selecionado${marcados > 1 ? "s" : ""}`;
}

function renderRelatorioCodigoListas() {
  relatorioCodigoCards().forEach(card => {
    const lista = card.querySelector(".report-codigo-lista");
    const jaTinhaItens = lista.children.length > 0;
    const anterior = jaTinhaItens ? new Set(relatorioCodigosSelecionados(card)) : null;
    lista.innerHTML = state.produtos.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)).map(p => `
      <label class="dash-filter-item">
        <input type="checkbox" data-codigo="${escapeAttr(p.codigo)}" ${(!jaTinhaItens || anterior.has(p.codigo)) ? "checked" : ""}>
        ${escapeHtml(p.codigo)} — ${escapeHtml(p.medida)}
      </label>
    `).join("");
    atualizarBotaoCodigoRelatorio(card);
  });
}

function initRelatorioCodigoFiltros() {
  relatorioCodigoCards().forEach(card => {
    const btn = card.querySelector(".report-codigo-btn");
    const panel = card.querySelector(".report-codigo-panel");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const abrir = panel.style.display === "none";
      document.querySelectorAll(".report-codigo-panel").forEach(p => { p.style.display = "none"; });
      panel.style.display = abrir ? "block" : "none";
    });
    card.querySelector(".report-codigo-lista").addEventListener("change", (e) => {
      if (!e.target.matches("[data-codigo]")) return;
      atualizarBotaoCodigoRelatorio(card);
    });
    card.querySelector(".report-codigo-todos").addEventListener("click", () => {
      card.querySelectorAll(".report-codigo-lista input").forEach(cb => { cb.checked = true; });
      atualizarBotaoCodigoRelatorio(card);
    });
    card.querySelector(".report-codigo-nenhum").addEventListener("click", () => {
      card.querySelectorAll(".report-codigo-lista input").forEach(cb => { cb.checked = false; });
      atualizarBotaoCodigoRelatorio(card);
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".report-codigo-wrap")) {
      document.querySelectorAll(".report-codigo-panel").forEach(p => { p.style.display = "none"; });
    }
  });
}

function renderProdutoSelects() {
  const opts = produtoOptionsHTML();
  document.querySelectorAll("#entItens .item-produto, #saiItens .item-produto, #prevItens .item-produto").forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = opts;
    if (prev) sel.value = prev;
  });
}

/* ---------------- entrada/saída: linhas de medida (item rows) ---------------- */

function createItemRow(containerId, comProcesso) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <select class="item-produto" required>${produtoOptionsHTML()}</select>
    <input type="number" class="item-qtd" min="1" step="1" placeholder="Qtd" required>
    ${comProcesso ? `<input type="text" class="item-processo" placeholder="Processo (ex: 3061-26)">` : ""}
    <button type="button" class="btn small danger item-remove" title="Remover medida">✕</button>
  `;
  row.querySelector(".item-remove").addEventListener("click", () => {
    const container = document.getElementById(containerId);
    if (container.children.length > 1) {
      row.remove();
      updateItemRemoveVisibility(containerId);
    }
  });
  return row;
}

function updateItemRemoveVisibility(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .item-row`);
  rows.forEach(r => {
    r.querySelector(".item-remove").style.visibility = rows.length > 1 ? "visible" : "hidden";
  });
}

function resetItens(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  container.appendChild(createItemRow(containerId));
  updateItemRemoveVisibility(containerId);
}

/* ---------------- render: MOVIMENTAÇÕES ---------------- */

function extrairClienteDeObs(obs) {
  if (!obs) return "";
  const m = obs.match(/Cliente:\s*(.+)$/);
  if (!m) return "";
  const nome = m[1].trim();
  return nome === "—" ? "" : nome;
}

function renderMovimentosStats() {
  const hoje = todayISO();
  const de30 = new Date();
  de30.setDate(de30.getDate() - 30);
  const de30ISO = de30.toISOString().slice(0, 10);

  const janela = state.movimentos.filter(m => m.data >= de30ISO);
  const entradasQtd = janela.filter(m => m.tipo === "entrada").reduce((a, m) => a + m.quantidade, 0);
  const saidasQtd = janela.filter(m => m.tipo !== "entrada").reduce((a, m) => a + m.quantidade, 0);
  const saldo = entradasQtd - saidasQtd;

  const entradasHoje = state.movimentos.filter(m => m.tipo === "entrada" && m.data === hoje).reduce((a, m) => a + m.quantidade, 0);
  const saidasHoje = state.movimentos.filter(m => m.tipo !== "entrada" && m.data === hoje).reduce((a, m) => a + m.quantidade, 0);

  const automaticas = janela.filter(m => m.entregaId).length;
  const manuais = janela.filter(m => !m.entregaId).length;

  const stats = [
    { hero: true, lbl: "Saldo (30 dias)", val: `${saldo >= 0 ? "+" : ""}${fmt(saldo)} un.`, sub: `${fmt(entradasQtd)} entradas · ${fmt(saidasQtd)} saídas` },
    { lbl: "Entradas hoje", val: `+${fmt(entradasHoje)}`, up: true },
    { lbl: "Saídas hoje", val: saidasHoje > 0 ? `−${fmt(saidasHoje)}` : "0" },
    { lbl: "Automáticas (30 dias)", val: fmt(automaticas), sub: "geradas por pedidos autorizados" },
    { lbl: "Manuais (30 dias)", val: fmt(manuais) }
  ];

  document.getElementById("movStats").innerHTML = stats.map(s => `
    <div class="stat ${s.hero ? "hero" : ""}">
      <div class="lbl">${s.lbl}</div>
      <div class="val ${s.up ? "up" : ""}">${s.val}</div>
      ${s.sub ? `<div class="sub">${s.sub}</div>` : ""}
    </div>
  `).join("");
}

function renderMovimentosDonut() {
  const saidas = state.movimentos.filter(m => m.tipo !== "entrada");
  const porTipo = {};
  saidas.forEach(m => { porTipo[m.tipo] = (porTipo[m.tipo] || 0) + m.quantidade; });
  const entries = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
  const empty = document.getElementById("movDonutEmpty");
  if (entries.length === 0) {
    if (dashCharts["chartMovimentosTipo"]) { dashCharts["chartMovimentosTipo"].destroy(); delete dashCharts["chartMovimentosTipo"]; }
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  const labels = entries.map(([t]) => TIPO_LABEL[t] || t);
  const data = entries.map(([, q]) => q);
  dashChart("chartMovimentosTipo",
    dashDonutConfig(labels, data, { valueIsMoney: false }),
    { type: "donut", title: "Saídas por Tipo", labels, data, opts: { valueIsMoney: false } }
  );
}

function renderMovimentosAutomaticos() {
  const autos = state.movimentos
    .filter(m => m.entregaId)
    .sort((a, b) => (b.data + b.createdAt).localeCompare(a.data + a.createdAt))
    .slice(0, 5);
  const listEl = document.getElementById("movAutomaticosLista");
  const emptyEl = document.getElementById("movAutomaticosEmpty");
  if (autos.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";
  listEl.innerHTML = autos.map(m => {
    const p = getProduto(m.codigo);
    const cliente = extrairClienteDeObs(m.obs);
    const titulo = m.pedido ? `Ped. ${m.pedido}${cliente ? " · " + cliente : ""}` : (cliente || TIPO_LABEL[m.tipo] || m.tipo);
    const sub = `${m.codigo}${p ? " · " + p.medida : ""} · ${formatDateBR(m.data)}`;
    const up = m.tipo === "entrada";
    return `
      <div class="auto-item">
        <div class="auto-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10h10M11 6l4 4-4 4"/></svg></div>
        <div class="auto-body">
          <div class="auto-title">${escapeHtml(titulo)}</div>
          <div class="auto-sub">${escapeHtml(sub)}</div>
        </div>
        <div class="auto-qtd ${up ? "up" : ""}">${up ? "+" : "−"}${fmt(m.quantidade)}</div>
      </div>
    `;
  }).join("");
}

function renderMovimentos() {
  renderMovimentosStats();
  renderMovimentosDonut();
  renderMovimentosAutomaticos();
  const search = (document.getElementById("movSearch").value || "").trim().toLowerCase();
  const tipoF = document.getElementById("movFiltroTipo").value;
  const de = document.getElementById("movFiltroDe").value;
  const ate = document.getElementById("movFiltroAte").value;

  let rows = state.movimentos.slice();

  if (search) {
    rows = rows.filter(m => {
      const p = getProduto(m.codigo);
      const hay = [m.codigo, p ? p.medida : "", m.numero, m.pedido || "", m.processo || ""].join(" ").toLowerCase();
      return hay.includes(search);
    });
  }
  if (tipoF !== "todos") rows = rows.filter(m => m.tipo === tipoF);
  if (de) rows = rows.filter(m => m.data >= de);
  if (ate) rows = rows.filter(m => m.data <= ate);

  rows.sort((a, b) => (b.data + b.createdAt).localeCompare(a.data + a.createdAt));

  document.getElementById("movCount").textContent = `${rows.length} de ${state.movimentos.length} movimentações`;

  const tbody = document.getElementById("movTbody");
  const empty = document.getElementById("movEmpty");

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = rows.map(m => {
    const p = getProduto(m.codigo);
    const sinal = m.tipo === "entrada" ? "+" : "−";
    return `
      <tr>
        <td class="mono">${formatDateBR(m.data)}</td>
        <td><span class="badge ${m.tipo}">${TIPO_LABEL[m.tipo]}</span></td>
        <td>
          <div class="mono">${escapeHtml(m.codigo)}</div>
          <div class="muted" style="font-size:11px;">${escapeHtml(p ? p.medida : "(produto removido)")}</div>
        </td>
        <td class="num mono">${sinal}${fmt(m.quantidade)}</td>
        <td class="mono">${escapeHtml(m.numero || "—")}${m.pedido ? `<div class="muted" style="font-size:11px;">Ped. ${escapeHtml(m.pedido)}</div>` : ""}${m.processo ? `<div class="muted" style="font-size:11px;">Proc. ${escapeHtml(m.processo)}</div>` : ""}</td>
        <td class="muted">${escapeHtml(m.obs || "—")}</td>
        <td>${m.entregaId
          ? `<span class="origem-tag auto"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10h10M11 6l4 4-4 4"/></svg>Automático</span>`
          : `<span class="origem-tag">Manual</span>`}</td>
        <td style="white-space:nowrap;">
          <span class="write-ui">
            <button class="btn small outline" data-edit="${m.id}">Editar</button>
            <button class="btn small danger" data-del="${m.id}">Excluir</button>
          </span>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => startEditMovimento(btn.dataset.edit));
  });

  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const motivo = await motivoModal("Excluir movimentação?", "Essa ação não pode ser desfeita. O saldo do produto será recalculado. Informe o motivo da exclusão.");
      if (!motivo) return;
      const alvo = state.movimentos.find(m => m.id === btn.dataset.del);
      const { error } = await sb.from("movimentos").delete().eq("id", btn.dataset.del);
      if (error) { toast("Erro ao excluir: " + error.message); return; }
      await registrarLog("movimentos", btn.dataset.del, "exclusao", motivo,
        alvo ? `${TIPO_LABEL[alvo.tipo] || alvo.tipo} · NF ${alvo.numero || "—"} · ${alvo.codigo} · ${alvo.quantidade} un.` : "");
      if (editingMovimentoId === btn.dataset.del && alvo) {
        cancelEditMovimento(alvo.tipo === "entrada" ? "entrada" : "saida");
      }
      state.movimentos = state.movimentos.filter(m => m.id !== btn.dataset.del);
      renderMovimentos();
      toast("Movimentação excluída.");
    });
  });
}

function openEntradaModal() {
  document.getElementById("entradaModalOverlay").classList.add("show");
}
function closeEntradaModal() {
  document.getElementById("entradaModalOverlay").classList.remove("show");
}
function openSaidaModal() {
  document.getElementById("saidaModalOverlay").classList.add("show");
}
function closeSaidaModal() {
  document.getElementById("saidaModalOverlay").classList.remove("show");
}

function startEditMovimento(movId) {
  const m = state.movimentos.find(x => x.id === movId);
  if (!m) return;
  editingMovimentoId = movId;
  editingMovimentoUpdatedAt = m.updatedAt;

  if (m.tipo === "entrada") {
    document.getElementById("entData").value = m.data;
    document.getElementById("entNumero").value = m.numero || "";
    document.getElementById("entPedido").value = m.pedido || "";
    document.getElementById("entProcesso").value = m.processo || "";
    document.getElementById("entObs").value = m.obs || "";
    const container = document.getElementById("entItens");
    container.innerHTML = "";
    const row = createItemRow("entItens");
    container.appendChild(row);
    row.querySelector(".item-produto").value = m.codigo;
    row.querySelector(".item-qtd").value = m.quantidade;
    updateItemRemoveVisibility("entItens");
    document.getElementById("btnAddItemEntrada").style.display = "none";
    document.getElementById("entFormTitle").textContent = "Editar entrada";
    document.getElementById("entEditBanner").style.display = "block";
    document.getElementById("btnSubmitEntrada").textContent = "Salvar alterações";
    openEntradaModal();
  } else {
    document.getElementById("saiTipo").value = m.tipo;
    document.getElementById("saiTipo").dispatchEvent(new Event("change"));
    document.getElementById("saiData").value = m.data;
    document.getElementById("saiNumero").value = m.numero || "";
    document.getElementById("saiPedido").value = m.pedido || "";
    document.getElementById("saiProcesso").value = m.processo || "";
    document.getElementById("saiObs").value = m.obs || "";
    const container = document.getElementById("saiItens");
    container.innerHTML = "";
    const row = createItemRow("saiItens");
    container.appendChild(row);
    row.querySelector(".item-produto").value = m.codigo;
    row.querySelector(".item-qtd").value = m.quantidade;
    updateItemRemoveVisibility("saiItens");
    document.getElementById("btnAddItemSaida").style.display = "none";
    document.getElementById("saiFormTitle").textContent = "Editar saída";
    document.getElementById("saiEditBanner").style.display = "block";
    document.getElementById("btnSubmitSaida").textContent = "Salvar alterações";
    openSaidaModal();
  }
}

function cancelEditMovimento(which) {
  editingMovimentoId = null;
  editingMovimentoUpdatedAt = null;
  if (which === "entrada") {
    document.getElementById("formEntrada").reset();
    document.getElementById("entData").value = todayISO();
    resetItens("entItens");
    document.getElementById("btnAddItemEntrada").style.display = "";
    document.getElementById("entFormTitle").textContent = "Nova entrada";
    document.getElementById("entEditBanner").style.display = "none";
    document.getElementById("btnSubmitEntrada").textContent = "Registrar entrada";
    closeEntradaModal();
  } else {
    document.getElementById("formSaida").reset();
    document.getElementById("saiData").value = todayISO();
    document.getElementById("saiNumeroLabel").textContent = "Nº NF de venda";
    resetItens("saiItens");
    document.getElementById("btnAddItemSaida").style.display = "";
    document.getElementById("saiFormTitle").textContent = "Nova saída";
    document.getElementById("saiEditBanner").style.display = "none";
    document.getElementById("btnSubmitSaida").textContent = "Registrar saída";
    closeSaidaModal();
  }
}


/* ---------------- render: PRODUTOS ---------------- */

function renderProdutos() {
  const search = (document.getElementById("prodSearch").value || "").trim().toLowerCase();
  let rows = state.produtos.slice();
  if (search) {
    rows = rows.filter(p => p.codigo.toLowerCase().includes(search) || p.medida.toLowerCase().includes(search));
  }
  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  document.getElementById("prodCount").textContent = `${state.produtos.length} produto(s) cadastrado(s)`;

  document.getElementById("prodTbody").innerHTML = rows.map(p => `
    <tr>
      <td class="mono">${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.medida)}</td>
      <td class="mono muted">${escapeHtml(extractMedidaBase(p.medida))}</td>
      <td><button class="btn small danger write-ui" data-delprod="${escapeAttr(p.codigo)}">Excluir</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-delprod]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const codigo = btn.dataset.delprod;
      const temMov = state.movimentos.some(m => m.codigo === codigo);
      if (temMov) {
        toast("Não é possível excluir: esse produto já tem movimentações.");
        return;
      }
      const motivo = await motivoModal("Excluir produto?", `Remover "${codigo}" do cadastro? Informe o motivo da exclusão.`);
      if (!motivo) return;
      const { error } = await sb.from("produtos").delete().eq("codigo", codigo);
      if (error) { toast("Erro ao excluir produto: " + error.message); return; }
      await registrarLog("produtos", codigo, "exclusao", motivo, codigo);
      state.produtos = state.produtos.filter(p => p.codigo !== codigo);
      renderProdutos();
      toast("Produto removido.");
    });
  });
}

/* ---------------- render: CATALOGO ---------------- */

let catalogoEditingCodigo = null;
const catalogoPrazosAbertos = new Set();

function populateCatalogoFiltroCategoria() {
  const sel = document.getElementById("catFiltroCategoria");
  const atual = sel.value;
  const categorias = [...new Set(state.produtos.map(p => p.categoria).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Todas</option>` + categorias.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  if (categorias.includes(atual)) sel.value = atual;
}

function populateCatalogoCondicao() {
  const selCondicao = document.getElementById("catCondicao");
  if (selCondicao.options.length <= 1) {
    selCondicao.innerHTML = `<option value="">Selecione…</option>` + CATALOGO_CONDICOES.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  }
}

function populateCatalogoTipoCliente() {
  const opcoesHtml = TIPO_CLIENTE_OPCOES.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(TIPO_CLIENTE_LABEL[t])}</option>`).join("");
  [document.getElementById("catTipoCliente"), document.getElementById("catalogoModalTipoCliente")].forEach(sel => {
    if (sel && sel.options.length === 0) {
      sel.innerHTML = opcoesHtml;
      sel.value = "CONSUMO";
    }
  });
}

function buildPrecoMatrixHtml(codigo, tipoCliente) {
  const precos = getPrecosDoProduto(codigo, tipoCliente);
  if (precos.length === 0) {
    return `<div class="muted" style="padding:8px 0;">Nenhum preço cadastrado para este produto (${escapeHtml(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente)}) ainda.</div>`;
  }
  const linhas = CATALOGO_CONDICOES.map(cond => {
    const cells = CATALOGO_REGIOES.map(r => precos.find(x => x.regiao === r && x.condicaoPagamento === cond));
    if (cells.every(c => !c)) return "";
    return `<tr><td class="mono">${escapeHtml(cond)}</td>${cells.map(c => `<td class="num mono">${c ? formatMoney(c.preco) : "—"}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="catalogo-preco-table">
    <thead><tr><th>Condição</th>${CATALOGO_REGIOES.map(r => `<th>${escapeHtml(r)}</th>`).join("")}</tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`;
}

function buildPrecoMatrixEditHtml(codigo, tipoCliente) {
  const precos = getPrecosDoProduto(codigo, tipoCliente);
  const linhas = CATALOGO_CONDICOES.map(cond => {
    const cells = CATALOGO_REGIOES.map(r => {
      const p = precos.find(x => x.regiao === r && x.condicaoPagamento === cond);
      return `<td><input type="number" step="0.01" min="0" class="catalogo-preco-input" data-regiao="${escapeAttr(r)}" data-condicao="${escapeAttr(cond)}" value="${p ? p.preco : ""}" placeholder="—"></td>`;
    }).join("");
    return `<tr><td class="mono">${escapeHtml(cond)}</td>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="catalogo-preco-table catalogo-preco-table-edit">
    <thead><tr><th>Condição</th>${CATALOGO_REGIOES.map(r => `<th>${escapeHtml(r)}</th>`).join("")}</tr></thead>
    <tbody>${linhas}</tbody>
  </table></div>`;
}

function renderCatalogo() {
  populateCatalogoFiltroCategoria();
  populateCatalogoCondicao();
  populateCatalogoTipoCliente();

  const search = (document.getElementById("catSearch").value || "").trim().toLowerCase();
  const categoria = document.getElementById("catFiltroCategoria").value;
  const condicao = document.getElementById("catCondicao").value;
  const tipoCliente = document.getElementById("catTipoCliente").value || "CONSUMO";

  let rows = state.produtos.filter(p => computeProdutoTotais(p.codigo).saldo > 0);
  if (search) {
    rows = rows.filter(p =>
      p.codigo.toLowerCase().includes(search) ||
      p.medida.toLowerCase().includes(search) ||
      (p.modelo || "").toLowerCase().includes(search)
    );
  }
  if (categoria) rows = rows.filter(p => p.categoria === categoria);
  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const grid = document.getElementById("catalogoGrid");
  const empty = document.getElementById("catalogoEmpty");
  if (rows.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const condicaoAtual = condicao || "A VISTA";

  grid.innerHTML = rows.map(p => {
    const fotoUrl = fotoProdutoUrl(p.fotoPath);
    const fotoUrl2 = fotoProdutoUrl(p.fotoPath2);
    const fotosCard = [fotoUrl, fotoUrl2].filter(Boolean);
    const aberto = catalogoPrazosAbertos.has(p.codigo);
    const specs = [
      ["PR / Lonas", p.pr], ["Cintas", p.cintas], ["Cap. carga", p.capCarga],
      ["PSI", p.psi], ["Sulco (mm)", p.sulcoMm], ["Peso (kg)", p.pesoKg]
    ];
    const temAlgumSpec = specs.some(([, v]) => v);

    const precoPorRegiao = CATALOGO_REGIOES.map(r => {
      const preco = getPrecoProduto(p.codigo, r, tipoCliente, condicaoAtual);
      return `<div class="catalogo-prazo-row">
        <span>${escapeHtml(r)}</span>
        <span class="mono">${preco !== null ? formatMoney(preco) : "—"}</span>
      </div>`;
    }).join("");

    return `
      <div class="catalogo-card" data-catcard="${escapeAttr(p.codigo)}">
        <button type="button" class="catalogo-card-editbtn write-ui" data-editcard="${escapeAttr(p.codigo)}" title="Editar especificações">✎</button>
        <div class="catalogo-card-top">
          ${fotosCard.length ? `<div class="catalogo-card-thumbs">${fotosCard.map((url, i) => `<img class="catalogo-card-thumb" src="${escapeAttr(url)}" alt="${escapeAttr(p.codigo)}" data-catfoto="${escapeAttr(p.codigo)}" data-catfotoidx="${i}">`).join("")}</div>` : ""}
          <div class="catalogo-card-titulo-wrap">
            <div class="catalogo-card-titulo">${escapeHtml(p.modelo || p.codigo)}</div>
            <div class="catalogo-card-codigo mono muted">${escapeHtml(p.codigo)}</div>
          </div>
          ${p.categoria ? `<span class="catalogo-badge">${escapeHtml(p.categoria)}</span>` : ""}
        </div>
        <div class="catalogo-card-medida">${escapeHtml(p.medida)}</div>

        ${temAlgumSpec ? `
          <div class="catalogo-card-divider"></div>
          <div class="catalogo-specs-grid">
            ${specs.map(([lbl, v]) => `<div><span class="lbl">${escapeHtml(lbl)}</span><span class="val">${v ? escapeHtml(v) : "—"}</span></div>`).join("")}
          </div>
        ` : ""}

        <div class="catalogo-card-divider"></div>
        <div class="catalogo-preco-condicao">Preço — ${escapeHtml(TIPO_CLIENTE_LABEL[tipoCliente] || tipoCliente)} · ${escapeHtml(condicaoAtual)}</div>
        <div class="catalogo-prazos-lista aberto">
          ${precoPorRegiao}
        </div>

        <button type="button" class="btn small outline" style="width:100%;margin-top:10px;" data-toggleprazos="${escapeAttr(p.codigo)}">${aberto ? "Ocultar todos os prazos" : "Ver todos os prazos"}</button>
        <div class="catalogo-prazos-matriz" data-prazoslista="${escapeAttr(p.codigo)}" style="display:${aberto ? "" : "none"};">
          ${aberto ? buildPrecoMatrixHtml(p.codigo, tipoCliente) : ""}
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-editcard]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCatalogoModal(btn.dataset.editcard);
    });
  });
  grid.querySelectorAll("[data-catfoto]").forEach(img => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const prod = getProduto(img.dataset.catfoto);
      if (!prod) return;
      const urls = [fotoProdutoUrl(prod.fotoPath), fotoProdutoUrl(prod.fotoPath2)].filter(Boolean);
      openCatalogoFotoLightbox(urls, Number(img.dataset.catfotoidx) || 0);
    });
  });
  grid.querySelectorAll("[data-toggleprazos]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const codigo = btn.dataset.toggleprazos;
      if (catalogoPrazosAbertos.has(codigo)) catalogoPrazosAbertos.delete(codigo);
      else catalogoPrazosAbertos.add(codigo);
      renderCatalogo();
    });
  });
}

function renderCatalogoModalPrecos(codigo) {
  const tipoCliente = document.getElementById("catalogoModalTipoCliente").value || "CONSUMO";
  document.getElementById("catalogoModalPrecoWrap").innerHTML = buildPrecoMatrixHtml(codigo, tipoCliente);
}

function openCatalogoModal(codigo) {
  const p = getProduto(codigo);
  if (!p) return;
  catalogoEditingCodigo = codigo;

  document.getElementById("catalogoModalTitulo").textContent = `${p.codigo} — ${p.medida}`;

  const fotoUrl = fotoProdutoUrl(p.fotoPath);
  const fotoUrl2 = fotoProdutoUrl(p.fotoPath2);
  [[1, fotoUrl, p.fotoPath], [2, fotoUrl2, p.fotoPath2]].forEach(([slot, url, path]) => {
    const previewEl = document.getElementById(`catalogoModalFotoPreview${slot}`);
    previewEl.classList.toggle("sem-foto", !url);
    previewEl.innerHTML = url
      ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(p.codigo)} - foto ${slot}">`
      : `<div class="catalogo-foto-placeholder">Sem foto</div>`;
    previewEl.onclick = url ? () => openCatalogoFotoLightbox([fotoUrl, fotoUrl2].filter(Boolean), url === fotoUrl ? 0 : 1) : null;
    document.getElementById(`btnCatalogoRemoverFoto${slot}`).style.display = path ? "" : "none";
  });

  const specs = [
    ["Categoria", p.categoria], ["Modelo", p.modelo], ["IC/IV", p.icIv], ["PR", p.pr],
    ["Cintas", p.cintas], ["Cap. carga", p.capCarga], ["PSI", p.psi],
    ["Sulco (mm)", p.sulcoMm], ["Larg. banda (mm)", p.largBandaMm], ["Peso (kg)", p.pesoKg]
  ].filter(([, v]) => v);
  document.getElementById("catalogoModalInfo").innerHTML = specs.length
    ? specs.map(([lbl, v]) => `<div class="catalogo-info-row"><span class="lbl">${escapeHtml(lbl)}</span><span class="val">${escapeHtml(v)}</span></div>`).join("")
    : `<div class="muted">Nenhuma especificação técnica cadastrada ainda.</div>`;

  document.getElementById("formEditarCatalogo").style.display = "none";
  document.getElementById("catalogoModalInfo").style.display = "";
  document.getElementById("catEditMedida").value = p.medida || "";
  document.getElementById("catEditCategoria").value = p.categoria || "";
  document.getElementById("catEditModelo").value = p.modelo || "";
  document.getElementById("catEditIcIv").value = p.icIv || "";
  document.getElementById("catEditPr").value = p.pr || "";
  document.getElementById("catEditCintas").value = p.cintas || "";
  document.getElementById("catEditCapCarga").value = p.capCarga || "";
  document.getElementById("catEditPsi").value = p.psi || "";
  document.getElementById("catEditSulco").value = p.sulcoMm || "";
  document.getElementById("catEditLargBanda").value = p.largBandaMm || "";
  document.getElementById("catEditPeso").value = p.pesoKg || "";

  populateCatalogoTipoCliente();
  renderCatalogoModalPrecos(codigo);
  document.getElementById("formEditarPrecosCatalogo").style.display = "none";
  document.getElementById("catalogoModalPrecoWrap").style.display = "";
  document.getElementById("btnEditarPrecosCatalogo").style.display = "";

  document.getElementById("catalogoModalOverlay").classList.add("show");
}

function closeCatalogoModal() {
  document.getElementById("catalogoModalOverlay").classList.remove("show");
  document.getElementById("formEditarCatalogo").style.display = "none";
  document.getElementById("catalogoModalInfo").style.display = "";
  document.getElementById("formEditarPrecosCatalogo").style.display = "none";
  document.getElementById("catalogoModalPrecoWrap").style.display = "";
  document.getElementById("btnEditarPrecosCatalogo").style.display = "";
  catalogoEditingCodigo = null;
}

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

async function salvarPrecosCatalogo(e) {
  e.preventDefault();
  if (!catalogoEditingCodigo) return;
  const codigo = catalogoEditingCodigo;
  const tipoCliente = document.getElementById("catalogoModalTipoCliente").value || "CONSUMO";
  const existentes = getPrecosDoProduto(codigo, tipoCliente);
  const inputs = Array.from(document.querySelectorAll("#catalogoModalPrecoEditWrap .catalogo-preco-input"));

  const upserts = [];
  const remocoes = [];
  for (const inp of inputs) {
    const regiao = inp.dataset.regiao;
    const condicao = inp.dataset.condicao;
    const existente = existentes.find(x => x.regiao === regiao && x.condicaoPagamento === condicao);
    const raw = inp.value.trim();
    if (raw === "") {
      if (existente) remocoes.push(existente.id);
      continue;
    }
    const valor = parseFloat(raw.replace(",", "."));
    if (!(valor >= 0)) { toast(`Preço inválido em ${regiao} / ${condicao}.`); return; }
    upserts.push({ codigo, regiao, tipo_cliente: tipoCliente, condicao_pagamento: condicao, preco: valor, atualizado_em: new Date().toISOString() });
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const labelOriginal = btn.textContent;
  btn.textContent = "Salvando...";

  if (upserts.length) {
    const { error } = await sb.from("produtos_precos").upsert(upserts, { onConflict: "codigo,regiao,tipo_cliente,condicao_pagamento" });
    if (error) { toast("Erro ao salvar preços: " + error.message); btn.disabled = false; btn.textContent = labelOriginal; return; }
  }
  if (remocoes.length) {
    const { error } = await sb.from("produtos_precos").delete().in("id", remocoes);
    if (error) { toast("Erro ao remover preço: " + error.message); btn.disabled = false; btn.textContent = labelOriginal; return; }
  }

  const { data } = await sb.from("produtos_precos").select("*").eq("codigo", codigo);
  state.produtos_precos = state.produtos_precos.filter(p => p.codigo !== codigo).concat((data || []).map(precoFromRow));

  btn.disabled = false;
  btn.textContent = labelOriginal;
  await registrarLog("produtos_precos", codigo, "edicao", "Ação automática", `Preços atualizados: ${codigo}`);
  toast("Preços atualizados.");
  document.getElementById("formEditarPrecosCatalogo").style.display = "none";
  document.getElementById("catalogoModalPrecoWrap").style.display = "";
  document.getElementById("btnEditarPrecosCatalogo").style.display = "";
  renderCatalogoModalPrecos(codigo);
  renderCatalogo();
}

async function salvarEdicaoCatalogo(e) {
  e.preventDefault();
  if (!catalogoEditingCodigo) return;
  const payload = {
    medida: document.getElementById("catEditMedida").value.trim(),
    categoria: document.getElementById("catEditCategoria").value.trim(),
    modelo: document.getElementById("catEditModelo").value.trim(),
    ic_iv: document.getElementById("catEditIcIv").value.trim(),
    pr: document.getElementById("catEditPr").value.trim(),
    cintas: document.getElementById("catEditCintas").value.trim(),
    cap_carga: document.getElementById("catEditCapCarga").value.trim(),
    psi: document.getElementById("catEditPsi").value.trim(),
    sulco_mm: document.getElementById("catEditSulco").value.trim(),
    larg_banda_mm: document.getElementById("catEditLargBanda").value.trim(),
    peso_kg: document.getElementById("catEditPeso").value.trim()
  };
  if (!payload.medida) { toast("Informe a medida do produto."); return; }

  const { error } = await sb.from("produtos").update(payload).eq("codigo", catalogoEditingCodigo);
  if (error) { toast("Erro ao salvar especificações: " + error.message); return; }

  const p = getProduto(catalogoEditingCodigo);
  if (p) {
    p.medida = payload.medida; p.categoria = payload.categoria; p.modelo = payload.modelo;
    p.icIv = payload.ic_iv; p.pr = payload.pr; p.cintas = payload.cintas; p.capCarga = payload.cap_carga;
    p.psi = payload.psi; p.sulcoMm = payload.sulco_mm; p.largBandaMm = payload.larg_banda_mm; p.pesoKg = payload.peso_kg;
  }

  await registrarLog("produtos", catalogoEditingCodigo, "edicao", "Ação automática", `Especificações atualizadas: ${catalogoEditingCodigo}`);
  openCatalogoModal(catalogoEditingCodigo);
  renderCatalogo();
  renderProdutos();
  toast("Especificações salvas.");
}

/* ---------------- catálogo: upload de foto ---------------- */

async function uploadFotoCatalogo(codigo, file, slot) {
  if (file.size > 5 * 1024 * 1024) { toast("Imagem muito grande (máx. 5 MB)."); return; }

  const campo = slot === 2 ? "foto_path_2" : "foto_path";
  const propState = slot === 2 ? "fotoPath2" : "fotoPath";
  const p = getProduto(codigo);
  const pathAntigo = p ? p[propState] : null;

  const path = `${codigo}/${slot === 2 ? "2-" : "1-"}${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: uploadError } = await sb.storage.from(CATALOGO_BUCKET).upload(path, file);
  if (uploadError) { toast("Erro ao enviar foto: " + uploadError.message); return; }

  const { error } = await sb.from("produtos").update({ [campo]: path }).eq("codigo", codigo);
  if (error) { toast("Erro ao salvar foto: " + error.message); return; }

  if (p) p[propState] = path;
  if (pathAntigo) await sb.storage.from(CATALOGO_BUCKET).remove([pathAntigo]);

  await registrarLog("produtos", codigo, "edicao", "Ação automática", `Foto ${slot === 2 ? "2" : "1"} atualizada: ${codigo}`);
  openCatalogoModal(codigo);
  renderCatalogo();
  toast("Foto enviada.");
}

async function removerFotoCatalogo(codigo, slot) {
  const campo = slot === 2 ? "foto_path_2" : "foto_path";
  const propState = slot === 2 ? "fotoPath2" : "fotoPath";
  const p = getProduto(codigo);
  if (!p || !p[propState]) return;
  const path = p[propState];

  const { error: removeError } = await sb.storage.from(CATALOGO_BUCKET).remove([path]);
  if (removeError) { toast("Erro ao remover foto: " + removeError.message); return; }

  const { error } = await sb.from("produtos").update({ [campo]: null }).eq("codigo", codigo);
  if (error) { toast("Erro ao salvar: " + error.message); return; }

  p[propState] = null;
  await registrarLog("produtos", codigo, "edicao", "Ação automática", `Foto ${slot === 2 ? "2" : "1"} removida: ${codigo}`);
  openCatalogoModal(codigo);
  renderCatalogo();
  toast("Foto removida.");
}

function initCatalogo() {
  document.getElementById("catSearch").addEventListener("input", renderCatalogo);
  document.getElementById("catFiltroCategoria").addEventListener("change", renderCatalogo);
  document.getElementById("catCondicao").addEventListener("change", renderCatalogo);
  document.getElementById("catTipoCliente").addEventListener("change", renderCatalogo);

  document.getElementById("catalogoFotoLightboxClose").addEventListener("click", closeCatalogoFotoLightbox);
  document.getElementById("catalogoFotoLightboxOverlay").addEventListener("click", (e) => {
    if (e.target.id === "catalogoFotoLightboxOverlay") closeCatalogoFotoLightbox();
  });
  document.getElementById("catalogoFotoLightboxPrev").addEventListener("click", (e) => { e.stopPropagation(); catalogoFotoLightboxPrev(); });
  document.getElementById("catalogoFotoLightboxNext").addEventListener("click", (e) => { e.stopPropagation(); catalogoFotoLightboxNext(); });

  document.getElementById("catalogoModalClose").addEventListener("click", closeCatalogoModal);
  document.getElementById("catalogoModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "catalogoModalOverlay") closeCatalogoModal();
  });

  document.getElementById("btnEditarCatalogo").addEventListener("click", () => {
    document.getElementById("catalogoModalInfo").style.display = "none";
    document.getElementById("formEditarCatalogo").style.display = "";
  });
  document.getElementById("btnCancelarEdicaoCatalogo").addEventListener("click", () => {
    document.getElementById("formEditarCatalogo").style.display = "none";
    document.getElementById("catalogoModalInfo").style.display = "";
  });
  document.getElementById("formEditarCatalogo").addEventListener("submit", salvarEdicaoCatalogo);

  document.getElementById("btnEditarPrecosCatalogo").addEventListener("click", () => {
    const tipoCliente = document.getElementById("catalogoModalTipoCliente").value || "CONSUMO";
    document.getElementById("catalogoModalPrecoEditWrap").innerHTML = buildPrecoMatrixEditHtml(catalogoEditingCodigo, tipoCliente);
    document.getElementById("catalogoModalPrecoWrap").style.display = "none";
    document.getElementById("btnEditarPrecosCatalogo").style.display = "none";
    document.getElementById("formEditarPrecosCatalogo").style.display = "";
  });
  document.getElementById("btnCancelarEdicaoPrecos").addEventListener("click", () => {
    document.getElementById("formEditarPrecosCatalogo").style.display = "none";
    document.getElementById("catalogoModalPrecoWrap").style.display = "";
    document.getElementById("btnEditarPrecosCatalogo").style.display = "";
  });
  document.getElementById("formEditarPrecosCatalogo").addEventListener("submit", salvarPrecosCatalogo);
  document.getElementById("catalogoModalTipoCliente").addEventListener("change", () => {
    if (!catalogoEditingCodigo) return;
    renderCatalogoModalPrecos(catalogoEditingCodigo);
    if (document.getElementById("formEditarPrecosCatalogo").style.display !== "none") {
      const tipoCliente = document.getElementById("catalogoModalTipoCliente").value || "CONSUMO";
      document.getElementById("catalogoModalPrecoEditWrap").innerHTML = buildPrecoMatrixEditHtml(catalogoEditingCodigo, tipoCliente);
    }
  });

  [1, 2].forEach(slot => {
    document.getElementById(`btnCatalogoFoto${slot}`).addEventListener("click", () => {
      document.getElementById(`catalogoFotoInput${slot}`).click();
    });
    document.getElementById(`catalogoFotoInput${slot}`).addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file && catalogoEditingCodigo) await uploadFotoCatalogo(catalogoEditingCodigo, file, slot);
    });
    document.getElementById(`btnCatalogoRemoverFoto${slot}`).addEventListener("click", async () => {
      if (!catalogoEditingCodigo) return;
      const ok = await confirmModal("Remover foto?", "Essa foto do produto será removida do catálogo.");
      if (ok) await removerFotoCatalogo(catalogoEditingCodigo, slot);
    });
  });
}

/* ---------------- render: FRETES ---------------- */

function renderFreteKpis() {
  const totalCotacoes = state.fretes.length;
  const totalTransportadoras = state.fretes.reduce((a, f) => a + (f.cotacoes || []).length, 0);

  const freq = {};
  state.fretes.forEach(f => (f.cotacoes || []).forEach(c => {
    const key = (c.transportadora || "").trim().toUpperCase();
    if (!key) return;
    freq[key] = (freq[key] || 0) + 1;
  }));
  let topCarrier = "—";
  let topCount = 0;
  Object.entries(freq).forEach(([k, v]) => { if (v > topCount) { topCount = v; topCarrier = k; } });

  const contratadas = state.fretes.filter(f => f.contratadaId).length;

  const kpis = [
    { lbl: "Cotações registradas", val: fmt(totalCotacoes) },
    { lbl: "Transportadoras comparadas", val: fmt(totalTransportadoras) },
    { lbl: "Transportadora mais cotada", val: topCarrier, accent: true },
    { lbl: "Fretes já contratados", val: fmt(contratadas) }
  ];
  document.getElementById("freteKpis").innerHTML = kpis.map(k => `
    <div class="kpi ${k.accent ? "accent" : ""}">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}</div>
    </div>
  `).join("");
}

function renderFretes() {
  renderFreteKpis();
  const search = (document.getElementById("freteSearch").value || "").trim().toLowerCase();

  let rows = state.fretes.slice();
  if (search) {
    rows = rows.filter(f => {
      const hay = [f.referencia, f.cep, f.localidade, ...(f.cotacoes || []).map(c => c.transportadora)].join(" ").toLowerCase();
      return hay.includes(search);
    });
  }
  rows.sort((a, b) => (b.data + b.createdAt).localeCompare(a.data + a.createdAt));

  document.getElementById("freteCount").textContent = `${rows.length} de ${state.fretes.length} cotações`;

  const wrap = document.getElementById("freteList");
  const empty = document.getElementById("freteEmpty");

  if (rows.length === 0) {
    wrap.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  wrap.innerHTML = rows.map(f => {
    const cotacoes = (f.cotacoes || []).slice().sort((a, b) => a.valorFrete - b.valorFrete);
    const min = cotacoes.length ? cotacoes[0].valorFrete : null;

    const linhas = cotacoes.map(c => {
      const pct = f.valorNF ? (c.valorFrete / f.valorNF * 100) : null;
      const isMin = c.valorFrete === min;
      const isContratada = c.id === f.contratadaId;
      return `
        <tr class="${isContratada ? "frete-row-contratada" : ""}">
          <td>${escapeHtml(c.transportadora || "—")}${isMin ? '<span class="badge-mini barata">mais barata</span>' : ""}${isContratada ? '<span class="badge-mini contratada">contratada</span>' : ""}</td>
          <td class="num mono">${formatMoney(c.valorFrete)}</td>
          <td class="num mono">${pct !== null ? pct.toFixed(1).replace(".", ",") + "%" : "—"}</td>
          <td>
            <span class="write-ui">
              ${!isContratada
                ? `<button class="btn small outline" data-contratar="${f.id}|${c.id}">Marcar contratada</button>`
                : `<button class="btn small outline" data-desmarcar="${f.id}">Desmarcar</button>`}
              <button class="btn small danger" data-delcotacao="${f.id}|${c.id}">✕</button>
            </span>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="frete-group">
        <div class="frete-group-head">
          <div><span class="mono frete-ref">${escapeHtml(f.referencia)}</span>${f.localidade ? `<span class="muted"> · ${escapeHtml(f.localidade)}</span>` : ""}${f.cep ? `<span class="muted"> · CEP ${escapeHtml(f.cep)}</span>` : ""}</div>
          <div class="frete-group-meta">
            ${f.valorNF ? `<span class="muted">NF: ${formatMoney(f.valorNF)}</span>` : ""}
            <span class="muted">${formatDateBR(f.data)}</span>
            <button class="btn small outline write-ui" data-editgrupo="${f.id}">Editar</button>
            <button class="btn small danger write-ui" data-delgrupo="${f.id}">Excluir cotação</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Transportadora</th><th class="num">Valor do frete</th><th class="num">%</th><th></th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        ${f.obs ? `<div class="muted" style="margin-top:8px;font-size:12px;">${escapeHtml(f.obs)}</div>` : ""}
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-contratar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const [freteId, cotId] = btn.dataset.contratar.split("|");
      const f = state.fretes.find(x => x.id === freteId);
      if (!f) return;
      const { error } = await sb.from("fretes").update({ contratada_id: cotId }).eq("id", freteId);
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      f.contratadaId = cotId;
      const cot = f.cotacoes.find(c => c.id === cotId);
      await registrarLog("fretes", freteId, "edicao", "Ação automática",
        `Transportadora ${cot ? cot.transportadora : cotId} marcada como contratada no frete ${f.referencia}`);
      renderFretes();
      toast("Transportadora marcada como contratada.");
    });
  });

  wrap.querySelectorAll("[data-desmarcar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const f = state.fretes.find(x => x.id === btn.dataset.desmarcar);
      if (!f) return;
      const cotAnterior = f.cotacoes.find(c => c.id === f.contratadaId);
      const { error } = await sb.from("fretes").update({ contratada_id: null }).eq("id", f.id);
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      f.contratadaId = null;
      await registrarLog("fretes", f.id, "edicao", "Ação automática",
        `Transportadora ${cotAnterior ? cotAnterior.transportadora : "—"} desmarcada como contratada no frete ${f.referencia}`);
      renderFretes();
    });
  });

  wrap.querySelectorAll("[data-delcotacao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const [freteId, cotId] = btn.dataset.delcotacao.split("|");
      const motivo = await motivoModal("Remover transportadora?", "Remove só esta cotação de transportadora, mantendo as demais. Informe o motivo.");
      if (!motivo) return;
      const f = state.fretes.find(x => x.id === freteId);
      if (!f) return;
      const cotacaoRemovida = f.cotacoes.find(c => c.id === cotId);
      const novasCotacoes = f.cotacoes.filter(c => c.id !== cotId);
      const novaContratadaId = f.contratadaId === cotId ? null : f.contratadaId;
      const { error } = await sb.from("fretes").update({ cotacoes: novasCotacoes, contratada_id: novaContratadaId }).eq("id", freteId);
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      await registrarLog("fretes", freteId, "exclusao", motivo,
        `Cotação de ${cotacaoRemovida ? cotacaoRemovida.transportadora : cotId} removida do frete ${f.referencia}`);
      f.cotacoes = novasCotacoes;
      f.contratadaId = novaContratadaId;
      renderFretes();
    });
  });

  wrap.querySelectorAll("[data-editgrupo]").forEach(btn => {
    btn.addEventListener("click", () => startEditFrete(btn.dataset.editgrupo));
  });

  wrap.querySelectorAll("[data-delgrupo]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const motivo = await motivoModal("Excluir cotação de frete?", "Remove a referência e todas as transportadoras cotadas para ela. Informe o motivo da exclusão.");
      if (!motivo) return;
      const alvo = state.fretes.find(f => f.id === btn.dataset.delgrupo);
      const { error } = await sb.from("fretes").delete().eq("id", btn.dataset.delgrupo);
      if (error) { toast("Erro ao excluir: " + error.message); return; }
      await registrarLog("fretes", btn.dataset.delgrupo, "exclusao", motivo, alvo ? `Cotação ${alvo.referencia}` : "");
      if (editingFreteId === btn.dataset.delgrupo) cancelEditFrete();
      state.fretes = state.fretes.filter(f => f.id !== btn.dataset.delgrupo);
      renderFretes();
      toast("Cotação de frete excluída.");
    });
  });
}

function startEditFrete(freteId) {
  const f = state.fretes.find(x => x.id === freteId);
  if (!f) return;
  editingFreteId = freteId;
  editingFreteUpdatedAt = f.updatedAt;

  document.getElementById("freteRef").value = f.referencia || "";
  document.getElementById("freteCep").value = f.cep || "";
  document.getElementById("freteLocalidade").value = f.localidade || "";
  document.getElementById("freteValorNF").value = f.valorNF != null ? f.valorNF : "";
  document.getElementById("freteData").value = f.data || todayISO();
  document.getElementById("freteObs").value = f.obs || "";

  const container = document.getElementById("freteItens");
  container.innerHTML = "";
  (f.cotacoes && f.cotacoes.length ? f.cotacoes : [{ transportadora: "", valorFrete: "" }]).forEach(c => {
    const row = createFreteItemRow();
    container.appendChild(row);
    row.querySelector(".frete-transportadora").value = c.transportadora || "";
    row.querySelector(".frete-valor").value = c.valorFrete != null ? c.valorFrete : "";
  });
  updateFreteItemRemoveVisibility();

  document.getElementById("freteFormTitle").textContent = "Editar cotação";
  document.getElementById("freteEditBanner").style.display = "block";
  document.getElementById("btnSubmitFrete").textContent = "Salvar alterações";
  document.getElementById("formFrete").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditFrete() {
  editingFreteId = null;
  editingFreteUpdatedAt = null;
  document.getElementById("formFrete").reset();
  document.getElementById("freteData").value = todayISO();
  resetFreteItens();
  document.getElementById("freteFormTitle").textContent = "Nova cotação";
  document.getElementById("freteEditBanner").style.display = "none";
  document.getElementById("btnSubmitFrete").textContent = "Registrar cotação";
}

/* ---------------- fretes: linhas de transportadora (item rows) ---------------- */

function createFreteItemRow() {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" class="item-text frete-transportadora" placeholder="Transportadora">
    <input type="number" class="item-valor frete-valor" min="0" step="0.01" placeholder="Valor frete">
    <button type="button" class="btn small danger item-remove" title="Remover transportadora">✕</button>
  `;
  row.querySelector(".item-remove").addEventListener("click", () => {
    const container = document.getElementById("freteItens");
    if (container.children.length > 1) {
      row.remove();
      updateFreteItemRemoveVisibility();
    }
  });
  return row;
}

function updateFreteItemRemoveVisibility() {
  const rows = document.querySelectorAll("#freteItens .item-row");
  rows.forEach(r => {
    r.querySelector(".item-remove").style.visibility = rows.length > 1 ? "visible" : "hidden";
  });
}

function resetFreteItens() {
  const container = document.getElementById("freteItens");
  container.innerHTML = "";
  container.appendChild(createFreteItemRow());
  container.appendChild(createFreteItemRow());
  updateFreteItemRemoveVisibility();
}

/* ---------------- render: ENTREGAS (KANBAN) ---------------- */

const ETAPAS_PEDIDO = [
  "PRE_VENDA", "ENTRADA", "AUTORIZACAO_GERENCIA", "ANALISE_CREDITO", "AGUARDANDO_PAGAMENTO", "VALIDACAO_TRANSPORTE",
  "FATURAMENTO", "SEPARACAO", "AGUARDANDO_COLETA", "COLETA", "RASTREIO", "FINALIZADOS"
];
let editingPedidoId = null;
let editingPedidoUpdatedAt = null;
let editingPedidoCteStatus = "aguardando";

function pedidoCamposFaltando(p) {
  const faltando = [];
  if (!p.numeroNF) faltando.push("Nº NF");
  if (!p.numeroPedido) faltando.push("Nº do pedido");
  if (!p.data) faltando.push("Data do pedido");
  if (!p.cliente) faltando.push("Cliente");
  if (!p.vendedor) faltando.push("Vendedor");
  if (!p.destino) faltando.push("Destino");
  if (!p.transportadora) faltando.push("Transportadora");
  if (!p.itens || p.itens.length === 0) faltando.push("Medidas do pedido");
  if (!p.dataPrevista) faltando.push("Previsão de entrega");
  if (!p.dataEntrega) faltando.push("Data de entrega");
  return faltando;
}

function renderEntregas() {
  const search = (document.getElementById("entregaSearch").value || "").trim().toLowerCase();
  let rows = state.entregas.filter(e => e.reservaStatus !== "pendente" && e.reservaStatus !== "estornada" && !e.cancelado);
  if (search) {
    rows = rows.filter(e => [e.numeroNF, e.numeroPedido, e.cliente, e.transportadora].join(" ").toLowerCase().includes(search));
  }

  document.getElementById("entregaEmpty").style.display = state.entregas.length === 0 ? "block" : "none";

  ETAPAS_PEDIDO.forEach(etapa => {
    const col = document.getElementById("col" + etapa);
    const itens = rows.filter(e => e.etapa === etapa);
    document.getElementById("count" + etapa).textContent = itens.length;
    col.innerHTML = itens.map(e => {
      const temValores = (e.itens || []).some(it => it.valorUnitario != null);
      const totalPedido = temValores ? (e.itens || []).reduce((a, it) => a + (it.valorTotal || 0), 0) : 0;
      const itensHtml = (e.itens || []).map(it => {
        const prod = getProduto(it.codigo);
        return `
          <li>
            <span class="mono">${escapeHtml(it.codigo)}</span>
            <span class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span>
            <span class="num mono">${fmt(it.quantidade)}</span>
            ${it.valorUnitario != null ? `
              <div class="kanban-item-valores">
                ${formatMoney(it.valorUnitario)}${it.desconto ? ` (-${it.desconto}%)` : ""} = <b>${formatMoney(it.valorTotal)}</b>
              </div>
            ` : ""}
          </li>
        `;
      }).join("");
      return `
        <div class="kanban-card" data-id="${e.id}">
          <div class="kanban-card-nf">${escapeHtml(e.numeroNF || e.numeroPedido || "Sem NF")}</div>
          <div class="kanban-card-cliente">${escapeHtml(e.cliente || "(sem cliente)")}</div>
          ${e.itens && e.itens.length ? `<ul class="kanban-card-itens-list">${itensHtml}</ul>` : ""}
          ${temValores ? `<div class="kanban-card-total">Total: <b>${formatMoney(totalPedido)}</b></div>` : ""}
          ${e.destino ? `<div class="kanban-card-endereco">📍 ${escapeHtml(e.destino)}</div>` : ""}
          <div class="kanban-card-meta">
            ${e.reserva ? `<span class="kanban-card-tag reserva">RESERVA</span>` : ""}
            ${e.origem === "representante" ? `<span class="kanban-card-tag representante">Pedido do representante</span>` : ""}
            ${(e.tabelaPrecoRegiao || e.tabelaPrecoTipoCliente || e.tabelaPrecoCondicao) ? `<span class="kanban-card-tag">${escapeHtml([e.tabelaPrecoRegiao, TIPO_CLIENTE_LABEL[e.tabelaPrecoTipoCliente] || null, e.tabelaPrecoCondicao].filter(Boolean).join(" · "))}</span>` : ""}
            ${e.transportadora ? `<span class="kanban-card-tag">${escapeHtml(e.transportadora)}</span>` : ""}
            ${e.formaPagamento ? `<span class="kanban-card-tag">${escapeHtml(e.formaPagamento)}</span>` : ""}
            ${e.dataPrevista ? `<span class="kanban-card-tag">Prev. ${formatDateBR(e.dataPrevista)}</span>` : ""}
            ${e.dataEntrega ? `<span class="kanban-card-tag entregue">Entregue ${formatDateBR(e.dataEntrega)}</span>` : ""}
            ${e.anexos && e.anexos.length ? `<span class="kanban-card-tag">${e.anexos.length} anexo${e.anexos.length > 1 ? "s" : ""}</span>` : ""}
            <span class="kanban-card-tag cte ${(e.cteStatus || "aguardando").replace("_", "-")}">${CTE_STATUS_LABEL[e.cteStatus] || CTE_STATUS_LABEL.aguardando}</span>
          </div>
        </div>
      `;
    }).join("");
  });

  document.querySelectorAll(".kanban-card").forEach(card => {
    card.addEventListener("click", () => openPedidoModal(card.dataset.id));
  });
}

function podeTirarDeAutorizacaoGerencia() {
  return currentUserIsAdmin || currentUserPodeAutorizarGerencia;
}

// Cobre dois casos: (1) tirar o pedido de "Autorização de Gerência" pra qualquer outra etapa,
// e (2) pular a etapa inteira -- ir direto de antes dela (Pré-venda/Entrada) pra depois
// (Análise de Crédito em diante) sem passar por ela.
function movimentoExigeAutorizacaoGerencia(etapaOrigem, etapaDestino) {
  if (etapaOrigem === etapaDestino) return false;
  if (etapaOrigem === "AUTORIZACAO_GERENCIA") return true;
  const idxAG = ETAPAS_PEDIDO.indexOf("AUTORIZACAO_GERENCIA");
  const idxOrigem = ETAPAS_PEDIDO.indexOf(etapaOrigem);
  const idxDestino = ETAPAS_PEDIDO.indexOf(etapaDestino);
  if (idxAG === -1 || idxOrigem === -1 || idxDestino === -1) return false;
  return idxOrigem < idxAG && idxDestino > idxAG;
}

function initKanbanDrag() {
  ETAPAS_PEDIDO.forEach(etapa => {
    const col = document.getElementById("col" + etapa);
    Sortable.create(col, {
      group: "kanban",
      animation: 150,
      disabled: currentUserRole === "viewer",
      onEnd: async (evt) => {
        const id = evt.item.dataset.id;
        const novaEtapa = evt.to.dataset.etapa;
        const antigaEtapa = evt.from.dataset.etapa;
        if (novaEtapa === antigaEtapa) return;
        const alvo = state.entregas.find(x => x.id === id);
        if (!alvo) return;
        if (movimentoExigeAutorizacaoGerencia(antigaEtapa, novaEtapa) && !podeTirarDeAutorizacaoGerencia()) {
          toast("Só um usuário autorizado pode mover esse pedido pra depois de Autorização de Gerência.");
          renderEntregas();
          return;
        }
        if (novaEtapa === "FINALIZADOS") {
          const faltando = pedidoCamposFaltando(alvo);
          if (faltando.length > 0) {
            toast(`Preencha antes de finalizar (abra o card): ${faltando.join(", ")}.`);
            renderEntregas();
            return;
          }
        }
        const identificacao = alvo.numeroNF || alvo.numeroPedido || "—";
        const ok = await confirmModal(
          "Mudar etapa do pedido?",
          `Tem certeza que deseja mudar o pedido ${identificacao} para "${ETAPA_LABEL[novaEtapa] || novaEtapa}"?`
        );
        if (!ok) { renderEntregas(); return; }

        const etapaAnterior = alvo.etapa;
        alvo.etapa = novaEtapa;
        const { error } = await sb.from("entregas").update({ etapa: novaEtapa }).eq("id", id);
        if (error) {
          alvo.etapa = etapaAnterior;
          toast("Erro ao mover pedido: " + error.message);
          renderEntregas();
          return;
        }
        await registrarLog("entregas", id, "edicao", "Ação automática",
          `Pedido ${alvo.numeroNF || alvo.numeroPedido || "—"} movido de ${ETAPA_LABEL[etapaAnterior] || etapaAnterior} para ${ETAPA_LABEL[novaEtapa] || novaEtapa}`);
        renderEntregas();
      }
    });
  });
}

function renderCteToggle() {
  const btn = document.getElementById("pedCteToggle");
  btn.dataset.cteStatus = editingPedidoCteStatus;
  btn.textContent = CTE_STATUS_LABEL[editingPedidoCteStatus] || CTE_STATUS_LABEL.aguardando;
  btn.classList.remove("recebido", "cliente-retira");
  if (editingPedidoCteStatus === "recebido") btn.classList.add("recebido");
  if (editingPedidoCteStatus === "cliente_retira") btn.classList.add("cliente-retira");
}

function openPedidoModal(id) {
  editingPedidoId = id || null;

  if (id) {
    const e = state.entregas.find(x => x.id === id);
    if (!e) return;
    editingPedidoUpdatedAt = e.updatedAt;
    document.getElementById("pedidoModalTitle").textContent = "Editar pedido";
    document.getElementById("pedNF").value = e.numeroNF || "";
    document.getElementById("pedNumero").value = e.numeroPedido || "";
    document.getElementById("pedData").value = e.data || "";
    document.getElementById("pedCliente").value = e.cliente || "";
    document.getElementById("pedVendedor").value = e.vendedor || "";
    document.getElementById("pedDestino").value = e.destino || "";
    document.getElementById("pedTransportadora").value = e.transportadora || "";
    document.getElementById("pedEtapa").value = e.etapa;
    document.getElementById("pedDataPrevista").value = e.dataPrevista || "";
    document.getElementById("pedDataEntrega").value = e.dataEntrega || "";
    editingPedidoCteStatus = e.cteStatus || "aguardando";
    renderCteToggle();
    document.getElementById("pedObs").value = e.obs || "";

    const container = document.getElementById("pedItens");
    container.innerHTML = "";
    (e.itens || []).forEach(it => {
      const row = createItemRow("pedItens", true);
      container.appendChild(row);
      if (it.codigo) row.querySelector(".item-produto").value = it.codigo;
      if (it.quantidade) row.querySelector(".item-qtd").value = it.quantidade;
      if (it.processo) row.querySelector(".item-processo").value = it.processo;
      if (it.valorUnitario != null) {
        const valores = document.createElement("div");
        valores.className = "ped-item-valores";
        valores.textContent = `${formatMoney(it.valorUnitario)}${it.desconto ? ` (-${it.desconto}%)` : ""} = ${formatMoney(it.valorTotal)}`;
        row.appendChild(valores);
      }
    });
    updateItemRemoveVisibility("pedItens");

    const totalEl = document.getElementById("pedItensTotal");
    const temValores = (e.itens || []).some(it => it.valorUnitario != null);
    if (temValores) {
      const total = (e.itens || []).reduce((a, it) => a + (it.valorTotal || 0), 0);
      totalEl.textContent = `Total do pedido: ${formatMoney(total)}`;
      totalEl.style.display = "block";
    } else {
      totalEl.style.display = "none";
    }

    document.getElementById("pedFormaPagamento").value = e.formaPagamento || "";
    document.getElementById("pedCondicaoPagamento").value = e.condicaoPagamento || "";
    document.getElementById("pedPrazoPagamento").value = e.prazoPagamento || "";

    document.getElementById("btnExcluirPedido").style.display = e.etapa === "PRE_VENDA" ? "inline-block" : "none";
    document.getElementById("btnCancelarPedido").style.display = (e.etapa !== "PRE_VENDA" && !e.cancelado) ? "inline-block" : "none";
  } else {
    editingPedidoUpdatedAt = null;
    document.getElementById("pedidoModalTitle").textContent = "Novo pedido";
    document.getElementById("formPedido").reset();
    document.getElementById("pedData").value = todayISO();
    document.getElementById("pedEtapa").value = "ENTRADA";
    document.getElementById("pedItens").innerHTML = "";
    document.getElementById("pedItensTotal").style.display = "none";
    document.getElementById("pedFormaPagamentoBox").style.display = "none";
    editingPedidoCteStatus = "aguardando";
    renderCteToggle();
    document.getElementById("btnExcluirPedido").style.display = "none";
    document.getElementById("btnCancelarPedido").style.display = "none";
  }

  renderAnexosPedido();
  document.getElementById("pedidoModalOverlay").classList.add("show");
}

function closePedidoModal() {
  document.getElementById("pedidoModalOverlay").classList.remove("show");
  editingPedidoId = null;
  editingPedidoUpdatedAt = null;
}

/* ---------------- anexos do pedido (Entregas) ---------------- */

const ANEXOS_BUCKET = "entregas-anexos";

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function renderAnexosPedido() {
  const hint = document.getElementById("pedAnexosHint");
  const btn = document.getElementById("btnAnexarArquivo");
  const list = document.getElementById("pedAnexosList");

  if (!editingPedidoId) {
    hint.style.display = "block";
    btn.style.display = "none";
    list.innerHTML = "";
    return;
  }
  hint.style.display = "none";
  btn.style.display = "";

  const alvo = state.entregas.find(x => x.id === editingPedidoId);
  const anexos = (alvo && alvo.anexos) || [];
  if (anexos.length === 0) {
    list.innerHTML = `<div class="muted" style="font-size:12px;">Nenhum arquivo anexado ainda.</div>`;
    return;
  }
  list.innerHTML = anexos.map(a => `
    <div class="anexo-row">
      <span class="anexo-nome" data-abriranexo="${escapeAttr(a.path)}">${escapeHtml(a.nome)}</span>
      <span class="anexo-tamanho">${formatFileSize(a.tamanho)}</span>
      <button type="button" class="btn small danger write-ui" data-removeranexo="${escapeAttr(a.path)}">✕</button>
    </div>
  `).join("");
  list.querySelectorAll("[data-abriranexo]").forEach(el => {
    el.addEventListener("click", () => abrirAnexoPedido(el.dataset.abriranexo));
  });
  list.querySelectorAll("[data-removeranexo]").forEach(btn2 => {
    btn2.addEventListener("click", () => removerAnexoPedido(btn2.dataset.removeranexo));
  });
}

function sanitizarNomeArquivo(nome) {
  const semAcentos = nome.normalize("NFKD").split("").filter(ch => ch.charCodeAt(0) < 128).join("");
  return semAcentos.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadAnexoPedido(file) {
  if (!editingPedidoId) { toast("Salve o pedido antes de anexar arquivos."); return; }
  if (file.size > 10 * 1024 * 1024) { toast("Arquivo muito grande (máx. 10 MB)."); return; }

  const path = `${editingPedidoId}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: uploadError } = await sb.storage.from(ANEXOS_BUCKET).upload(path, file);
  if (uploadError) { toast("Erro ao enviar arquivo: " + uploadError.message); return; }

  const alvo = state.entregas.find(x => x.id === editingPedidoId);
  const novosAnexos = [...((alvo && alvo.anexos) || []), {
    nome: file.name, path, tamanho: file.size,
    criadoEm: new Date().toISOString(), criadoPor: currentUser ? currentUser.email : null
  }];
  const { error } = await sb.from("entregas").update({ anexos: novosAnexos }).eq("id", editingPedidoId);
  if (error) { toast("Erro ao salvar anexo: " + error.message); return; }
  if (alvo) alvo.anexos = novosAnexos;

  await registrarLog("entregas", editingPedidoId, "edicao", "Ação automática",
    `Arquivo anexado ao pedido ${alvo ? (alvo.numeroNF || alvo.numeroPedido || "—") : editingPedidoId}: ${file.name}`);
  renderAnexosPedido();
  renderEntregas();
  toast("Arquivo anexado.");
}

async function removerAnexoPedido(path) {
  const alvo = state.entregas.find(x => x.id === editingPedidoId);
  if (!alvo) return;
  const anexo = (alvo.anexos || []).find(a => a.path === path);
  const motivo = await motivoModal("Remover anexo?", "Informe o motivo da remoção do arquivo.");
  if (!motivo) return;

  const { error: removeError } = await sb.storage.from(ANEXOS_BUCKET).remove([path]);
  if (removeError) { toast("Erro ao remover arquivo: " + removeError.message); return; }

  const novosAnexos = (alvo.anexos || []).filter(a => a.path !== path);
  const { error } = await sb.from("entregas").update({ anexos: novosAnexos }).eq("id", editingPedidoId);
  if (error) { toast("Erro ao salvar: " + error.message); return; }
  alvo.anexos = novosAnexos;

  await registrarLog("entregas", editingPedidoId, "exclusao", motivo,
    `Anexo removido do pedido ${alvo.numeroNF || alvo.numeroPedido || "—"}: ${anexo ? anexo.nome : path}`);
  renderAnexosPedido();
  renderEntregas();
  toast("Anexo removido.");
}

async function abrirAnexoPedido(path) {
  const { data, error } = await sb.storage.from(ANEXOS_BUCKET).createSignedUrl(path, 60);
  if (error) { toast("Erro ao abrir arquivo: " + error.message); return; }
  window.open(data.signedUrl, "_blank");
}

function initKanbanBoardDragScroll() {
  const board = document.getElementById("kanbanBoard");
  let arrastando = false;
  let startX = 0;
  let scrollStart = 0;

  board.addEventListener("mousedown", (e) => {
    if (e.target.closest(".kanban-card")) return;
    arrastando = true;
    board.classList.add("dragging-scroll");
    startX = e.pageX;
    scrollStart = board.scrollLeft;
  });
  window.addEventListener("mouseup", () => {
    arrastando = false;
    board.classList.remove("dragging-scroll");
  });
  window.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    board.scrollLeft = scrollStart - (e.pageX - startX);
  });
}

function initEntregas() {
  document.getElementById("entregaSearch").addEventListener("input", renderEntregas);
  document.getElementById("btnNovoPedido").addEventListener("click", () => openPedidoModal(null));
  document.getElementById("pedidoModalCancel").addEventListener("click", closePedidoModal);
  document.getElementById("pedidoModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "pedidoModalOverlay") closePedidoModal();
  });
  document.getElementById("btnAddItemPedido").addEventListener("click", () => {
    document.getElementById("pedItens").appendChild(createItemRow("pedItens", true));
    updateItemRemoveVisibility("pedItens");
  });

  document.getElementById("btnAnexarArquivo").addEventListener("click", () => {
    document.getElementById("pedAnexoInput").click();
  });
  document.getElementById("pedAnexoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await uploadAnexoPedido(file);
  });

  document.getElementById("pedCteToggle").addEventListener("click", async () => {
    const idxAtual = CTE_STATUS_ORDEM.indexOf(editingPedidoCteStatus);
    const novoValor = CTE_STATUS_ORDEM[(idxAtual + 1) % CTE_STATUS_ORDEM.length];
    const valorAnterior = editingPedidoCteStatus;
    editingPedidoCteStatus = novoValor;
    renderCteToggle();

    if (editingPedidoId) {
      const alvo = state.entregas.find(x => x.id === editingPedidoId);
      const { error } = await sb.from("entregas").update({ cte_status: novoValor }).eq("id", editingPedidoId);
      if (error) {
        editingPedidoCteStatus = valorAnterior;
        renderCteToggle();
        toast("Erro ao salvar: " + error.message);
        return;
      }
      if (alvo) alvo.cteStatus = novoValor;
      await registrarLog("entregas", editingPedidoId, "edicao", "Ação automática",
        `CTE do pedido ${alvo ? (alvo.numeroNF || alvo.numeroPedido || "—") : editingPedidoId} marcado como ${CTE_STATUS_LABEL[novoValor]}`);
      renderEntregas();
    }
  });

  document.getElementById("btnExcluirPedido").addEventListener("click", async () => {
    if (!editingPedidoId) return;
    const motivo = await motivoModal("Excluir pedido?", "Essa ação não pode ser desfeita. Informe o motivo da exclusão.");
    if (!motivo) return;
    const alvo = state.entregas.find(x => x.id === editingPedidoId);
    const { error } = await sb.from("entregas").delete().eq("id", editingPedidoId);
    if (error) { toast("Erro ao excluir: " + error.message); return; }
    await registrarLog("entregas", editingPedidoId, "exclusao", motivo, alvo ? `Pedido NF ${alvo.numeroNF || alvo.numeroPedido || "—"} · ${alvo.cliente || "—"}` : "");
    state.entregas = state.entregas.filter(x => x.id !== editingPedidoId);
    closePedidoModal();
    renderEntregas();
    toast("Pedido excluído.");
  });

  document.getElementById("btnCancelarPedido").addEventListener("click", async () => {
    if (!editingPedidoId) return;
    const alvo = state.entregas.find(x => x.id === editingPedidoId);
    const motivo = await motivoModal(
      "Cancelar pedido?",
      "O pedido sai do quadro Kanban mas fica salvo para consulta. Se o estoque já tinha sido baixado, ele será estornado automaticamente. Informe o motivo do cancelamento."
    );
    if (!motivo) return;
    const { error } = await sb.from("entregas").update({
      cancelado: true, cancelado_motivo: motivo,
      cancelado_em: new Date().toISOString(),
      cancelado_por: currentUser ? currentUser.id : null
    }).eq("id", editingPedidoId);
    if (error) { toast("Erro ao cancelar: " + error.message); return; }
    if (alvo) { alvo.cancelado = true; alvo.canceladoMotivo = motivo; }
    await registrarLog("entregas", editingPedidoId, "edicao", motivo,
      `Pedido cancelado: ${alvo ? (alvo.numeroNF || alvo.numeroPedido || "—") : editingPedidoId}${alvo && alvo.cliente ? " · " + alvo.cliente : ""}`);
    closePedidoModal();
    renderEntregas();
    toast("Pedido cancelado.");
  });

  document.getElementById("formPedido").addEventListener("submit", async (e) => {
    e.preventDefault();

    const rows = Array.from(document.querySelectorAll("#pedItens .item-row"));
    const itens = [];
    for (const row of rows) {
      const codigo = row.querySelector(".item-produto").value;
      const quantidadeRaw = row.querySelector(".item-qtd").value;
      const processoItem = row.querySelector(".item-processo").value.trim();
      if (!codigo && !quantidadeRaw) continue;
      if (!codigo || !quantidadeRaw || parseInt(quantidadeRaw, 10) <= 0) { toast("Preencha produto e quantidade em todas as medidas adicionadas."); return; }
      itens.push({ codigo, quantidade: parseInt(quantidadeRaw, 10), processo: processoItem || null });
    }

    const dados = {
      numeroNF: document.getElementById("pedNF").value.trim(),
      numeroPedido: document.getElementById("pedNumero").value.trim(),
      data: document.getElementById("pedData").value || null,
      cliente: document.getElementById("pedCliente").value.trim(),
      vendedor: document.getElementById("pedVendedor").value.trim(),
      destino: document.getElementById("pedDestino").value.trim(),
      transportadora: document.getElementById("pedTransportadora").value.trim(),
      itens,
      etapa: document.getElementById("pedEtapa").value,
      dataPrevista: document.getElementById("pedDataPrevista").value || null,
      dataEntrega: document.getElementById("pedDataEntrega").value || null,
      cteStatus: editingPedidoCteStatus,
      obs: document.getElementById("pedObs").value.trim(),
      formaPagamento: document.getElementById("pedFormaPagamento").value.trim(),
      condicaoPagamento: document.getElementById("pedCondicaoPagamento").value.trim(),
      prazoPagamento: document.getElementById("pedPrazoPagamento").value.trim()
    };

    if (dados.etapa === "FINALIZADOS") {
      const faltando = pedidoCamposFaltando(dados);
      if (faltando.length > 0) {
        toast(`Preencha antes de finalizar: ${faltando.join(", ")}.`);
        return;
      }
    }

    if (editingPedidoId) {
      const alvo = state.entregas.find(x => x.id === editingPedidoId);
      if (alvo && movimentoExigeAutorizacaoGerencia(alvo.etapa, dados.etapa) && !podeTirarDeAutorizacaoGerencia()) {
        toast("Só um usuário autorizado pode mover esse pedido pra depois de Autorização de Gerência.");
        return;
      }
      // Mescla com o registro original antes de montar a linha: o formulário não edita todos
      // os campos (reserva, origem, tabela de preço, dados do representante etc.), então usar só
      // "dados" aqui apagava esses campos silenciosamente a cada edição comum (bug real, achado
      // em revisão — ver commit).
      const { conflict, error, row } = await updateWithConflictCheck(
        "entregas", editingPedidoId, editingPedidoUpdatedAt, entregaToRow({ ...(alvo || {}), ...dados, id: editingPedidoId })
      );
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        closePedidoModal();
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      if (alvo) Object.assign(alvo, entregaFromRow(row));
      closePedidoModal();
      renderEntregas();
      toast("Pedido atualizado.");
      return;
    }

    const novo = { id: uid("ped"), ...dados };
    const { data: inserido, error } = await sb.from("entregas").insert({ ...entregaToRow(novo), created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao registrar pedido: " + error.message); return; }
    state.entregas.push(entregaFromRow(inserido[0]));
    closePedidoModal();
    renderEntregas();
    toast("Pedido registrado.");
  });

  initKanbanDrag();
  initKanbanBoardDragScroll();
}

function initCollapsibleCards() {
  document.querySelectorAll(".card-collapsible .card-head").forEach(head => {
    head.addEventListener("click", () => {
      head.closest(".card-collapsible").classList.toggle("collapsed");
    });
  });
}

const NAV_GRUPOS_KEY = "torun_nav_grupos_recolhidos_v1";
function initNavGroups() {
  let recolhidos = [];
  try { recolhidos = JSON.parse(localStorage.getItem(NAV_GRUPOS_KEY)) || []; } catch (e) { recolhidos = []; }
  document.querySelectorAll(".nav-group").forEach(grupo => {
    if (recolhidos.includes(grupo.dataset.group)) grupo.classList.add("collapsed");
  });
  document.querySelectorAll(".nav-label").forEach(label => {
    label.addEventListener("click", () => {
      const grupo = label.closest(".nav-group");
      grupo.classList.toggle("collapsed");
      let atuais = [];
      try { atuais = JSON.parse(localStorage.getItem(NAV_GRUPOS_KEY)) || []; } catch (e) { atuais = []; }
      if (grupo.classList.contains("collapsed")) {
        if (!atuais.includes(grupo.dataset.group)) atuais.push(grupo.dataset.group);
      } else {
        atuais = atuais.filter(g => g !== grupo.dataset.group);
      }
      localStorage.setItem(NAV_GRUPOS_KEY, JSON.stringify(atuais));
    });
  });
}

function initKanbanColumnsCollapse() {
  document.querySelectorAll(".kanban-col").forEach(col => {
    if (currentUserKanbanColapsadas.includes(col.dataset.etapa)) {
      col.classList.add("collapsed");
    }
  });
  document.querySelectorAll(".kanban-col-head").forEach(head => {
    head.addEventListener("click", async () => {
      const col = head.closest(".kanban-col");
      const etapa = col.dataset.etapa;
      col.classList.toggle("collapsed");
      const agoraColapsada = col.classList.contains("collapsed");
      currentUserKanbanColapsadas = agoraColapsada
        ? [...currentUserKanbanColapsadas.filter(e => e !== etapa), etapa]
        : currentUserKanbanColapsadas.filter(e => e !== etapa);
      const { error } = await sb.from("user_preferences")
        .upsert({ user_id: currentUser.id, kanban_colunas_recolhidas: currentUserKanbanColapsadas }, { onConflict: "user_id" });
      if (error) console.error("Erro ao salvar preferência de colunas recolhidas:", error);
    });
  });
}

/* ---------------- render: FATURAMENTO / CLIENTES ---------------- */

function getCliente(nome) {
  return state.clientes.find(c => c.nome === nome);
}

function populateEstadoSelect() {
  const opts = UF_LIST.map(uf => `<option value="${uf}">${uf}</option>`).join("");
  document.getElementById("cliEstado").innerHTML = opts;
  document.getElementById("clienteEditEstado").innerHTML = opts;
}

function populateTipoClienteSelects() {
  const opts = `<option value="">Selecione…</option>` + TIPO_CLIENTE_OPCOES.map(t => `<option value="${t}">${escapeHtml(TIPO_CLIENTE_LABEL[t])}</option>`).join("");
  document.getElementById("cliTipoCliente").innerHTML = opts;
  document.getElementById("clienteEditTipoCliente").innerHTML = opts;
}

function renderClienteSelect() {
  const opts = state.clientes
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(c => `<option value="${escapeAttr(c.nome)}">`)
    .join("");
  document.getElementById("listCliente").innerHTML = opts;
}

function renderFaturamentoDatalists() {
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  document.getElementById("listVendedor").innerHTML =
    uniq(state.vendas.map(v => v.vendedor)).sort().map(v => `<option value="${escapeAttr(v)}">`).join("");
  document.getElementById("listTransportadora").innerHTML =
    uniq(state.vendas.map(v => v.transportadora)).filter(v => v !== "Cliente retira").sort().map(v => `<option value="${escapeAttr(v)}">`).join("");
}

function populateMesFiltro(selectId) {
  const sel = document.getElementById(selectId);
  const prev = sel.value;
  const chaves = Array.from(new Set(state.vendas.map(v => (v.data || "").slice(0, 7)).filter(k => k.length === 7))).sort().reverse();
  const opts = ['<option value="todos">Todos os meses</option>'].concat(
    chaves.map(chave => {
      const [ano, mes] = chave.split("-");
      return `<option value="${chave}">${MES_ABREV[mes] || mes} de ${ano}</option>`;
    })
  );
  sel.innerHTML = opts.join("");
  if (prev && (prev === "todos" || chaves.includes(prev))) {
    sel.value = prev;
  } else if (chaves.length > 0) {
    sel.value = chaves[0];
  } else {
    sel.value = "todos";
  }
}

function getVendasFiltradasPor(selectId) {
  const mes = document.getElementById(selectId).value;
  if (!mes || mes === "todos") return state.vendas.slice();
  return state.vendas.filter(v => (v.data || "").slice(0, 7) === mes);
}

function getVendasFiltradas() {
  return getVendasFiltradasPor("fatMesFiltro");
}

function getMovimentosVendaFiltradosPor(selectId) {
  const mes = document.getElementById(selectId).value;
  const vendas = state.movimentos.filter(m => {
    if (m.tipo !== "venda") return false;
    // Venda automática de um pedido que foi cancelado depois: o estorno lança uma
    // entrada nova (pra manter histórico), não apaga a venda original -- então
    // sem essa checagem ela continuaria contando aqui mesmo revertida.
    if (m.entregaId) {
      const pedido = state.entregas.find(e => e.id === m.entregaId);
      if (pedido && pedido.cancelado) return false;
    }
    return true;
  });
  if (!mes || mes === "todos") return vendas;
  return vendas.filter(m => (m.data || "").slice(0, 7) === mes);
}

/* ---------------- render: DASHBOARD (gráficos) ---------------- */

const dashCharts = {};
const dashChartSpecs = {};
let dashModalChart = null;

const DASH_CARD_DEFS = [
  { key: "pneusEstado", label: "Volume de Pneus Vendidos por Estado" },
  { key: "pneusMaisVendidos", label: "Pneus Mais Vendidos (por Medida)" },
  { key: "faturamentoRepresentante", label: "Faturamento por Representante" },
  { key: "nfTransportadora", label: "Quantidade de NFs por Transportadora" },
  { key: "freteTransportadora", label: "Gastos com Frete por Transportadora" },
  { key: "indicadores", label: "Indicadores Gerais" },
  { key: "fretePercEstado", label: "Percentual Médio de Frete por Estado" },
  { key: "faturamentoEstado", label: "Faturamento por Estado" },
  { key: "faturamentoCliente", label: "Faturamento por Cliente" },
  { key: "top5Clientes", label: "Top 5 Clientes" },
  { key: "comissaoRepresentante", label: "Comissão por Representante" },
  { key: "formaPagamento", label: "Distribuição das Formas de Pagamento" }
];
const DASH_VISIBILITY_KEY = "torun_dash_visibilidade_v1";

function loadDashVisibility() {
  try {
    return JSON.parse(localStorage.getItem(DASH_VISIBILITY_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function isDashCardVisible(key, vis) {
  return vis[key] !== false;
}

function applyDashVisibility() {
  const vis = loadDashVisibility();
  DASH_CARD_DEFS.forEach(({ key }) => {
    const el = document.querySelector(`[data-dashcard="${key}"]`);
    if (el) el.style.display = isDashCardVisible(key, vis) ? "" : "none";
  });
}

function renderDashFiltroLista() {
  const vis = loadDashVisibility();
  document.getElementById("dashFiltroLista").innerHTML = DASH_CARD_DEFS.map(({ key, label }) => `
    <label class="dash-filter-item">
      <input type="checkbox" data-dashvis="${key}" ${isDashCardVisible(key, vis) ? "checked" : ""}>
      ${escapeHtml(label)}
    </label>
  `).join("");
}

function initDashFiltro() {
  renderDashFiltroLista();
  const panel = document.getElementById("dashFiltroPanel");

  document.getElementById("btnDashFiltro").addEventListener("click", (e) => {
    e.stopPropagation();
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dash-filter-wrap")) panel.style.display = "none";
  });

  document.getElementById("dashFiltroLista").addEventListener("change", (e) => {
    if (!e.target.matches("[data-dashvis]")) return;
    const vis = loadDashVisibility();
    vis[e.target.dataset.dashvis] = e.target.checked;
    localStorage.setItem(DASH_VISIBILITY_KEY, JSON.stringify(vis));
    renderDashboard();
  });

  document.getElementById("dashFiltroTodos").addEventListener("click", () => {
    const vis = {};
    DASH_CARD_DEFS.forEach(({ key }) => { vis[key] = true; });
    localStorage.setItem(DASH_VISIBILITY_KEY, JSON.stringify(vis));
    renderDashFiltroLista();
    renderDashboard();
  });
  document.getElementById("dashFiltroNenhum").addEventListener("click", () => {
    const vis = {};
    DASH_CARD_DEFS.forEach(({ key }) => { vis[key] = false; });
    localStorage.setItem(DASH_VISIBILITY_KEY, JSON.stringify(vis));
    renderDashFiltroLista();
    renderDashboard();
  });
}
const DASH_COLORS = {
  bar: "#FF6A13",
  grid: "rgba(255,255,255,.08)",
  text: "rgba(255,255,255,.75)",
  textStrong: "#FFFFFF",
  cardBg: "#000000"
};
// paleta categórica validada (CVD-safe, ordem fixa) para gráficos donut — nunca ciclar
const DASH_CATEGORICAL = ["#EA580C", "#2563EB", "#059669", "#B45309", "#DB2777", "#7C3AED", "#DC2626", "#0D9488"];
let DASH_OUTROS_COLOR = "rgba(255,255,255,.25)";

// .dash-card deixou de ser sempre preto (agora segue o tema) -- essas cores do Chart.js
// precisam acompanhar, senão texto/grade do gráfico ficam ilegíveis no modo claro.
function refreshDashColors() {
  const cs = getComputedStyle(document.documentElement);
  const read = (nome, fallback) => (cs.getPropertyValue(nome) || "").trim() || fallback;
  DASH_COLORS.grid = read("--line", DASH_COLORS.grid);
  DASH_COLORS.text = read("--ink-soft", DASH_COLORS.text);
  DASH_COLORS.textStrong = read("--ink", DASH_COLORS.textStrong);
  DASH_COLORS.cardBg = read("--surface", DASH_COLORS.cardBg);
  DASH_OUTROS_COLOR = read("--line-strong", DASH_OUTROS_COLOR);
}

function foldTopN(labels, data, n = 7, outrosLabel = "Outros") {
  if (labels.length <= n) return { labels, data };
  const outros = data.slice(n).reduce((a, v) => a + v, 0);
  return { labels: [...labels.slice(0, n), outrosLabel], data: [...data.slice(0, n), outros] };
}

function abbrevLabel(label, maxLen) {
  if (!label) return label;
  const s = String(label).trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + "…";
}

function dashChart(canvasId, config, spec) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (dashCharts[canvasId]) dashCharts[canvasId].destroy();
  dashCharts[canvasId] = new Chart(ctx, config);
  if (spec) dashChartSpecs[canvasId] = spec;
}

function dashDonutConfig(labels, data, { valueIsMoney = true, abbreviate = true } = {}) {
  const colors = labels.map((l, i) => l === "Outros" && i === labels.length - 1 ? DASH_OUTROS_COLOR : DASH_CATEGORICAL[i % DASH_CATEGORICAL.length]);
  return {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: DASH_COLORS.cardBg, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: DASH_COLORS.text, font: { size: 10 }, boxWidth: 10, padding: 8,
            generateLabels: (chart) => {
              const base = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
              return base.map(l => ({ ...l, text: abbreviate ? abbrevLabel(l.text, 14) : l.text }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${valueIsMoney ? formatMoney(ctx.parsed) : fmt(ctx.parsed)}`
          }
        }
      }
    }
  };
}

function dashFooterHtml(rows, { money = true, maxRows = 6, suffix = "", totalMode = "sum" } = {}) {
  if (!rows.length) return `<div class="dash-footer-row"><span class="lbl">Sem dados no período</span></div>`;

  let totalHtml = "";
  if (totalMode !== "none") {
    const soma = rows.reduce((a, r) => a + r.value, 0);
    const totalValue = totalMode === "avg" ? soma / rows.length : soma;
    const totalLabel = totalMode === "avg" ? "Média geral" : "Total";
    const totalDisplay = money ? formatMoney(totalValue) : fmt(totalMode === "avg" ? +totalValue.toFixed(1) : totalValue);
    totalHtml = `
      <div class="dash-footer-row dash-footer-total">
        <span class="lbl">${totalLabel}</span>
        <span class="val">${totalDisplay}${suffix}</span>
      </div>
    `;
  }

  const shown = rows.slice(0, maxRows);
  const rest = rows.length - shown.length;
  let html = shown.map((r, i) => `
    <div class="dash-footer-row ${i === 0 ? "is-top" : ""}">
      <span class="lbl">${escapeHtml(r.label)}</span>
      <span class="val">${money ? formatMoney(r.value) : fmt(r.value)}${suffix}</span>
    </div>
  `).join("");
  if (rest > 0) html += `<div class="dash-footer-more">+ ${rest} outro${rest > 1 ? "s" : ""}</div>`;
  return totalHtml + html;
}

function dashBarConfig(labels, data, { horizontal = false, valueIsMoney = true, colors = null, abbreviate = true } = {}) {
  const maxLen = horizontal ? 20 : 11;
  const categoryTick = function (value) {
    const label = this.getLabelForValue(value);
    return abbreviate ? abbrevLabel(label, maxLen) : label;
  };
  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors || DASH_COLORS.bar,
        borderRadius: 4,
        maxBarThickness: 46
      }]
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? labels[items[0].dataIndex] : "",
            label: (ctx) => valueIsMoney ? formatMoney(ctx.parsed[horizontal ? "x" : "y"]) : fmt(ctx.parsed[horizontal ? "x" : "y"])
          }
        }
      },
      scales: {
        x: {
          grid: { color: horizontal ? DASH_COLORS.grid : "transparent" },
          ticks: {
            color: DASH_COLORS.text, font: { size: 10.5 },
            callback: horizontal ? (valueIsMoney ? (v) => formatMoney(v) : undefined) : categoryTick,
            maxRotation: horizontal ? 0 : 40, minRotation: horizontal ? 0 : 40
          }
        },
        y: {
          grid: { color: horizontal ? "transparent" : DASH_COLORS.grid },
          ticks: {
            color: DASH_COLORS.text, font: { size: 10.5 },
            callback: !horizontal ? (valueIsMoney ? (v) => formatMoney(v) : undefined) : categoryTick
          }
        }
      }
    }
  };
}

function renderDashboard() {
  refreshDashColors();
  atualizarAlertaEstoqueBaixo();
  applyDashVisibility();
  populateMesFiltro("dashMesFiltro");
  const vendas = getVendasFiltradasPor("dashMesFiltro");

  const totalFaturamento = vendas.reduce((a, v) => a + v.valorVenda, 0);
  const totalPneus = vendas.reduce((a, v) => a + v.quantidadePneus, 0);
  const totalComissao = vendas.reduce((a, v) => a + (v.comissao || 0), 0);
  const totalFrete = vendas.reduce((a, v) => a + (v.valorFrete || 0), 0);

  // por vendedor / estado / transportadora / forma / cliente
  const porVendedor = {}, porEstado = {}, porTransp = {}, porForma = {}, porCliente = {};
  vendas.forEach(v => {
    const vend = v.vendedor || "(sem vendedor)";
    if (!porVendedor[vend]) porVendedor[vend] = { faturamento: 0, comissao: 0 };
    porVendedor[vend].faturamento += v.valorVenda;
    porVendedor[vend].comissao += v.comissao || 0;

    const cli = getCliente(v.cliente);
    const uf = (cli && cli.estado) || "—";
    if (!porEstado[uf]) porEstado[uf] = { faturamento: 0, pneus: 0, fretePct: [] };
    porEstado[uf].faturamento += v.valorVenda;
    porEstado[uf].pneus += v.quantidadePneus;
    if (v.valorFrete && v.valorVenda) porEstado[uf].fretePct.push(v.valorFrete / v.valorVenda);

    const transp = v.transportadora || "(não informado)";
    if (!porTransp[transp]) porTransp[transp] = { qtd: 0, frete: 0 };
    porTransp[transp].qtd += 1;
    porTransp[transp].frete += v.valorFrete || 0;

    const forma = v.formaPagamento || "(não informado)";
    porForma[forma] = (porForma[forma] || 0) + v.valorVenda;

    if (!porCliente[v.cliente]) porCliente[v.cliente] = { faturamento: 0, pneus: 0 };
    porCliente[v.cliente].faturamento += v.valorVenda;
    porCliente[v.cliente].pneus += v.quantidadePneus;
  });

  const vendedores = Object.entries(porVendedor).sort((a, b) => b[1].faturamento - a[1].faturamento);
  const estados = Object.entries(porEstado).sort((a, b) => b[1].faturamento - a[1].faturamento);
  const transportadoras = Object.entries(porTransp)
    .filter(([nome]) => nome !== "Cliente retira")
    .sort((a, b) => b[1].frete - a[1].frete);
  const transportadorasPorQtd = Object.entries(porTransp).sort((a, b) => b[1].qtd - a[1].qtd);
  const formas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
  const clientesRank = Object.entries(porCliente).sort((a, b) => b[1].faturamento - a[1].faturamento);

  // 1. Volume de pneus vendidos por estado
  dashChart("chartPneusEstado",
    dashBarConfig(estados.map(([uf]) => uf), estados.map(([, d]) => d.pneus), { valueIsMoney: false }),
    { type: "bar", title: "Volume de Pneus Vendidos por Estado", labels: estados.map(([uf]) => uf), data: estados.map(([, d]) => d.pneus), opts: { valueIsMoney: false } }
  );
  document.getElementById("footPneusEstado").innerHTML = dashFooterHtml(
    estados.map(([uf, d]) => ({ label: uf, value: d.pneus })), { money: false, suffix: " un." }
  );

  // 1b. Pneus mais vendidos por medida (soma de todos os códigos daquela medida)
  const movimentosVenda = getMovimentosVendaFiltradosPor("dashMesFiltro");
  const porMedidaVendida = {};
  movimentosVenda.forEach(m => {
    const p = getProduto(m.codigo);
    const medidaBase = p ? extractMedidaBase(p.medida) : "OUTRA";
    porMedidaVendida[medidaBase] = (porMedidaVendida[medidaBase] || 0) + m.quantidade;
  });
  const rankingMedida = Object.entries(porMedidaVendida).sort((a, b) => b[1] - a[1]).slice(0, 10);
  dashChart("chartPneusMaisVendidos",
    dashBarConfig(rankingMedida.map(([medida]) => medida), rankingMedida.map(([, qtd]) => qtd), { horizontal: true, valueIsMoney: false }),
    { type: "bar", title: "Pneus Mais Vendidos (por Medida)", labels: rankingMedida.map(([medida]) => medida), data: rankingMedida.map(([, qtd]) => qtd), opts: { horizontal: true, valueIsMoney: false } }
  );
  document.getElementById("footPneusMaisVendidos").innerHTML = dashFooterHtml(
    rankingMedida.map(([medida, qtd]) => ({ label: medida, value: qtd })), { money: false, suffix: " un." }
  );

  // 2. Faturamento por representante
  dashChart("chartFaturamentoRepresentante",
    dashBarConfig(vendedores.map(([nome]) => nome), vendedores.map(([, d]) => d.faturamento)),
    { type: "bar", title: "Faturamento por Representante", labels: vendedores.map(([nome]) => nome), data: vendedores.map(([, d]) => d.faturamento), opts: {} }
  );
  document.getElementById("footFaturamentoRepresentante").innerHTML = dashFooterHtml(
    vendedores.map(([nome, d]) => ({ label: nome, value: d.faturamento }))
  );

  // 3. Quantidade de NFs por transportadora (donut — parte-do-todo, poucas categorias)
  const nfTranspFolded = foldTopN(transportadorasPorQtd.map(([nome]) => nome), transportadorasPorQtd.map(([, d]) => d.qtd));
  dashChart("chartNFTransportadora",
    dashDonutConfig(nfTranspFolded.labels, nfTranspFolded.data, { valueIsMoney: false }),
    { type: "donut", title: "Quantidade de NFs por Transportadora", labels: nfTranspFolded.labels, data: nfTranspFolded.data, opts: { valueIsMoney: false } }
  );
  document.getElementById("footNFTransportadora").innerHTML = dashFooterHtml(
    transportadorasPorQtd.map(([nome, d]) => ({ label: nome, value: d.qtd })), { money: false, suffix: " NF(s)" }
  );

  // 4. Gastos com frete por transportadora
  dashChart("chartFreteTransportadora",
    dashBarConfig(transportadoras.map(([nome]) => nome), transportadoras.map(([, d]) => d.frete)),
    { type: "bar", title: "Gastos com Frete por Transportadora", labels: transportadoras.map(([nome]) => nome), data: transportadoras.map(([, d]) => d.frete), opts: {} }
  );
  document.getElementById("footFreteTransportadora").innerHTML = dashFooterHtml(
    transportadoras.map(([nome, d]) => ({ label: nome, value: d.frete }))
  );

  // 5. Indicadores gerais — números isolados, escalas diferentes (R$, unidades) não cabem no mesmo eixo
  document.getElementById("statsIndicadores").innerHTML = [
    { lbl: "Faturamento", val: formatMoney(totalFaturamento) },
    { lbl: "Pneus vendidos", val: fmt(totalPneus) + " un." },
    { lbl: "Comissão", val: formatMoney(totalComissao) },
    { lbl: "Custo de frete", val: formatMoney(totalFrete) }
  ].map(s => `<div class="dash-stat-tile"><div class="lbl">${s.lbl}</div><div class="val">${s.val}</div></div>`).join("");

  // 6. Percentual médio de frete por estado
  const estadosComFrete = estados.filter(([, d]) => d.fretePct.length > 0);
  const percPorEstado = estadosComFrete.map(([uf, d]) => ({
    uf, pct: +(d.fretePct.reduce((a, b) => a + b, 0) / d.fretePct.length * 100).toFixed(1)
  }));
  dashChart("chartFretePercEstado", {
    ...dashBarConfig(percPorEstado.map(x => x.uf), percPorEstado.map(x => x.pct), { valueIsMoney: false }),
    options: {
      ...dashBarConfig([], []).options,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.y + "%" } } },
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: DASH_COLORS.text, font: { size: 10.5 } } },
        y: { grid: { color: DASH_COLORS.grid }, ticks: { color: DASH_COLORS.text, font: { size: 10.5 }, callback: (v) => v + "%" } }
      }
    }
  }, { type: "pct", title: "Percentual Médio de Frete por Estado", labels: percPorEstado.map(x => x.uf), data: percPorEstado.map(x => x.pct), opts: {} });
  document.getElementById("footFretePercEstado").innerHTML = dashFooterHtml(
    percPorEstado.map(x => ({ label: x.uf, value: x.pct })), { money: false, suffix: "%", totalMode: "avg" }
  );

  // 7. Faturamento por estado (donut — parte-do-todo, poucas categorias, diferença clara)
  const fatEstadoFolded = foldTopN(estados.map(([uf]) => uf), estados.map(([, d]) => d.faturamento));
  dashChart("chartFaturamentoEstado",
    dashDonutConfig(fatEstadoFolded.labels, fatEstadoFolded.data),
    { type: "donut", title: "Faturamento por Estado", labels: fatEstadoFolded.labels, data: fatEstadoFolded.data, opts: {} }
  );
  document.getElementById("footFaturamentoEstado").innerHTML = dashFooterHtml(
    estados.map(([uf, d]) => ({ label: uf, value: d.faturamento }))
  );

  // 8. Faturamento por cliente (top 10, horizontal — muitos nomes longos)
  const top10Clientes = clientesRank.slice(0, 10);
  dashChart("chartFaturamentoCliente",
    dashBarConfig(top10Clientes.map(([nome]) => nome), top10Clientes.map(([, d]) => d.faturamento), { horizontal: true }),
    { type: "bar", title: "Faturamento por Cliente", labels: top10Clientes.map(([nome]) => nome), data: top10Clientes.map(([, d]) => d.faturamento), opts: { horizontal: true } }
  );
  document.getElementById("footFaturamentoCliente").innerHTML = dashFooterHtml(
    clientesRank.map(([nome, d]) => ({ label: nome, value: d.faturamento }))
  );

  // 9. Top 5 clientes
  const top5 = clientesRank.slice(0, 5);
  dashChart("chartTop5Clientes",
    dashBarConfig(top5.map(([nome]) => nome), top5.map(([, d]) => d.faturamento)),
    { type: "bar", title: "Top 5 Clientes", labels: top5.map(([nome]) => nome), data: top5.map(([, d]) => d.faturamento), opts: {} }
  );
  document.getElementById("footTop5Clientes").innerHTML = dashFooterHtml(
    top5.map(([nome, d]) => ({ label: nome, value: d.faturamento })), { maxRows: 5 }
  );

  // 10. Comissão por representante
  dashChart("chartComissaoRepresentante",
    dashBarConfig(vendedores.map(([nome]) => nome), vendedores.map(([, d]) => d.comissao)),
    { type: "bar", title: "Comissão por Representante", labels: vendedores.map(([nome]) => nome), data: vendedores.map(([, d]) => d.comissao), opts: {} }
  );
  document.getElementById("footComissaoRepresentante").innerHTML = dashFooterHtml(
    vendedores.map(([nome, d]) => ({ label: nome, value: d.comissao }))
  );

  // 11. Distribuição das formas de pagamento (horizontal — muitas categorias, nomes longos)
  dashChart("chartFormaPagamento",
    dashBarConfig(formas.map(([nome]) => nome), formas.map(([, valor]) => valor), { horizontal: true }),
    { type: "bar", title: "Distribuição das Formas de Pagamento", labels: formas.map(([nome]) => nome), data: formas.map(([, valor]) => valor), opts: { horizontal: true } }
  );
  document.getElementById("footFormaPagamento").innerHTML = dashFooterHtml(
    formas.map(([nome, valor]) => ({ label: nome, value: valor })), { maxRows: 8 }
  );

  wireDashCardExpand();
}

function wireDashCardExpand() {
  document.querySelectorAll("#view-dashboard .dash-canvas-wrap").forEach(wrap => {
    const canvas = wrap.querySelector("canvas");
    if (!canvas || !dashChartSpecs[canvas.id]) return;
    wrap.classList.add("is-expandable");
    wrap.onclick = () => openChartModal(canvas.id);
  });
}

function openChartModal(canvasId) {
  const spec = dashChartSpecs[canvasId];
  if (!spec) return;

  document.getElementById("chartModalTitle").textContent = spec.title;

  let config;
  if (spec.type === "donut") {
    config = dashDonutConfig(spec.labels, spec.data, { ...spec.opts, abbreviate: false });
  } else if (spec.type === "pct") {
    config = dashBarConfig(spec.labels, spec.data, { ...spec.opts, valueIsMoney: false, abbreviate: false });
    config.options.plugins.tooltip.callbacks = { label: (ctx) => ctx.parsed.y + "%" };
    config.options.scales.y.ticks.callback = (v) => v + "%";
  } else {
    config = dashBarConfig(spec.labels, spec.data, { ...spec.opts, abbreviate: false });
  }

  if (dashModalChart) dashModalChart.destroy();
  dashModalChart = new Chart(document.getElementById("chartModalCanvas"), config);

  const money = spec.type !== "pct";
  document.getElementById("chartModalFooter").innerHTML = dashFooterHtml(
    spec.labels.map((label, i) => ({ label, value: spec.data[i] })),
    { money: spec.opts && spec.opts.valueIsMoney === false ? false : money, maxRows: 100, suffix: spec.type === "pct" ? "%" : "" }
  );

  document.getElementById("chartModalOverlay").classList.add("show");
}

function closeChartModal() {
  document.getElementById("chartModalOverlay").classList.remove("show");
}

function renderFaturamento() {
  populateMesFiltro("fatMesFiltro");
  const vendas = getVendasFiltradas();

  const totalFaturamento = vendas.reduce((a, v) => a + v.valorVenda, 0);
  const totalPneus = vendas.reduce((a, v) => a + v.quantidadePneus, 0);
  const totalComissao = vendas.reduce((a, v) => a + (v.comissao || 0), 0);
  const totalFrete = vendas.reduce((a, v) => a + (v.valorFrete || 0), 0);

  document.getElementById("fatKpis").innerHTML = [
    { lbl: "Faturamento no período", val: formatMoney(totalFaturamento), accent: true },
    { lbl: "Pneus vendidos", val: fmt(totalPneus) },
    { lbl: "Total de comissão", val: formatMoney(totalComissao) },
    { lbl: "Custo de frete", val: formatMoney(totalFrete) }
  ].map(k => `
    <div class="kpi ${k.accent ? "accent" : ""}">
      <div class="lbl">${k.lbl}</div>
      <div class="val" style="font-size:19px;">${k.val}</div>
    </div>
  `).join("");

  // por vendedor
  const porVendedor = {};
  vendas.forEach(v => {
    const key = v.vendedor || "(sem vendedor)";
    if (!porVendedor[key]) porVendedor[key] = { faturamento: 0, comissao: 0 };
    porVendedor[key].faturamento += v.valorVenda;
    porVendedor[key].comissao += v.comissao || 0;
  });
  const vendedores = Object.entries(porVendedor).sort((a, b) => b[1].faturamento - a[1].faturamento);
  document.getElementById("fatVendedorTbody").innerHTML = vendedores.length === 0
    ? `<tr><td colspan="3" class="muted">Nenhuma venda no período.</td></tr>`
    : vendedores.map(([nome, d]) => `
      <tr>
        <td>${escapeHtml(nome)}</td>
        <td class="num mono">${formatMoney(d.faturamento)}</td>
        <td class="num mono">${formatMoney(d.comissao)}</td>
      </tr>
    `).join("");

  // por estado
  const porEstado = {};
  vendas.forEach(v => {
    const cli = getCliente(v.cliente);
    const uf = (cli && cli.estado) || "—";
    if (!porEstado[uf]) porEstado[uf] = { faturamento: 0, pneus: 0, fretePct: [] };
    porEstado[uf].faturamento += v.valorVenda;
    porEstado[uf].pneus += v.quantidadePneus;
    if (v.valorFrete && v.valorVenda) porEstado[uf].fretePct.push(v.valorFrete / v.valorVenda);
  });
  const estados = Object.entries(porEstado).sort((a, b) => b[1].faturamento - a[1].faturamento);
  document.getElementById("fatEstadoTbody").innerHTML = estados.length === 0
    ? `<tr><td colspan="4" class="muted">Nenhuma venda no período.</td></tr>`
    : estados.map(([uf, d]) => {
      const media = d.fretePct.length ? (d.fretePct.reduce((a, b) => a + b, 0) / d.fretePct.length * 100) : null;
      return `
        <tr>
          <td class="mono">${escapeHtml(uf)}</td>
          <td class="num mono">${formatMoney(d.faturamento)}</td>
          <td class="num mono">${fmt(d.pneus)}</td>
          <td class="num mono">${media !== null ? media.toFixed(1).replace(".", ",") + "%" : "—"}</td>
        </tr>
      `;
    }).join("");

  // por transportadora
  const porTransp = {};
  vendas.forEach(v => {
    const key = v.transportadora || "(não informado)";
    if (!porTransp[key]) porTransp[key] = { qtd: 0, frete: 0 };
    porTransp[key].qtd += 1;
    porTransp[key].frete += v.valorFrete || 0;
  });
  const transportadoras = Object.entries(porTransp).sort((a, b) => b[1].frete - a[1].frete);
  document.getElementById("fatTransportadoraTbody").innerHTML = transportadoras.length === 0
    ? `<tr><td colspan="3" class="muted">Nenhuma venda no período.</td></tr>`
    : transportadoras.map(([nome, d]) => `
      <tr>
        <td>${escapeHtml(nome)}</td>
        <td class="num mono">${fmt(d.qtd)}</td>
        <td class="num mono">${formatMoney(d.frete)}</td>
      </tr>
    `).join("");

  // formas de pagamento
  const porForma = {};
  vendas.forEach(v => {
    const key = v.formaPagamento || "(não informado)";
    porForma[key] = (porForma[key] || 0) + v.valorVenda;
  });
  const formas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
  const maxForma = formas.length ? formas[0][1] : 1;
  document.getElementById("fatFormaPagList").innerHTML = formas.length === 0
    ? `<div class="muted" style="font-size:13px;">Nenhuma venda no período.</div>`
    : formas.map(([nome, valor]) => `
      <div class="rank-row">
        <div class="rank-main" style="margin-left:0;">
          <div class="rank-label"><span>${escapeHtml(nome)}</span><span class="n">${formatMoney(valor)}</span></div>
          <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(4, (valor / maxForma) * 100)}%"></div></div>
        </div>
      </div>
    `).join("");

  // por cliente
  const porCliente = {};
  vendas.forEach(v => {
    if (!porCliente[v.cliente]) porCliente[v.cliente] = { faturamento: 0, pneus: 0 };
    porCliente[v.cliente].faturamento += v.valorVenda;
    porCliente[v.cliente].pneus += v.quantidadePneus;
  });
  const clientesRank = Object.entries(porCliente).sort((a, b) => b[1].faturamento - a[1].faturamento);
  const tbodyCliente = document.getElementById("fatClienteTbody");
  const emptyCliente = document.getElementById("fatClienteEmpty");
  if (clientesRank.length === 0) {
    tbodyCliente.innerHTML = "";
    emptyCliente.style.display = "block";
  } else {
    emptyCliente.style.display = "none";
    tbodyCliente.innerHTML = clientesRank.map(([nome, d], i) => {
      const cli = getCliente(nome);
      return `
        <tr class="${i < 5 ? "frete-row-contratada" : ""}">
          <td class="mono">${i + 1}</td>
          <td>${escapeHtml(nome)}</td>
          <td class="mono muted">${escapeHtml((cli && cli.estado) || "—")}</td>
          <td class="num mono">${formatMoney(d.faturamento)}</td>
          <td class="num mono">${fmt(d.pneus)}</td>
        </tr>
      `;
    }).join("");
  }
}

let clientesSelecionadosParaMesclar = new Set();

function renderClientes() {
  const search = (document.getElementById("cliSearch").value || "").trim().toLowerCase();
  let rows = state.clientes.slice();
  if (search) {
    rows = rows.filter(c => [c.nome, c.estado, c.cidade].join(" ").toLowerCase().includes(search));
  }
  rows.sort((a, b) => a.nome.localeCompare(b.nome));

  const nomesExistentes = new Set(state.clientes.map(c => c.nome));
  clientesSelecionadosParaMesclar.forEach(n => { if (!nomesExistentes.has(n)) clientesSelecionadosParaMesclar.delete(n); });

  document.getElementById("cliCount").textContent = `${state.clientes.length} cliente(s) cadastrado(s)`;
  document.getElementById("cliTbody").innerHTML = rows.map(c => `
    <tr>
      <td class="write-ui"><input type="checkbox" class="cliente-select-check" data-selcli="${escapeAttr(c.nome)}" ${clientesSelecionadosParaMesclar.has(c.nome) ? "checked" : ""}></td>
      <td class="cliente-nome-click" data-clientenome="${escapeAttr(c.nome)}">${escapeHtml(c.nome)}</td>
      <td class="mono">${escapeHtml(c.estado || "—")}</td>
      <td>${escapeHtml(c.cidade || "—")}</td>
      <td>${escapeHtml(TIPO_CLIENTE_LABEL[c.tipoCliente] || "—")}</td>
      <td>
        <div class="cliente-tags-list-compact">
          ${(c.tags || []).map(t => `<span class="cliente-tag-pill">${escapeHtml(t)}</span>`).join("") || "—"}
        </div>
      </td>
      <td><button class="btn small danger write-ui" data-delcli="${escapeAttr(c.nome)}">Excluir</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-clientenome]").forEach(td => {
    td.addEventListener("click", () => openClienteModal(td.dataset.clientenome));
  });

  document.querySelectorAll("[data-selcli]").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) clientesSelecionadosParaMesclar.add(chk.dataset.selcli);
      else clientesSelecionadosParaMesclar.delete(chk.dataset.selcli);
      atualizarBotaoMesclarClientes();
    });
  });

  document.querySelectorAll("[data-delcli]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nome = btn.dataset.delcli;
      const temVenda = state.vendas.some(v => v.cliente === nome);
      if (temVenda) {
        toast("Não é possível excluir: esse cliente já tem vendas registradas.");
        return;
      }
      const motivo = await motivoModal("Excluir cliente?", `Remover "${nome}" do cadastro? Informe o motivo da exclusão.`);
      if (!motivo) return;
      const { error } = await sb.from("clientes").delete().eq("nome", nome);
      if (error) { toast("Erro ao excluir: " + error.message); return; }
      await registrarLog("clientes", nome, "exclusao", motivo, nome);
      state.clientes = state.clientes.filter(c => c.nome !== nome);
      renderClientes();
      renderClienteSelect();
      toast("Cliente removido.");
    });
  });

  atualizarBotaoMesclarClientes();
}

function atualizarBotaoMesclarClientes() {
  const btn = document.getElementById("btnMesclarClientes");
  const n = clientesSelecionadosParaMesclar.size;
  document.getElementById("cliSelecionadosCount").textContent = n;
  btn.style.display = n >= 2 ? "" : "none";
}

function normalizarDocumentoTexto(doc) {
  return (doc || "").replace(/\D/g, "");
}

function renderPreCadastrosClientes() {
  const pendentes = state.clientesPendentes || [];
  document.getElementById("cardPreCadastros").style.display = pendentes.length ? "" : "none";
  document.getElementById("preCadCount").textContent = `${pendentes.length} pendente(s)`;
  document.getElementById("preCadTbody").innerHTML = pendentes.map(p => `
    <tr>
      <td>${escapeHtml(p.nome)}</td>
      <td class="mono">${escapeHtml(p.documento || "—")}</td>
      <td>${escapeHtml([p.cidade, p.estado].filter(Boolean).join(" / ") || "—")}</td>
      <td>${escapeHtml(TIPO_CLIENTE_LABEL[p.tipo_cliente] || "—")}</td>
      <td>${escapeHtml(p.enviado_por || "—")}</td>
      <td class="mono">${formatDateBR((p.created_at || "").slice(0, 10))}</td>
      <td>
        <button class="btn small primary write-ui" data-aprovarprecad="${escapeAttr(p.id)}">Aprovar</button>
        <button class="btn small danger write-ui" data-rejeitarprecad="${escapeAttr(p.id)}">Rejeitar</button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-aprovarprecad]").forEach(btn => {
    btn.addEventListener("click", () => aprovarPreCadastro(btn.dataset.aprovarprecad));
  });
  document.querySelectorAll("[data-rejeitarprecad]").forEach(btn => {
    btn.addEventListener("click", () => rejeitarPreCadastro(btn.dataset.rejeitarprecad));
  });
}

async function aprovarPreCadastro(id) {
  const p = (state.clientesPendentes || []).find(x => x.id === id);
  if (!p) return;

  const docNormalizado = normalizarDocumentoTexto(p.documento);
  const conflito = state.clientes.find(c =>
    c.nome.toLowerCase() === p.nome.toLowerCase() ||
    (docNormalizado && normalizarDocumentoTexto(c.documento) === docNormalizado)
  );
  if (conflito) {
    toast(`Já existe um cliente cadastrado com esse nome/CNPJ ("${conflito.nome}") — revise manualmente antes de aprovar.`);
    return;
  }

  const novoCliente = {
    nome: p.nome, estado: p.estado || "", cidade: p.cidade || "",
    documento: p.documento || "", razaoSocial: p.razao_social || "",
    telefone: p.telefone || "", email: p.email || "", endereco: p.endereco || "", contato: p.contato || "",
    tipoCliente: p.tipo_cliente || null
  };
  const { data: inserido, error: errInsert } = await sb.from("clientes").insert(clienteToRow(novoCliente)).select();
  if (errInsert) { toast("Erro ao aprovar: " + errInsert.message); return; }

  const { error: errDelete } = await sb.from("clientes_pendentes").delete().eq("id", id);
  if (errDelete) { toast("Cliente criado, mas houve erro ao remover o pré-cadastro: " + errDelete.message); }

  state.clientes.push(clienteFromRow(inserido[0]));
  state.clientesPendentes = state.clientesPendentes.filter(x => x.id !== id);
  renderPreCadastrosClientes();
  renderClientes();
  renderClienteSelect();
  toast(`Cliente "${p.nome}" aprovado.`);
}

async function rejeitarPreCadastro(id) {
  const p = (state.clientesPendentes || []).find(x => x.id === id);
  if (!p) return;
  const motivo = await motivoModal("Rejeitar pré-cadastro?", `Rejeitar o cadastro de "${p.nome}" enviado por ${p.enviado_por || "representante"}? Informe o motivo.`);
  if (!motivo) return;

  const { error } = await sb.from("clientes_pendentes").delete().eq("id", id);
  if (error) { toast("Erro ao rejeitar: " + error.message); return; }

  await registrarLog("clientes", p.nome, "exclusao", motivo, `Pré-cadastro de representante rejeitado: ${p.nome}`);
  state.clientesPendentes = state.clientesPendentes.filter(x => x.id !== id);
  renderPreCadastrosClientes();
  toast("Pré-cadastro rejeitado.");
}

function abrirMesclarClientesModal() {
  const nomes = Array.from(clientesSelecionadosParaMesclar);
  if (nomes.length < 2) return;

  const CAMPOS_MESCLAGEM = ["documento", "razaoSocial", "telefone", "email", "endereco", "contato", "estado", "cidade", "tipoCliente"];
  const itens = nomes.map(nome => {
    const c = getCliente(nome);
    const vendasCount = state.vendas.filter(v => v.cliente === nome).length;
    const entregasCount = state.entregas.filter(e => e.cliente === nome).length;
    const camposPreenchidos = CAMPOS_MESCLAGEM.filter(f => c[f]).length;
    const score = (vendasCount + entregasCount) * 10 + camposPreenchidos;
    return { nome, c, vendasCount, entregasCount, score };
  });
  const principalSugerido = itens.slice().sort((a, b) => b.score - a.score)[0].nome;

  document.getElementById("mesclarClientesLista").innerHTML = itens.map(it => `
    <label class="mesclar-cliente-item">
      <input type="radio" name="mesclarPrincipal" value="${escapeAttr(it.nome)}" ${it.nome === principalSugerido ? "checked" : ""}>
      <div>
        <div class="nome">${escapeHtml(it.nome)}</div>
        <div class="detalhes">
          <span><b>CNPJ/CPF:</b> ${escapeHtml(it.c.documento || "—")}</span>
          <span><b>Razão social:</b> ${escapeHtml(it.c.razaoSocial || "—")}</span>
          <span><b>Cidade/UF:</b> ${escapeHtml([it.c.cidade, it.c.estado].filter(Boolean).join(" / ") || "—")}</span>
          <span><b>Tags:</b> ${(it.c.tags || []).length}</span>
          <span><b>Vendas:</b> ${it.vendasCount}</span>
          <span><b>Pedidos em Entregas:</b> ${it.entregasCount}</span>
        </div>
      </div>
    </label>
  `).join("");

  document.getElementById("mesclarClientesModalOverlay").classList.add("show");
}

function fecharMesclarClientesModal() {
  document.getElementById("mesclarClientesModalOverlay").classList.remove("show");
}

async function confirmarMesclagemClientes() {
  const radioSelecionado = document.querySelector('input[name="mesclarPrincipal"]:checked');
  if (!radioSelecionado) { toast("Selecione qual cadastro deve ser o principal."); return; }
  const survivorNome = radioSelecionado.value;
  const outros = Array.from(clientesSelecionadosParaMesclar).filter(n => n !== survivorNome);
  if (!outros.length) { toast("Selecione ao menos 2 clientes para mesclar."); return; }

  const motivo = await motivoModal("Confirmar mesclagem?",
    `"${outros.join('", "')}" será(ão) removido(s), e suas vendas/pedidos passam a apontar para "${survivorNome}". Informe o motivo.`);
  if (!motivo) return;

  const survivor = getCliente(survivorNome);
  const grupo = [survivor, ...outros.map(getCliente)];

  const CAMPOS_MESCLAGEM = ["documento", "razaoSocial", "telefone", "email", "endereco", "contato", "estado", "cidade", "tipoCliente"];
  const camposMesclados = {};
  CAMPOS_MESCLAGEM.forEach(f => {
    camposMesclados[f] = survivor[f] || (grupo.find(c => c[f]) || {})[f] || "";
  });

  const tagsMescladas = [];
  grupo.forEach(c => (c.tags || []).forEach(t => {
    if (!tagsMescladas.some(x => x.toLowerCase() === t.toLowerCase())) tagsMescladas.push(t);
  }));
  const notasMescladas = grupo.flatMap(c => c.notas || []);

  const payloadSurvivor = {
    documento: camposMesclados.documento || null,
    razao_social: camposMesclados.razaoSocial || null,
    telefone: camposMesclados.telefone || null,
    email: camposMesclados.email || null,
    endereco: camposMesclados.endereco || null,
    contato: camposMesclados.contato || null,
    estado: camposMesclados.estado || null,
    cidade: camposMesclados.cidade || null,
    tipo_cliente: camposMesclados.tipoCliente || null,
    tags: tagsMescladas,
    notas: notasMescladas
  };

  const { error: errSurvivor } = await sb.from("clientes").update(payloadSurvivor).eq("nome", survivorNome);
  if (errSurvivor) { toast("Erro ao atualizar cliente principal: " + errSurvivor.message); return; }

  for (const nomeAntigo of outros) {
    const [vendasRes, entregasRes] = await Promise.all([
      sb.from("vendas").update({ cliente: survivorNome }).eq("cliente", nomeAntigo),
      sb.from("entregas").update({ cliente: survivorNome }).eq("cliente", nomeAntigo)
    ]);
    if (vendasRes.error || entregasRes.error) {
      toast(`Erro ao atualizar vendas/pedidos de "${nomeAntigo}" — mesclagem interrompida.`);
      return;
    }
    const { error: errDelete } = await sb.from("clientes").delete().eq("nome", nomeAntigo);
    if (errDelete) { toast(`Erro ao remover cadastro duplicado "${nomeAntigo}": ` + errDelete.message); return; }

    state.vendas.forEach(v => { if (v.cliente === nomeAntigo) v.cliente = survivorNome; });
    state.entregas.forEach(e => { if (e.cliente === nomeAntigo) e.cliente = survivorNome; });
  }

  Object.assign(survivor, {
    documento: camposMesclados.documento, razaoSocial: camposMesclados.razaoSocial, telefone: camposMesclados.telefone,
    email: camposMesclados.email, endereco: camposMesclados.endereco, contato: camposMesclados.contato,
    estado: camposMesclados.estado, cidade: camposMesclados.cidade, tags: tagsMescladas, notas: notasMescladas
  });
  state.clientes = state.clientes.filter(c => c.nome === survivorNome || !outros.includes(c.nome));

  await registrarLog("clientes", survivorNome, "exclusao", motivo,
    `Cadastros mesclados em "${survivorNome}": ${outros.join(", ")}`);

  clientesSelecionadosParaMesclar.clear();
  fecharMesclarClientesModal();
  renderClientes();
  renderClienteSelect();
  toast("Clientes mesclados com sucesso.");
}

function getClienteStats(nome) {
  const vendas = state.vendas.filter(v => v.cliente === nome).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const totalFaturado = vendas.reduce((a, v) => a + v.valorVenda, 0);
  const totalPneus = vendas.reduce((a, v) => a + v.quantidadePneus, 0);
  const ticketMedio = vendas.length ? totalFaturado / vendas.length : 0;
  const ultimaCompra = vendas.length ? vendas[0].data : null;
  const entregas = state.entregas.filter(e => e.cliente === nome).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return { vendas, totalFaturado, totalPneus, ticketMedio, ultimaCompra, entregas };
}

let currentClienteModalNome = null;

function renderClienteTags() {
  const c = getCliente(currentClienteModalNome);
  const tags = (c && c.tags) || [];
  document.getElementById("clienteModalTags").innerHTML = tags.map(t => `
    <span class="cliente-tag-pill">${escapeHtml(t)}<button type="button" class="write-ui" data-removertag="${escapeAttr(t)}">✕</button></span>
  `).join("");
  document.querySelectorAll("[data-removertag]").forEach(btn => {
    btn.addEventListener("click", () => removerTagCliente(currentClienteModalNome, btn.dataset.removertag));
  });
}

function renderClienteNotas() {
  const c = getCliente(currentClienteModalNome);
  const notas = ((c && c.notas) || []).slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const container = document.getElementById("clienteModalNotas");
  if (notas.length === 0) {
    container.innerHTML = `<div class="muted" style="font-size:12px;">Nenhuma nota registrada ainda.</div>`;
    return;
  }
  container.innerHTML = notas.map(n => `
    <div class="cliente-nota-item">
      <div class="cliente-nota-item-head">
        <span class="cliente-nota-item-meta">${escapeHtml(n.autor || "—")} · ${formatDateBR((n.data || "").slice(0, 10))}</span>
        <button type="button" class="write-ui" data-removernota="${escapeAttr(n.id)}">✕</button>
      </div>
      <div class="cliente-nota-item-texto">${escapeHtml(n.texto)}</div>
    </div>
  `).join("");
  container.querySelectorAll("[data-removernota]").forEach(btn => {
    btn.addEventListener("click", () => removerNotaCliente(currentClienteModalNome, btn.dataset.removernota));
  });
}

async function adicionarTagCliente(nome, tag) {
  const t = (tag || "").trim();
  if (!t) return;
  const c = getCliente(nome);
  if (!c) return;
  if ((c.tags || []).some(x => x.toLowerCase() === t.toLowerCase())) { toast("Essa tag já existe."); return; }
  const novasTags = [...(c.tags || []), t];
  const { error } = await sb.from("clientes").update({ tags: novasTags }).eq("nome", nome);
  if (error) { toast("Erro ao salvar tag: " + error.message); return; }
  c.tags = novasTags;
  await registrarLog("clientes", nome, "edicao", "Ação automática", `Tag "${t}" adicionada ao cliente ${nome}`);
  renderClienteTags();
  renderClientes();
}

async function removerTagCliente(nome, tag) {
  const c = getCliente(nome);
  if (!c) return;
  const novasTags = (c.tags || []).filter(t => t !== tag);
  const { error } = await sb.from("clientes").update({ tags: novasTags }).eq("nome", nome);
  if (error) { toast("Erro ao remover tag: " + error.message); return; }
  c.tags = novasTags;
  await registrarLog("clientes", nome, "edicao", "Ação automática", `Tag "${tag}" removida do cliente ${nome}`);
  renderClienteTags();
  renderClientes();
}

async function adicionarNotaCliente(nome, texto) {
  const t = (texto || "").trim();
  if (!t) return;
  const c = getCliente(nome);
  if (!c) return;
  const novaNota = { id: uid("nota"), texto: t, data: new Date().toISOString(), autor: currentUser ? currentUser.email : null };
  const novasNotas = [...(c.notas || []), novaNota];
  const { error } = await sb.from("clientes").update({ notas: novasNotas }).eq("nome", nome);
  if (error) { toast("Erro ao salvar nota: " + error.message); return; }
  c.notas = novasNotas;
  await registrarLog("clientes", nome, "edicao", "Ação automática", `Nota adicionada ao cliente ${nome}`);
  renderClienteNotas();
  toast("Nota adicionada.");
}

async function removerNotaCliente(nome, notaId) {
  const c = getCliente(nome);
  if (!c) return;
  const motivo = await motivoModal("Remover nota?", "Informe o motivo da remoção desta nota.");
  if (!motivo) return;
  const novasNotas = (c.notas || []).filter(n => n.id !== notaId);
  const { error } = await sb.from("clientes").update({ notas: novasNotas }).eq("nome", nome);
  if (error) { toast("Erro ao remover nota: " + error.message); return; }
  c.notas = novasNotas;
  await registrarLog("clientes", nome, "exclusao", motivo, `Nota removida do cliente ${nome}`);
  renderClienteNotas();
  toast("Nota removida.");
}

function openClienteModal(nome) {
  const c = getCliente(nome);
  if (!c) return;
  currentClienteModalNome = nome;
  cancelarEdicaoCliente();
  const stats = getClienteStats(nome);

  document.getElementById("clienteModalNome").textContent = c.nome;
  document.getElementById("clienteModalInfo").innerHTML = [
    ["Documento", c.documento], ["Razão social", c.razaoSocial], ["Telefone", c.telefone], ["E-mail", c.email],
    ["Endereço", c.endereco], ["Cidade/UF", [c.cidade, c.estado].filter(Boolean).join(" / ")],
    ["Contato responsável", c.contato], ["Tipo de cliente", TIPO_CLIENTE_LABEL[c.tipoCliente] || c.tipoCliente]
  ].map(([lbl, val]) => `<div><div class="lbl">${lbl}</div><div class="val">${escapeHtml(val || "—")}</div></div>`).join("");

  document.getElementById("clienteModalKpis").innerHTML = [
    { lbl: "Faturamento total", val: formatMoney(stats.totalFaturado), accent: true },
    { lbl: "Ticket médio", val: formatMoney(stats.ticketMedio) },
    { lbl: "Pneus comprados", val: fmt(stats.totalPneus) + " un." },
    { lbl: "Última compra", val: stats.ultimaCompra ? formatDateBR(stats.ultimaCompra) : "—" }
  ].map(k => `<div class="kpi ${k.accent ? "accent" : ""}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join("");

  document.getElementById("clienteModalVendasTbody").innerHTML = stats.vendas.length
    ? stats.vendas.map(v => `
        <tr>
          <td class="mono">${formatDateBR(v.data)}</td>
          <td class="mono">${escapeHtml(v.numeroNFVenda || "—")}</td>
          <td class="num mono">${fmt(v.quantidadePneus)}</td>
          <td class="num mono">${formatMoney(v.valorVenda)}</td>
          <td>${escapeHtml(v.formaPagamento || "—")}</td>
          <td>${escapeHtml(v.vendedor || "—")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6" class="muted" style="text-align:center;padding:16px;">Nenhuma venda registrada ainda.</td></tr>`;

  document.getElementById("clienteModalEntregasList").innerHTML = stats.entregas.length
    ? stats.entregas.map(e => `
        <div class="cliente-entrega-row">
          <span>${escapeHtml(e.numeroNF || e.numeroPedido || "Sem NF")} · ${formatDateBR(e.data)}</span>
          <span class="badge">${escapeHtml(ETAPA_LABEL[e.etapa] || e.etapa)}</span>
        </div>
      `).join("")
    : `<div class="muted" style="font-size:12.5px;">Nenhum pedido em Entregas para este cliente.</div>`;

  renderClienteTags();
  renderClienteNotas();
  document.getElementById("clienteModalOverlay").classList.add("show");
}

function closeClienteModal() {
  document.getElementById("clienteModalOverlay").classList.remove("show");
  currentClienteModalNome = null;
  cancelarEdicaoCliente();
}

function abrirEdicaoCliente() {
  const c = getCliente(currentClienteModalNome);
  if (!c) return;
  document.getElementById("clienteEditNome").value = c.nome || "";
  document.getElementById("clienteEditDocumento").value = c.documento || "";
  document.getElementById("clienteEditRazaoSocial").value = c.razaoSocial || "";
  document.getElementById("clienteEditContato").value = c.contato || "";
  document.getElementById("clienteEditTelefone").value = c.telefone || "";
  document.getElementById("clienteEditEmail").value = c.email || "";
  document.getElementById("clienteEditEstado").value = c.estado || "";
  document.getElementById("clienteEditCidade").value = c.cidade || "";
  document.getElementById("clienteEditEndereco").value = c.endereco || "";
  document.getElementById("clienteEditTipoCliente").value = c.tipoCliente || "";
  document.getElementById("clienteModalInfo").style.display = "none";
  document.getElementById("formEditarCliente").style.display = "block";
}

function cancelarEdicaoCliente() {
  document.getElementById("formEditarCliente").style.display = "none";
  document.getElementById("clienteModalInfo").style.display = "";
}

async function salvarEdicaoCliente() {
  const nomeOriginal = currentClienteModalNome;
  const c = getCliente(nomeOriginal);
  if (!c) return;

  const novoNome = document.getElementById("clienteEditNome").value.trim();
  if (!novoNome) { toast("O nome do cliente é obrigatório."); return; }
  if (novoNome !== nomeOriginal && getCliente(novoNome)) {
    toast("Já existe um cliente cadastrado com esse nome.");
    return;
  }

  const dados = {
    nome: novoNome,
    documento: document.getElementById("clienteEditDocumento").value.trim(),
    razao_social: document.getElementById("clienteEditRazaoSocial").value.trim(),
    contato: document.getElementById("clienteEditContato").value.trim(),
    telefone: document.getElementById("clienteEditTelefone").value.trim(),
    email: document.getElementById("clienteEditEmail").value.trim(),
    estado: document.getElementById("clienteEditEstado").value,
    cidade: document.getElementById("clienteEditCidade").value.trim(),
    endereco: document.getElementById("clienteEditEndereco").value.trim(),
    tipo_cliente: document.getElementById("clienteEditTipoCliente").value || null
  };

  const { error } = await sb.from("clientes").update(dados).eq("nome", nomeOriginal);
  if (error) { toast("Erro ao salvar cliente: " + error.message); return; }

  const renomeou = novoNome !== nomeOriginal;
  if (renomeou) {
    const [vendasRes, entregasRes] = await Promise.all([
      sb.from("vendas").update({ cliente: novoNome }).eq("cliente", nomeOriginal),
      sb.from("entregas").update({ cliente: novoNome }).eq("cliente", nomeOriginal)
    ]);
    if (vendasRes.error || entregasRes.error) {
      toast("Cliente atualizado, mas houve erro ao atualizar vendas/pedidos vinculados ao nome antigo.");
    } else {
      state.vendas.forEach(v => { if (v.cliente === nomeOriginal) v.cliente = novoNome; });
      state.entregas.forEach(e => { if (e.cliente === nomeOriginal) e.cliente = novoNome; });
    }
  }

  c.nome = novoNome;
  c.documento = dados.documento;
  c.razaoSocial = dados.razao_social;
  c.contato = dados.contato;
  c.telefone = dados.telefone;
  c.email = dados.email;
  c.estado = dados.estado;
  c.cidade = dados.cidade;
  c.endereco = dados.endereco;
  c.tipoCliente = dados.tipo_cliente || "";

  await registrarLog("clientes", novoNome, "edicao", "Ação automática",
    `Cadastro do cliente atualizado${renomeou ? ` (renomeado de "${nomeOriginal}")` : ""}`);

  currentClienteModalNome = novoNome;
  cancelarEdicaoCliente();
  openClienteModal(novoNome);
  renderClientes();
  renderClienteSelect();
  toast("Cliente atualizado.");
}

function renderVendas() {
  const search = (document.getElementById("venSearch").value || "").trim().toLowerCase();
  const formaPagamento = document.getElementById("venFiltroFormaPagamento").value;
  const de = document.getElementById("venFiltroDe").value;
  const ate = document.getElementById("venFiltroAte").value;

  const vendedorSelect = document.getElementById("venFiltroVendedor");
  const vendedorAnterior = vendedorSelect.value;
  const vendedoresUnicos = Array.from(new Set(state.vendas.map(v => v.vendedor).filter(Boolean))).sort();
  vendedorSelect.innerHTML = `<option value="">Todos os vendedores</option>` +
    vendedoresUnicos.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
  vendedorSelect.value = vendedoresUnicos.includes(vendedorAnterior) ? vendedorAnterior : "";

  let rows = state.vendas.slice();
  if (search) {
    rows = rows.filter(v => [v.cliente, v.numeroNFVenda, v.numeroPedido, v.vendedor].join(" ").toLowerCase().includes(search));
  }
  if (vendedorSelect.value) rows = rows.filter(v => v.vendedor === vendedorSelect.value);
  if (formaPagamento) rows = rows.filter(v => v.formaPagamento === formaPagamento);
  if (de) rows = rows.filter(v => v.data >= de);
  if (ate) rows = rows.filter(v => v.data <= ate);
  rows.sort((a, b) => (b.data + b.createdAt).localeCompare(a.data + a.createdAt));

  const totalFiltrado = rows.length;
  const mostrarMaisWrap = document.getElementById("venMostrarMaisWrap");
  const btnMostrarMais = document.getElementById("btnVenMostrarMais");
  if (!vendasMostrarTodas && totalFiltrado > VENDAS_LIMITE) {
    rows = rows.slice(0, VENDAS_LIMITE);
    mostrarMaisWrap.style.display = "flex";
    btnMostrarMais.textContent = `Ver todas (${totalFiltrado})`;
  } else if (vendasMostrarTodas && totalFiltrado > VENDAS_LIMITE) {
    mostrarMaisWrap.style.display = "flex";
    btnMostrarMais.textContent = `Mostrar só as últimas ${VENDAS_LIMITE}`;
  } else {
    mostrarMaisWrap.style.display = "none";
  }

  document.getElementById("venCount").textContent = rows.length < totalFiltrado
    ? `Mostrando as ${rows.length} mais recentes de ${totalFiltrado} (${state.vendas.length} no total)`
    : `${totalFiltrado} de ${state.vendas.length} vendas`;

  const tbody = document.getElementById("venTbody");
  const empty = document.getElementById("venEmpty");
  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = rows.map(v => `
    <tr>
      <td class="mono">${formatDateBR(v.data)}</td>
      <td>${escapeHtml(v.cliente)}</td>
      <td class="mono">${escapeHtml(v.numeroNFVenda || "—")}${v.numeroPedido ? `<div class="muted" style="font-size:11px;">Ped. ${escapeHtml(v.numeroPedido)}</div>` : ""}</td>
      <td>${escapeHtml(v.vendedor || "—")}</td>
      <td class="num mono">${fmt(v.quantidadePneus)}</td>
      <td class="num mono">${formatMoney(v.valorVenda)}</td>
      <td class="num mono">${formatMoney(v.comissao || 0)}${v.comissaoPercentual ? `<div class="muted" style="font-size:11px;">${v.comissaoPercentual.toFixed(2).replace(".", ",")}%</div>` : ""}</td>
      <td>${escapeHtml(v.transportadora || "—")}</td>
      <td class="muted">${escapeHtml(v.obs || "—")}</td>
      <td style="white-space:nowrap;">
        <span class="write-ui">
          <button class="btn small outline" data-editvenda="${v.id}">Editar</button>
          <button class="btn small danger" data-delvenda="${v.id}">Excluir</button>
        </span>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-editvenda]").forEach(btn => {
    btn.addEventListener("click", () => startEditVenda(btn.dataset.editvenda));
  });

  document.querySelectorAll("[data-delvenda]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const motivo = await motivoModal("Excluir venda?", "Essa ação não pode ser desfeita. Informe o motivo da exclusão.");
      if (!motivo) return;
      const alvo = state.vendas.find(v => v.id === btn.dataset.delvenda);
      const { error } = await sb.from("vendas").delete().eq("id", btn.dataset.delvenda);
      if (error) { toast("Erro ao excluir: " + error.message); return; }
      await registrarLog("vendas", btn.dataset.delvenda, "exclusao", motivo,
        alvo ? `Venda NF ${alvo.numeroNFVenda || "—"} · ${alvo.cliente}` : "");
      state.vendas = state.vendas.filter(v => v.id !== btn.dataset.delvenda);
      renderVendas();
      renderFaturamento();
      toast("Venda excluída.");
    });
  });
}

function startEditVenda(vendaId) {
  const v = state.vendas.find(x => x.id === vendaId);
  if (!v) return;
  editingVendaId = vendaId;
  editingVendaUpdatedAt = v.updatedAt;

  document.getElementById("venData").value = v.data;
  document.getElementById("venPedido").value = v.numeroPedido || "";
  document.getElementById("venNF").value = v.numeroNFVenda || "";
  document.getElementById("venCliente").value = v.cliente;
  document.getElementById("venQtd").value = v.quantidadePneus;
  document.getElementById("venValor").value = v.valorVenda;
  document.getElementById("venFormaPagamento").value = v.formaPagamento || "";
  document.getElementById("venVendedor").value = v.vendedor || "";
  document.getElementById("venComissaoPct").value = v.comissaoPercentual || "";
  document.getElementById("venComissaoCalc").value = formatMoney(v.comissao || 0);

  const isTrademaster = v.formaPagamento === "BOLETO TRADEMASTER";
  const temParcelas = v.formaPagamento !== "" && v.formaPagamento !== "PIX";
  document.getElementById("rowParcelas").style.display = temParcelas ? "" : "none";
  document.getElementById("rowTrademaster").style.display = isTrademaster ? "" : "none";
  document.getElementById("venValorRecebido").required = isTrademaster;
  document.getElementById("venValorRecebido").value = v.valorRecebido != null ? v.valorRecebido : "";
  document.getElementById("venParcelas").value = v.parcelas != null ? v.parcelas : "";
  if (v.valorRecebido != null) {
    const diferenca = v.valorVenda - v.valorRecebido;
    const pct = v.valorVenda > 0 ? (diferenca / v.valorVenda * 100) : 0;
    document.getElementById("venDiferencaCalc").value = `${formatMoney(diferenca)} (${pct.toFixed(2).replace(".", ",")}%)`;
  } else {
    document.getElementById("venDiferencaCalc").value = "R$ 0,00 (0%)";
  }

  const clienteRetira = v.transportadora === "Cliente retira";
  document.getElementById("venClienteRetira").checked = clienteRetira;
  document.getElementById("venTransportadora").disabled = clienteRetira;
  document.getElementById("venValorFrete").disabled = clienteRetira;
  document.getElementById("venTransportadora").value = clienteRetira ? "" : (v.transportadora || "");
  document.getElementById("venValorFrete").value = v.valorFrete != null ? v.valorFrete : "";
  document.getElementById("venObs").value = v.obs || "";

  document.getElementById("venFormTitle").textContent = "Editar venda";
  document.getElementById("venEditBanner").style.display = "block";
  document.getElementById("btnSubmitVenda").textContent = "Salvar alterações";
  document.getElementById("formVenda").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelEditVenda() {
  editingVendaId = null;
  editingVendaUpdatedAt = null;
  document.getElementById("formVenda").reset();
  document.getElementById("venData").value = todayISO();
  document.getElementById("venTransportadora").disabled = false;
  document.getElementById("venValorFrete").disabled = false;
  document.getElementById("venComissaoCalc").value = "R$ 0,00";
  document.getElementById("rowParcelas").style.display = "none";
  document.getElementById("rowTrademaster").style.display = "none";
  document.getElementById("venValorRecebido").required = false;
  document.getElementById("venDiferencaCalc").value = "R$ 0,00 (0%)";
  document.getElementById("venFormTitle").textContent = "Nova venda";
  document.getElementById("venEditBanner").style.display = "none";
  document.getElementById("btnSubmitVenda").textContent = "Registrar venda";
}

/* ---------------- helpers ---------------- */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function escapeAttr(str) { return escapeHtml(str); }

function formatDateBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ---------------- form handlers ---------------- */

function initForms() {
  document.getElementById("entData").value = todayISO();
  document.getElementById("saiData").value = todayISO();
  document.getElementById("venData").value = todayISO();
  populateEstadoSelect();
  populateTipoClienteSelects();

  document.getElementById("btnAddItemPrevisto").addEventListener("click", () => {
    document.getElementById("prevItens").appendChild(createItemRow("prevItens"));
    updateItemRemoveVisibility("prevItens");
  });
  resetItens("prevItens");

  document.getElementById("prevCancelEdit").addEventListener("click", (e) => {
    e.preventDefault();
    cancelEditPrevisto();
  });

  document.getElementById("formPrevisto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numeroProcesso = document.getElementById("prevNumeroProcesso").value.trim();
    const dataChegada = document.getElementById("prevDataChegada").value;
    const status = document.getElementById("prevStatus").value;
    const obs = document.getElementById("prevObs").value.trim();
    if (!numeroProcesso) { toast("Informe o número do processo."); return; }

    const rows = Array.from(document.querySelectorAll("#prevItens .item-row"));
    const itens = [];
    for (const row of rows) {
      const codigo = row.querySelector(".item-produto").value;
      const quantidadeRaw = row.querySelector(".item-qtd").value;
      if (!codigo && !quantidadeRaw) continue;
      if (!codigo || !quantidadeRaw || parseInt(quantidadeRaw, 10) <= 0) { toast("Preencha produto e quantidade em todas as medidas adicionadas."); return; }
      itens.push({ codigo, quantidade: parseInt(quantidadeRaw, 10) });
    }

    if (editingPrevistoId) {
      const motivo = await motivoModal("Motivo da edição", "Descreva o motivo da alteração deste processo previsto.");
      if (!motivo) return;
      const p = state.previsoes.find(x => x.id === editingPrevistoId);
      const { conflict, error, row } = await updateWithConflictCheck(
        "previsoes", editingPrevistoId, editingPrevistoUpdatedAt,
        previstoToRow({ id: editingPrevistoId, numeroProcesso, itens, dataChegada, status, obs })
      );
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        cancelEditPrevisto();
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      await registrarLog("previsoes", editingPrevistoId, "edicao", motivo, `Processo ${numeroProcesso}`);
      if (p) Object.assign(p, previstoFromRow(row));
      cancelEditPrevisto();
      renderPrevistos();
      toast("Processo previsto atualizado.");
      return;
    }

    const novo = { id: uid("prev"), numeroProcesso, itens, dataChegada, status, obs };
    const { data: inserido, error } = await sb.from("previsoes").insert({ ...previstoToRow(novo), created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao adicionar processo: " + error.message); return; }
    state.previsoes.push(previstoFromRow(inserido[0]));
    e.target.reset();
    document.getElementById("prevStatus").value = "AG DATA DE CHEGADA";
    resetItens("prevItens");
    renderPrevistos();
    toast("Processo previsto adicionado.");
  });

  document.getElementById("saiTipo").addEventListener("change", (e) => {
    const label = document.getElementById("saiNumeroLabel");
    const input = document.getElementById("saiNumero");
    const map = {
      venda: ["Nº NF de venda", "Ex: 4180"],
      reserva: ["Nº do pedido", "Ex: PED. 148"],
      transferencia: ["Referência / destino", "Ex: transferência p/ filial"],
      avariado: ["Referência (opcional)", "Ex: laudo, NF de origem"]
    };
    const [lbl, ph] = map[e.target.value];
    label.textContent = lbl;
    input.placeholder = ph;
    input.required = e.target.value !== "avariado";
  });

  document.getElementById("btnAddItemEntrada").addEventListener("click", () => {
    document.getElementById("entItens").appendChild(createItemRow("entItens"));
    updateItemRemoveVisibility("entItens");
  });
  resetItens("entItens");

  document.getElementById("btnAbrirEntrada").addEventListener("click", () => {
    cancelEditMovimento("entrada");
    openEntradaModal();
  });
  document.getElementById("entradaModalCancel").addEventListener("click", () => cancelEditMovimento("entrada"));
  document.getElementById("entradaModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "entradaModalOverlay") cancelEditMovimento("entrada");
  });

  document.getElementById("formEntrada").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = document.getElementById("entData").value || todayISO();
    const numero = document.getElementById("entNumero").value.trim();
    const pedido = document.getElementById("entPedido").value.trim();
    const processo = document.getElementById("entProcesso").value.trim();
    const obs = document.getElementById("entObs").value.trim();

    const rows = Array.from(document.querySelectorAll("#entItens .item-row"));
    const itens = [];
    for (const row of rows) {
      const codigo = row.querySelector(".item-produto").value;
      const quantidade = parseInt(row.querySelector(".item-qtd").value, 10);
      if (!codigo) { toast("Cadastre um produto antes de lançar entrada."); return; }
      if (!quantidade || quantidade <= 0) { toast("Informe a quantidade de todas as medidas adicionadas."); return; }
      itens.push({ codigo, quantidade });
    }
    if (itens.length === 0) { toast("Adicione ao menos uma medida."); return; }

    if (editingMovimentoId) {
      const motivo = await motivoModal("Motivo da edição", "Descreva o motivo da alteração desta entrada.");
      if (!motivo) return;
      const { conflict, error, row } = await updateWithConflictCheck("movimentos", editingMovimentoId, editingMovimentoUpdatedAt, {
        data, numero: numero || null, pedido: pedido || null, processo: processo || null, obs: obs || null,
        codigo: itens[0].codigo, quantidade: itens[0].quantidade
      });
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        cancelEditMovimento("entrada");
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      const m = state.movimentos.find(x => x.id === editingMovimentoId);
      if (m) Object.assign(m, movimentoFromRow(row));
      await registrarLog("movimentos", editingMovimentoId, "edicao", motivo,
        `Entrada NF ${numero || "—"} · ${itens[0].codigo} · ${itens[0].quantidade} un.`);
      cancelEditMovimento("entrada");
      renderMovimentos();
      toast("Entrada atualizada.");
      return;
    }

    const duplicado = encontrarMovimentoDuplicado("entrada", data, numero, itens);
    if (duplicado) {
      toast(`Já existe uma entrada idêntica: NF ${numero}, produto ${duplicado.codigo}, quantidade ${duplicado.quantidade}, em ${formatDateBR(data)}. Verifique se não é duplicada.`);
      return;
    }

    for (const it of itens) {
      const { data: inseridos, error } = await sb.from("movimentos").insert({
        id: uid("mov"), data, tipo: "entrada", codigo: it.codigo, quantidade: it.quantidade,
        numero: numero || null, pedido: pedido || null, processo: processo || null, obs: obs || null,
        created_by: currentUser ? currentUser.id : null
      }).select();
      if (error) { renderMovimentos(); toast("Erro ao registrar entrada: " + error.message); return; }
      state.movimentos.push(movimentoFromRow(inseridos[0]));
    }
    e.target.reset();
    document.getElementById("entData").value = todayISO();
    resetItens("entItens");
    closeEntradaModal();
    renderMovimentos();
    toast(itens.length > 1 ? `${itens.length} entradas registradas.` : "Entrada registrada.");
  });

  document.getElementById("btnAddItemSaida").addEventListener("click", () => {
    document.getElementById("saiItens").appendChild(createItemRow("saiItens"));
    updateItemRemoveVisibility("saiItens");
  });
  resetItens("saiItens");

  document.getElementById("btnAbrirSaida").addEventListener("click", () => {
    cancelEditMovimento("saida");
    openSaidaModal();
  });
  document.getElementById("saidaModalCancel").addEventListener("click", () => cancelEditMovimento("saida"));
  document.getElementById("saidaModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "saidaModalOverlay") cancelEditMovimento("saida");
  });

  document.getElementById("formSaida").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = document.getElementById("saiTipo").value;
    const data = document.getElementById("saiData").value || todayISO();
    const numero = document.getElementById("saiNumero").value.trim();
    const pedido = document.getElementById("saiPedido").value.trim();
    const processo = document.getElementById("saiProcesso").value.trim();
    const obs = document.getElementById("saiObs").value.trim();

    const rows = Array.from(document.querySelectorAll("#saiItens .item-row"));
    const itens = [];
    for (const row of rows) {
      const codigo = row.querySelector(".item-produto").value;
      const quantidade = parseInt(row.querySelector(".item-qtd").value, 10);
      if (!codigo) { toast("Cadastre um produto antes de lançar saída."); return; }
      if (!quantidade || quantidade <= 0) { toast("Informe a quantidade de todas as medidas adicionadas."); return; }
      itens.push({ codigo, quantidade });
    }

    const movimentoOriginal = editingMovimentoId ? state.movimentos.find(x => x.id === editingMovimentoId) : null;
    const insuficientes = itens
      .map(it => {
        let saldo = computeProdutoTotais(it.codigo).saldo;
        if (movimentoOriginal && movimentoOriginal.codigo === it.codigo) {
          saldo += movimentoOriginal.quantidade;
        }
        return { ...it, saldo };
      })
      .filter(it => it.quantidade > it.saldo);

    if (insuficientes.length > 0) {
      const detalhe = insuficientes
        .map(it => `${it.codigo} (saldo ${fmt(it.saldo)}, lançando ${fmt(it.quantidade)})`)
        .join("; ");
      const ok = await confirmModal(
        "Saldo insuficiente",
        `Estas medidas ficarão com saldo negativo: ${detalhe}. Confirmar mesmo assim?`
      );
      if (!ok) return;
    }

    if (editingMovimentoId) {
      const motivo = await motivoModal("Motivo da edição", "Descreva o motivo da alteração desta saída.");
      if (!motivo) return;
      const { conflict, error, row } = await updateWithConflictCheck("movimentos", editingMovimentoId, editingMovimentoUpdatedAt, {
        tipo, data, numero: numero || null, pedido: pedido || null, processo: processo || null, obs: obs || null,
        codigo: itens[0].codigo, quantidade: itens[0].quantidade
      });
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        cancelEditMovimento("saida");
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      const m = state.movimentos.find(x => x.id === editingMovimentoId);
      if (m) Object.assign(m, movimentoFromRow(row));
      await registrarLog("movimentos", editingMovimentoId, "edicao", motivo,
        `Saída NF ${numero || "—"} · ${itens[0].codigo} · ${itens[0].quantidade} un.`);
      cancelEditMovimento("saida");
      renderMovimentos();
      toast("Saída atualizada.");
      return;
    }

    const duplicado = encontrarMovimentoDuplicado(tipo, data, numero, itens);
    if (duplicado) {
      toast(`Já existe uma saída idêntica: NF/pedido ${numero}, produto ${duplicado.codigo}, quantidade ${duplicado.quantidade}, em ${formatDateBR(data)}. Verifique se não é duplicada.`);
      return;
    }

    for (const it of itens) {
      const { data: inseridos, error } = await sb.from("movimentos").insert({
        id: uid("mov"), data, tipo, codigo: it.codigo, quantidade: it.quantidade,
        numero: numero || null, pedido: pedido || null, processo: processo || null, obs: obs || null,
        created_by: currentUser ? currentUser.id : null
      }).select();
      if (error) { renderMovimentos(); toast("Erro ao registrar saída: " + error.message); return; }
      state.movimentos.push(movimentoFromRow(inseridos[0]));
    }
    e.target.reset();
    document.getElementById("saiData").value = todayISO();
    document.getElementById("saiNumeroLabel").textContent = "Nº NF de venda";
    resetItens("saiItens");
    closeSaidaModal();
    renderMovimentos();
    toast(itens.length > 1 ? `${itens.length} saídas registradas.` : "Saída registrada.");
  });

  document.getElementById("freteData").value = todayISO();
  document.getElementById("btnAddItemFrete").addEventListener("click", () => {
    document.getElementById("freteItens").appendChild(createFreteItemRow());
    updateFreteItemRemoveVisibility();
  });
  resetFreteItens();

  document.getElementById("freteCep").addEventListener("input", (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    e.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  });

  document.getElementById("freteCep").addEventListener("blur", async (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { toast("CEP não encontrado."); return; }
      document.getElementById("freteLocalidade").value = `${data.localidade}/${data.uf}`;
    } catch (err) {
      toast("Não foi possível consultar o CEP agora.");
    }
  });

  document.getElementById("freteCancelEdit").addEventListener("click", (e) => {
    e.preventDefault();
    cancelEditFrete();
  });

  document.getElementById("formFrete").addEventListener("submit", async (e) => {
    e.preventDefault();
    const referencia = document.getElementById("freteRef").value.trim();
    const cep = document.getElementById("freteCep").value.trim();
    const localidade = document.getElementById("freteLocalidade").value.trim();
    const valorNFraw = document.getElementById("freteValorNF").value;
    const valorNF = valorNFraw ? parseFloat(valorNFraw) : null;
    const data = document.getElementById("freteData").value || todayISO();
    const obs = document.getElementById("freteObs").value.trim();

    if (!referencia) { toast("Informe a referência (NF ou pedido)."); return; }

    const rows = Array.from(document.querySelectorAll("#freteItens .item-row"));
    const cotacoesAntigas = editingFreteId ? (state.fretes.find(x => x.id === editingFreteId) || {}).cotacoes || [] : [];
    const cotacoes = [];
    for (const row of rows) {
      const transportadora = row.querySelector(".frete-transportadora").value.trim();
      const valorRaw = row.querySelector(".frete-valor").value;
      if (!transportadora && !valorRaw) continue;
      if (!transportadora || !valorRaw) { toast("Preencha transportadora e valor do frete em todas as linhas adicionadas."); return; }
      const existente = cotacoesAntigas.find(c => c.transportadora === transportadora);
      cotacoes.push({ id: existente ? existente.id : uid("cot"), transportadora, valorFrete: parseFloat(valorRaw) });
    }
    if (cotacoes.length === 0) { toast("Adicione ao menos uma transportadora cotada."); return; }

    if (editingFreteId) {
      const f = state.fretes.find(x => x.id === editingFreteId);
      const contratadaAindaExiste = cotacoes.some(c => c.id === (f ? f.contratadaId : null));
      const novaContratadaId = contratadaAindaExiste ? f.contratadaId : null;
      const { conflict, error, row } = await updateWithConflictCheck(
        "fretes", editingFreteId, editingFreteUpdatedAt,
        freteToRow({ id: editingFreteId, referencia, cep, localidade, valorNF, data, obs, cotacoes, contratadaId: novaContratadaId })
      );
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        cancelEditFrete();
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      if (f) Object.assign(f, freteFromRow(row));
      cancelEditFrete();
      renderFretes();
      toast("Cotação de frete atualizada.");
      return;
    }

    const novo = { id: uid("frete"), referencia, cep, localidade, valorNF, data, obs, cotacoes, contratadaId: null };
    const { data: inserido, error } = await sb.from("fretes").insert({ ...freteToRow(novo), created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao registrar cotação: " + error.message); return; }
    state.fretes.push(freteFromRow(inserido[0]));
    e.target.reset();
    document.getElementById("freteData").value = todayISO();
    resetFreteItens();
    renderFretes();
    toast("Cotação de frete registrada.");
  });

  document.getElementById("formProduto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = document.getElementById("prodCodigo").value.trim();
    const medida = document.getElementById("prodMedida").value.trim();
    if (!codigo || !medida) return;
    if (getProduto(codigo)) { toast("Já existe um produto com esse código."); return; }

    const { error } = await sb.from("produtos").insert({ codigo, medida });
    if (error) { toast("Erro ao adicionar produto: " + error.message); return; }

    state.produtos.push({
      codigo, medida, createdAt: new Date().toISOString(),
      categoria: "", modelo: "", icIv: "", pr: "", cintas: "", capCarga: "", psi: "",
      sulcoMm: "", largBandaMm: "", pesoKg: "", fotoPath: null, fotoPath2: null
    });
    e.target.reset();
    renderProdutos();
    renderProdutoSelects();
    toast("Produto adicionado.");
  });

  document.getElementById("venCancelEdit").addEventListener("click", (e) => {
    e.preventDefault();
    cancelEditVenda();
  });

  document.getElementById("venClienteRetira").addEventListener("change", (e) => {
    const transp = document.getElementById("venTransportadora");
    const frete = document.getElementById("venValorFrete");
    const disabled = e.target.checked;
    transp.disabled = disabled;
    frete.disabled = disabled;
    if (disabled) { transp.value = ""; frete.value = ""; }
  });

  const comissaoBaseAtual = () => {
    // comissão sempre sai do valor da venda, nunca do valor recebido (Boleto Trademaster inclusive)
    return parseFloat(document.getElementById("venValor").value) || 0;
  };
  const atualizarComissaoCalc = () => {
    const pct = parseFloat(document.getElementById("venComissaoPct").value) || 0;
    document.getElementById("venComissaoCalc").value = formatMoney(comissaoBaseAtual() * pct / 100);
  };
  document.getElementById("venComissaoPct").addEventListener("input", atualizarComissaoCalc);
  document.getElementById("venValor").addEventListener("input", atualizarComissaoCalc);

  const atualizarDiferencaCalc = () => {
    const valorVenda = parseFloat(document.getElementById("venValor").value) || 0;
    const valorRecebido = parseFloat(document.getElementById("venValorRecebido").value) || 0;
    const diferenca = valorVenda - valorRecebido;
    const pct = valorVenda > 0 ? (diferenca / valorVenda * 100) : 0;
    document.getElementById("venDiferencaCalc").value = `${formatMoney(diferenca)} (${pct.toFixed(2).replace(".", ",")}%)`;
  };
  document.getElementById("venValor").addEventListener("input", atualizarDiferencaCalc);
  document.getElementById("venValorRecebido").addEventListener("input", atualizarDiferencaCalc);

  document.getElementById("venFormaPagamento").addEventListener("change", (e) => {
    const forma = e.target.value;
    const isTrademaster = forma === "BOLETO TRADEMASTER";
    const temParcelas = forma !== "" && forma !== "PIX";

    document.getElementById("rowParcelas").style.display = temParcelas ? "" : "none";
    if (!temParcelas) document.getElementById("venParcelas").value = "";

    document.getElementById("rowTrademaster").style.display = isTrademaster ? "" : "none";
    document.getElementById("venValorRecebido").required = isTrademaster;
    if (!isTrademaster) {
      document.getElementById("venValorRecebido").value = "";
      document.getElementById("venDiferencaCalc").value = "R$ 0,00 (0%)";
    } else {
      atualizarDiferencaCalc();
    }
    atualizarComissaoCalc();
  });

  document.getElementById("formVenda").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cliente = document.getElementById("venCliente").value.trim();
    const quantidade = parseInt(document.getElementById("venQtd").value, 10);
    const valorVenda = parseFloat(document.getElementById("venValor").value);
    const nfVenda = document.getElementById("venNF").value.trim();
    if (!cliente) { toast("Informe o cliente."); return; }
    if (!getCliente(cliente)) { toast("Cliente não encontrado. Cadastre-o primeiro em 'Novo cliente' abaixo."); return; }
    if (!quantidade || quantidade <= 0) { toast("Informe a quantidade de pneus vendidos."); return; }
    if (isNaN(valorVenda) || valorVenda < 0) { toast("Informe o valor da venda."); return; }
    if (!nfVenda) { toast("Informe o número da NF de venda."); return; }

    const formaPagamento = document.getElementById("venFormaPagamento").value;
    const isTrademaster = formaPagamento === "BOLETO TRADEMASTER";
    const temParcelas = formaPagamento !== "" && formaPagamento !== "PIX";
    const valorRecebidoRaw = document.getElementById("venValorRecebido").value;
    if (isTrademaster && !valorRecebidoRaw) { toast("Informe o valor recebido para Boleto Trademaster."); return; }
    const parcelasRaw = document.getElementById("venParcelas").value.trim();
    const valorRecebido = isTrademaster && valorRecebidoRaw ? parseFloat(valorRecebidoRaw) : null;

    const clienteRetira = document.getElementById("venClienteRetira").checked;
    const comissaoPctRaw = document.getElementById("venComissaoPct").value;
    const comissaoPercentual = comissaoPctRaw ? parseFloat(comissaoPctRaw) : 0;
    const comissaoBase = valorVenda; // comissão sempre sai do valor da venda, nunca do valor recebido
    const valorFreteRaw = document.getElementById("venValorFrete").value;
    const dadosVenda = {
      data: document.getElementById("venData").value || todayISO(),
      numeroPedido: document.getElementById("venPedido").value.trim(),
      numeroNFVenda: nfVenda,
      numeroNFEntrada: "",
      cliente,
      quantidadePneus: quantidade,
      valorVenda,
      formaPagamento,
      vendedor: document.getElementById("venVendedor").value.trim(),
      comissaoPercentual,
      comissao: comissaoBase * comissaoPercentual / 100,
      valorFrete: clienteRetira ? null : (valorFreteRaw ? parseFloat(valorFreteRaw) : null),
      transportadora: clienteRetira ? "Cliente retira" : (document.getElementById("venTransportadora").value.trim() || null),
      obs: document.getElementById("venObs").value.trim(),
      valorRecebido,
      parcelas: temParcelas && parcelasRaw ? parcelasRaw : null
    };

    if (editingVendaId) {
      const motivo = await motivoModal("Motivo da edição", "Descreva o motivo da alteração desta venda.");
      if (!motivo) return;
      const v = state.vendas.find(x => x.id === editingVendaId);
      const { conflict, error, row } = await updateWithConflictCheck(
        "vendas", editingVendaId, editingVendaUpdatedAt, vendaToRow({ id: editingVendaId, ...dadosVenda })
      );
      if (error) { toast("Erro ao salvar: " + error.message); return; }
      if (conflict) {
        cancelEditVenda();
        scheduleRefresh();
        toast(CONFLITO_MSG);
        return;
      }
      if (v) Object.assign(v, vendaFromRow(row));
      await registrarLog("vendas", editingVendaId, "edicao", motivo, `Venda NF ${nfVenda} · ${cliente}`);
      cancelEditVenda();
      renderFaturamentoDatalists();
      renderFaturamento();
      renderVendas();
      toast("Venda atualizada.");
      return;
    }

    const vendaDuplicada = state.vendas.find(v =>
      v.numeroNFVenda === nfVenda && v.cliente === cliente &&
      v.quantidadePneus === quantidade && v.valorVenda === valorVenda
    );
    if (vendaDuplicada) {
      toast(`Já existe uma venda idêntica: NF ${nfVenda}, cliente ${cliente}. Verifique se não é duplicada.`);
      return;
    }

    const novaVenda = { id: uid("ven"), ...dadosVenda };
    const { data: inserido, error } = await sb.from("vendas").insert({ ...vendaToRow(novaVenda), created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao registrar venda: " + error.message); return; }
    state.vendas.push(vendaFromRow(inserido[0]));
    e.target.reset();
    document.getElementById("venData").value = todayISO();
    document.getElementById("venTransportadora").disabled = false;
    document.getElementById("venValorFrete").disabled = false;
    document.getElementById("rowParcelas").style.display = "none";
    document.getElementById("rowTrademaster").style.display = "none";
    document.getElementById("venValorRecebido").required = false;
    document.getElementById("venDiferencaCalc").value = "R$ 0,00 (0%)";
    renderFaturamentoDatalists();
    renderFaturamento();
    renderVendas();
    toast("Venda registrada.");
  });

  document.getElementById("formCliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("cliNome").value.trim();
    const estado = document.getElementById("cliEstado").value;
    const cidade = document.getElementById("cliCidade").value.trim();
    if (!nome) return;
    if (getCliente(nome)) { toast("Já existe um cliente com esse nome."); return; }

    const novoCliente = {
      nome, estado, cidade,
      documento: document.getElementById("cliDocumento").value.trim(),
      razaoSocial: document.getElementById("cliRazaoSocial").value.trim(),
      telefone: document.getElementById("cliTelefone").value.trim(),
      email: document.getElementById("cliEmail").value.trim(),
      endereco: document.getElementById("cliEndereco").value.trim(),
      contato: document.getElementById("cliContato").value.trim(),
      tipoCliente: document.getElementById("cliTipoCliente").value || null
    };
    const { data: inserido, error } = await sb.from("clientes").insert(clienteToRow(novoCliente)).select();
    if (error) { toast("Erro ao adicionar cliente: " + error.message); return; }
    state.clientes.push(clienteFromRow(inserido[0]));
    e.target.reset();
    renderClientes();
    renderClienteSelect();
    toast("Cliente adicionado.");
  });
}

/* ---------------- relatórios ---------------- */

function filtrarPorPeriodo(lista, de, ate) {
  return lista.filter(item => {
    if (de && item.data < de) return false;
    if (ate && item.data > ate) return false;
    return true;
  });
}

function codigosResumo(codigos) {
  if (!Array.isArray(codigos)) return null;
  const total = state.produtos.length;
  if (codigos.length === total) return null; // todos selecionados = sem filtro, não precisa aparecer no resumo
  if (codigos.length === 0) return "Nenhum produto selecionado";
  if (codigos.length <= 6) return codigos.join(", ");
  return `${codigos.length} produtos selecionados`;
}

const REPORT_DEFS = {
  faturamento: {
    title: "Relatório de Faturamento",
    hasDateRange: true,
    build(de, ate) {
      const vendas = filtrarPorPeriodo(state.vendas, de, ate).slice().sort((a, b) => a.data.localeCompare(b.data));
      const columns = [
        { key: "data", label: "Data" },
        { key: "cliente", label: "Cliente" },
        { key: "nf", label: "NF" },
        { key: "vendedor", label: "Vendedor" },
        { key: "qtd", label: "Qtd. pneus", numeric: true },
        { key: "valor", label: "Valor da venda", money: true },
        { key: "comissao", label: "Comissão", money: true },
        { key: "frete", label: "Frete", money: true },
        { key: "transportadora", label: "Transportadora" }
      ];
      const rows = vendas.map(v => ({
        data: formatDateBR(v.data), cliente: v.cliente, nf: v.numeroNFVenda || "—", vendedor: v.vendedor || "—",
        qtd: v.quantidadePneus, valor: v.valorVenda, comissao: v.comissao || 0, frete: v.valorFrete || 0,
        transportadora: v.transportadora || "—"
      }));
      const totalFaturamento = vendas.reduce((a, v) => a + v.valorVenda, 0);
      const totalComissao = vendas.reduce((a, v) => a + (v.comissao || 0), 0);
      const totalFrete = vendas.reduce((a, v) => a + (v.valorFrete || 0), 0);
      const totalPneus = vendas.reduce((a, v) => a + v.quantidadePneus, 0);
      const summaryLines = [
        { label: "Vendas no período", value: fmt(vendas.length) },
        { label: "Pneus vendidos", value: fmt(totalPneus) + " un." },
        { label: "Comissão total", value: formatMoney(totalComissao) },
        { label: "Frete total", value: formatMoney(totalFrete) },
        { label: "Faturamento total", value: formatMoney(totalFaturamento), total: true }
      ];
      return { columns, rows, summaryLines };
    }
  },
  estoque: {
    title: "Relatório de Estoque Atual",
    hasDateRange: false,
    build(de, ate, filtro, codigos) {
      let produtos = listEstoque().slice().sort((a, b) => a.codigo.localeCompare(b.codigo));
      if (filtro === "disponivel") produtos = produtos.filter(p => p.saldo > 0);
      if (filtro === "zerado") produtos = produtos.filter(p => p.saldo <= 0);
      if (Array.isArray(codigos)) produtos = produtos.filter(p => codigos.includes(p.codigo));
      const columns = [
        { key: "codigo", label: "Código" },
        { key: "medida", label: "Medida" },
        { key: "entradas", label: "Entradas", numeric: true },
        { key: "saidas", label: "Saídas", numeric: true },
        { key: "saldo", label: "Saldo disponível", numeric: true }
      ];
      const rows = produtos.map(p => ({ codigo: p.codigo, medida: p.medida, entradas: p.entradas, saidas: p.saidas, saldo: p.saldo }));
      const totalSaldo = produtos.reduce((a, p) => a + p.saldo, 0);
      const filtroLabel = filtro === "disponivel" ? "Só com saldo disponível" : filtro === "zerado" ? "Só com saldo zerado" : "Todos";
      const summaryLines = [
        { label: "Filtro aplicado", value: filtroLabel },
        ...(codigosResumo(codigos) ? [{ label: "Códigos incluídos", value: codigosResumo(codigos) }] : []),
        { label: "Produtos incluídos", value: fmt(produtos.length) },
        { label: "Saldo total em estoque", value: fmt(totalSaldo) + " un.", total: true }
      ];
      return { columns, rows, summaryLines };
    }
  },
  movimentacoes: {
    title: "Relatório de Movimentações",
    hasDateRange: true,
    build(de, ate, filtro, codigos) {
      let movs = filtrarPorPeriodo(state.movimentos, de, ate).slice().sort((a, b) => a.data.localeCompare(b.data));
      if (Array.isArray(codigos)) movs = movs.filter(m => codigos.includes(m.codigo));
      const columns = [
        { key: "data", label: "Data" },
        { key: "tipo", label: "Tipo" },
        { key: "codigo", label: "Produto" },
        { key: "medida", label: "Medida" },
        { key: "quantidade", label: "Quantidade", numeric: true },
        { key: "numero", label: "NF/Pedido" },
        { key: "obs", label: "Obs." }
      ];
      const rows = movs.map(m => {
        const p = getProduto(m.codigo);
        return {
          data: formatDateBR(m.data), tipo: TIPO_LABEL[m.tipo] || m.tipo, codigo: m.codigo,
          medida: p ? p.medida : "(produto removido)", quantidade: m.quantidade,
          numero: m.numero || "—", obs: m.obs || "—"
        };
      });
      const totalEntradas = movs.filter(m => m.tipo === "entrada").reduce((a, m) => a + m.quantidade, 0);
      const totalSaidas = movs.filter(m => m.tipo !== "entrada").reduce((a, m) => a + m.quantidade, 0);
      const summaryLines = [
        ...(codigosResumo(codigos) ? [{ label: "Códigos incluídos", value: codigosResumo(codigos) }] : []),
        { label: "Movimentações no período", value: fmt(movs.length) },
        { label: "Total de entradas", value: fmt(totalEntradas) + " un." },
        { label: "Total de saídas", value: fmt(totalSaidas) + " un.", total: true }
      ];
      return { columns, rows, summaryLines };
    }
  },
  previsto: {
    title: "Relatório de Estoque Previsto",
    hasDateRange: false,
    build() {
      const previsoes = state.previsoes.slice().sort((a, b) => a.numeroProcesso.localeCompare(b.numeroProcesso));
      const columns = [
        { key: "processo", label: "Processo" },
        { key: "medidas", label: "Medidas" },
        { key: "status", label: "Status" },
        { key: "dataChegada", label: "Data de chegada" },
        { key: "obs", label: "Obs." }
      ];
      const rows = previsoes.map(p => ({
        processo: p.numeroProcesso,
        medidas: p.itens.map(it => `${it.codigo} (${fmt(it.quantidade)})`).join(", "),
        status: p.status,
        dataChegada: p.dataChegada ? formatDateBR(p.dataChegada) : "—",
        obs: p.obs || "—"
      }));
      const summaryLines = [
        { label: "Processos em andamento", value: fmt(previsoes.length), total: true }
      ];
      return { columns, rows, summaryLines };
    }
  }
};

function buildReportPrintHtml(def, de, ate, data) {
  const { columns, rows, summaryLines } = data;
  const periodoTxt = def.hasDateRange
    ? `Período: ${de ? formatDateBR(de) : "início"} até ${ate ? formatDateBR(ate) : "hoje"}`
    : `Situação em ${formatDateBR(todayISO())}`;

  const theadHtml = columns.map(c => `<th${c.numeric || c.money ? ' style="text-align:right;"' : ""}>${escapeHtml(c.label)}</th>`).join("");

  const tbodyHtml = rows.length
    ? rows.map(r => `<tr>${columns.map(c => {
        let val = r[c.key];
        if (val === undefined || val === null || val === "") val = "—";
        else if (c.money) val = formatMoney(val);
        else if (c.numeric) val = fmt(val);
        return `<td class="${c.numeric || c.money ? "num" : ""}">${escapeHtml(val)}</td>`;
      }).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" style="text-align:center;color:#888;">Nenhum dado encontrado.</td></tr>`;

  const summaryHtml = summaryLines.map(s => `
    <div class="print-report-summary-row ${s.total ? "total" : ""}">
      <span>${escapeHtml(s.label)}</span><span>${escapeHtml(s.value)}</span>
    </div>
  `).join("");

  return `
    <div class="print-report">
      <div class="print-report-header">
        <img src="assets/logo-light.png" class="print-report-logo" alt="Torun Pneus">
        <div class="print-report-meta">
          <h1>${escapeHtml(def.title)}</h1>
          <div class="print-report-sub">${escapeHtml(periodoTxt)}</div>
          <div class="print-report-sub">Gerado em ${formatDateBR(todayISO())} às ${new Date().toLocaleTimeString("pt-BR")}</div>
        </div>
      </div>
      <table class="print-report-table">
        <thead><tr>${theadHtml}</tr></thead>
        <tbody>${tbodyHtml}</tbody>
      </table>
      <div class="print-report-summary">${summaryHtml}</div>
    </div>
  `;
}

function gerarRelatorioPDF(reportKey, de, ate, filtro, codigo) {
  const def = REPORT_DEFS[reportKey];
  const data = def.build(de, ate, filtro, codigo);
  document.getElementById("reportPrintArea").innerHTML = buildReportPrintHtml(def, de, ate, data);
  window.print();
}

function gerarRelatorioExcel(reportKey, de, ate, filtro, codigo) {
  const def = REPORT_DEFS[reportKey];
  const { columns, rows } = def.build(de, ate, filtro, codigo);
  const wsData = [columns.map(c => c.label)].concat(rows.map(r => columns.map(c => r[c.key] ?? "")));
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.title.replace("Relatório de ", "").slice(0, 31));
  XLSX.writeFile(wb, `${def.title.replace(/\s+/g, "_")}_${todayISO()}.xlsx`);
}

function initRelatorios() {
  document.querySelectorAll(".report-card").forEach(card => {
    const reportKey = card.dataset.report;
    const deInput = card.querySelector(".report-de");
    const ateInput = card.querySelector(".report-ate");
    const filtroInput = card.querySelector(".report-filtro");
    const temCodigos = !!card.querySelector(".report-codigo-lista");
    card.querySelector(".report-btn-pdf").addEventListener("click", () => {
      const codigos = temCodigos ? relatorioCodigosSelecionados(card) : null;
      gerarRelatorioPDF(reportKey, deInput ? deInput.value : null, ateInput ? ateInput.value : null, filtroInput ? filtroInput.value : null, codigos);
    });
    card.querySelector(".report-btn-excel").addEventListener("click", () => {
      const codigos = temCodigos ? relatorioCodigosSelecionados(card) : null;
      gerarRelatorioExcel(reportKey, deInput ? deInput.value : null, ateInput ? ateInput.value : null, filtroInput ? filtroInput.value : null, codigos);
    });
  });
  initRelatorioCodigoFiltros();
}

function capturarGraficoParaImpressao(chart) {
  function lerCores() {
    const scales = chart.options.scales || {};
    const legend = chart.options.plugins && chart.options.plugins.legend;
    return {
      xTicks: scales.x && scales.x.ticks ? scales.x.ticks.color : undefined,
      xGrid: scales.x && scales.x.grid ? scales.x.grid.color : undefined,
      yTicks: scales.y && scales.y.ticks ? scales.y.ticks.color : undefined,
      yGrid: scales.y && scales.y.grid ? scales.y.grid.color : undefined,
      legend: legend && legend.labels ? legend.labels.color : undefined
    };
  }
  function aplicarCores(cores) {
    const scales = chart.options.scales || {};
    const legend = chart.options.plugins && chart.options.plugins.legend;
    if (scales.x && scales.x.ticks) scales.x.ticks.color = cores.xTicks;
    if (scales.x && scales.x.grid) scales.x.grid.color = cores.xGrid;
    if (scales.y && scales.y.ticks) scales.y.ticks.color = cores.yTicks;
    if (scales.y && scales.y.grid) scales.y.grid.color = cores.yGrid;
    if (legend && legend.labels) legend.labels.color = cores.legend;
  }

  const coresOriginais = lerCores();
  aplicarCores({ xTicks: "#333333", xGrid: "rgba(0,0,0,.15)", yTicks: "#333333", yGrid: "rgba(0,0,0,.15)", legend: "#333333" });
  chart.update("none");
  const imgData = chart.toBase64Image();

  aplicarCores(coresOriginais);
  chart.update("none");

  return imgData;
}

function buildDashPrintHtml(cardKey) {
  const def = DASH_CARD_DEFS.find(d => d.key === cardKey);
  const filtroSelect = document.getElementById("dashMesFiltro");
  const periodoTxt = filtroSelect.selectedOptions[0] ? filtroSelect.selectedOptions[0].textContent : "";

  const cardEl = document.querySelector(`[data-dashcard="${cardKey}"]`);
  const canvas = cardEl.querySelector("canvas");
  let conteudoHtml;
  if (canvas && dashCharts[canvas.id]) {
    const imgHtml = `<img src="${capturarGraficoParaImpressao(dashCharts[canvas.id])}" class="print-dash-img">`;
    const spec = dashChartSpecs[canvas.id];
    let tabelaHtml = "";
    if (spec && spec.labels && spec.labels.length) {
      const valueIsMoney = !(spec.opts && spec.opts.valueIsMoney === false);
      const total = spec.data.reduce((a, v) => a + (v || 0), 0);
      const linhasHtml = spec.labels.map((lbl, i) => {
        const val = spec.data[i] || 0;
        const pct = total ? (val / total * 100).toFixed(1) : "0.0";
        return `<tr><td>${escapeHtml(lbl)}</td><td class="num">${valueIsMoney ? formatMoney(val) : fmt(val)}</td><td class="num">${pct}%</td></tr>`;
      }).join("");
      tabelaHtml = `
        <table class="print-report-table" style="margin-top:18px;">
          <thead><tr><th>Categoria</th><th style="text-align:right;">Valor</th><th style="text-align:right;">%</th></tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
        <div class="print-report-summary">
          <div class="print-report-summary-row total"><span>Total</span><span>${valueIsMoney ? formatMoney(total) : fmt(total)}</span></div>
        </div>
      `;
    }
    conteudoHtml = imgHtml + tabelaHtml;
  } else {
    const tiles = Array.from(cardEl.querySelectorAll(".dash-stat-tile"));
    conteudoHtml = `<div class="print-dash-stats">` + tiles.map(t => `
      <div class="print-dash-stat">
        <div class="lbl">${escapeHtml(t.querySelector(".lbl").textContent)}</div>
        <div class="val">${escapeHtml(t.querySelector(".val").textContent)}</div>
      </div>
    `).join("") + `</div>`;
  }

  return `
    <div class="print-report">
      <div class="print-report-header">
        <img src="assets/logo-light.png" class="print-report-logo" alt="Torun Pneus">
        <div class="print-report-meta">
          <h1>${escapeHtml(def.label)}</h1>
          <div class="print-report-sub">Período: ${escapeHtml(periodoTxt)}</div>
          <div class="print-report-sub">Gerado em ${formatDateBR(todayISO())} às ${new Date().toLocaleTimeString("pt-BR")}</div>
        </div>
      </div>
      ${conteudoHtml}
    </div>
  `;
}

function gerarPdfDashboard(cardKey) {
  const area = document.getElementById("reportPrintArea");
  area.innerHTML = buildDashPrintHtml(cardKey);
  const img = area.querySelector(".print-dash-img");
  if (img && !img.complete) {
    img.addEventListener("load", () => window.print(), { once: true });
    img.addEventListener("error", () => window.print(), { once: true });
  } else {
    window.print();
  }
}

function initDashPdfButtons() {
  document.querySelectorAll(".dash-pdf-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      gerarPdfDashboard(btn.dataset.dashpdf);
    });
  });
}

/* ---------------- histórico de alterações ---------------- */

const LOG_TABELA_LABEL = {
  movimentos: "Movimentações", produtos: "Produtos", fretes: "Fretes",
  clientes: "Clientes", vendas: "Vendas", previsoes: "Estoque previsto", entregas: "Entregas"
};
const LOG_ACAO_LABEL = { edicao: "Edição", exclusao: "Exclusão" };

async function renderHistorico() {
  const search = (document.getElementById("logSearch").value || "").trim().toLowerCase();
  const tabela = document.getElementById("logFiltroTabela").value;
  const acao = document.getElementById("logFiltroAcao").value;
  const de = document.getElementById("logDe").value;
  const ate = document.getElementById("logAte").value;
  const motivo = document.getElementById("logFiltroMotivo").value;

  let query = sb.from("log_alteracoes").select("*").order("created_at", { ascending: false }).limit(300);
  if (tabela !== "todos") query = query.eq("tabela", tabela);
  if (acao !== "todos") query = query.eq("acao", acao);
  if (de) query = query.gte("created_at", de);
  if (ate) query = query.lte("created_at", ate + "T23:59:59");
  if (motivo !== "todos") query = query.eq("motivo", motivo);

  const { data, error } = await query;
  if (error) { toast("Erro ao carregar histórico: " + error.message); return; }

  let rows = data || [];

  const usuarioSelect = document.getElementById("logFiltroUsuario");
  const usuarioAnterior = usuarioSelect.value;
  const usuariosUnicos = Array.from(new Set(rows.map(r => r.user_email).filter(Boolean))).sort();
  usuarioSelect.innerHTML = `<option value="todos">Todos os usuários</option>` +
    usuariosUnicos.map(u => `<option value="${escapeAttr(u)}">${escapeHtml(u)}</option>`).join("");
  usuarioSelect.value = usuariosUnicos.includes(usuarioAnterior) ? usuarioAnterior : "todos";
  if (usuarioSelect.value !== "todos") {
    rows = rows.filter(r => r.user_email === usuarioSelect.value);
  }

  if (search) {
    rows = rows.filter(r => [r.descricao, r.motivo, r.user_email, r.tabela].join(" ").toLowerCase().includes(search));
  }

  const tbody = document.getElementById("logTbody");
  const empty = document.getElementById("logEmpty");
  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = rows.map(r => {
    const dt = new Date(r.created_at);
    const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `
      <tr>
        <td class="mono">${formatDateBR(r.created_at.slice(0, 10))} ${hora}</td>
        <td>${escapeHtml(r.user_email || "—")}</td>
        <td>${escapeHtml(LOG_TABELA_LABEL[r.tabela] || r.tabela)}</td>
        <td><span class="badge ${r.acao === "exclusao" ? "log-exclusao" : "log-edicao"}">${LOG_ACAO_LABEL[r.acao] || r.acao}</span></td>
        <td>${escapeHtml(r.descricao || "—")}</td>
        <td class="muted">${escapeHtml(r.motivo)}</td>
      </tr>
    `;
  }).join("");
}

function initHistorico() {
  const motivoSelect = document.getElementById("logFiltroMotivo");
  document.querySelectorAll("#motivoSugestoes optgroup").forEach(og => motivoSelect.appendChild(og.cloneNode(true)));

  document.getElementById("logSearch").addEventListener("input", renderHistorico);
  document.getElementById("logFiltroTabela").addEventListener("change", renderHistorico);
  document.getElementById("logFiltroAcao").addEventListener("change", renderHistorico);
  document.getElementById("logFiltroUsuario").addEventListener("change", renderHistorico);
  document.getElementById("logFiltroMotivo").addEventListener("change", renderHistorico);
  document.getElementById("logDe").addEventListener("change", renderHistorico);
  document.getElementById("logAte").addEventListener("change", renderHistorico);
}

/* ---------------- backup / reset ---------------- */

function initBackupControls() {
  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-estoque-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado.");
  });

  document.getElementById("btnImport").addEventListener("click", () => {
    toast("Importar backup ainda não está disponível — os dados agora ficam no servidor, compartilhados por todos.");
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    toast("Restaurar dados iniciais ainda não está disponível — os dados agora ficam no servidor, compartilhados por todos.");
  });
}

async function refreshAll() {
  await loadState();
  renderProdutoSelects();
  const activeBtn = document.querySelector(".nav-item.active");
  setView(activeBtn ? activeBtn.dataset.view : "estoque");
}

/* ---------------- realtime ---------------- */

const REALTIME_TABLES = [
  { table: "produtos", key: "codigo", fromRow: produtoFromRow },
  { table: "produtos_precos", key: "id", fromRow: precoFromRow },
  { table: "movimentos", key: "id", fromRow: movimentoFromRow },
  { table: "fretes", key: "id", fromRow: freteFromRow },
  { table: "clientes", key: "nome", fromRow: clienteFromRow },
  { table: "vendas", key: "id", fromRow: vendaFromRow },
  { table: "previsoes", key: "id", fromRow: previstoFromRow },
  { table: "entregas", key: "id", fromRow: entregaFromRow }
];

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAll, 200);
}

let realtimeChannel = null;
let realtimeReconnectTimer = null;
let realtimeReconnectTentativas = 0;

// Rede de segurança: mesmo com o Realtime saudável, se ele ficar minutos sem avisar
// nenhuma mudança (rede instável, aba em segundo plano, etc.) os dados podem ficar
// parados na tela -- então recarrega tudo do servidor periodicamente, independente
// do estado da conexão em tempo real.
const REALTIME_FALLBACK_REFRESH_MS = 5 * 60 * 1000;
let realtimeFallbackTimer = null;
function iniciarFallbackRefresh() {
  clearInterval(realtimeFallbackTimer);
  realtimeFallbackTimer = setInterval(refreshAll, REALTIME_FALLBACK_REFRESH_MS);
}

function subscribeRealtime() {
  clearTimeout(realtimeReconnectTimer);
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  const channel = sb.channel("estoque-changes");
  realtimeChannel = channel;
  REALTIME_TABLES.forEach(({ table, key, fromRow }) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const list = state[table];
      if (payload.eventType === "DELETE") {
        state[table] = list.filter(x => x[key] !== payload.old[key]);
      } else {
        const row = fromRow(payload.new);
        const idx = list.findIndex(x => x[key] === row[key]);
        if (idx === -1) list.push(row);
        else list[idx] = row;
      }
      scheduleRefresh();
    });
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      realtimeReconnectTentativas = 0;
      console.log("Realtime conectado — atualizações automáticas ativas.");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      // Backoff exponencial (5s, 10s, 20s... até 60s) em vez de martelar toda hora --
      // evita sobrecarregar uma conexão já instável. Zera de volta pra 5s assim que reconectar.
      const espera = Math.min(60000, 5000 * Math.pow(2, realtimeReconnectTentativas));
      realtimeReconnectTentativas++;
      console.error(`Realtime desconectado: ${status} — tentando reconectar em ${Math.round(espera / 1000)}s.`);
      realtimeReconnectTimer = setTimeout(subscribeRealtime, espera);
    }
  });
}

/* ---------------- init ---------------- */

async function init() {
  await loadState();

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  ["estoqueSearch", "estoqueFiltro"].forEach(id =>
    document.getElementById(id).addEventListener("input", renderEstoque)
  );
  document.getElementById("estoqueFiltro").addEventListener("change", renderEstoque);

  ["movSearch", "movFiltroTipo", "movFiltroDe", "movFiltroAte"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderMovimentos);
    document.getElementById(id).addEventListener("change", renderMovimentos);
  });

  document.getElementById("prodSearch").addEventListener("input", renderProdutos);
  document.getElementById("freteSearch").addEventListener("input", renderFretes);
  document.getElementById("cliSearch").addEventListener("input", renderClientes);
  document.getElementById("venSearch").addEventListener("input", () => { vendasMostrarTodas = false; renderVendas(); });
  ["venFiltroVendedor", "venFiltroFormaPagamento", "venFiltroDe", "venFiltroAte"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => { vendasMostrarTodas = false; renderVendas(); });
  });
  document.getElementById("btnVenMostrarMais").addEventListener("click", () => {
    vendasMostrarTodas = !vendasMostrarTodas;
    renderVendas();
  });
  document.getElementById("fatMesFiltro").addEventListener("change", renderFaturamento);
  document.getElementById("dashMesFiltro").addEventListener("change", renderDashboard);
  document.getElementById("prevSearch").addEventListener("input", renderPrevistos);
  document.getElementById("prevFiltroStatus").addEventListener("change", renderPrevistos);

  document.getElementById("chartModalClose").addEventListener("click", closeChartModal);
  document.getElementById("chartModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "chartModalOverlay") closeChartModal();
  });

  document.getElementById("processoModalClose").addEventListener("click", closeProcessoModal);
  document.getElementById("processoModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "processoModalOverlay") closeProcessoModal();
  });

  document.getElementById("clienteModalClose").addEventListener("click", closeClienteModal);
  document.getElementById("btnEditarCliente").addEventListener("click", abrirEdicaoCliente);
  document.getElementById("btnCancelarEdicaoCliente").addEventListener("click", cancelarEdicaoCliente);
  document.getElementById("formEditarCliente").addEventListener("submit", (e) => {
    e.preventDefault();
    salvarEdicaoCliente();
  });
  document.getElementById("clienteModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "clienteModalOverlay") closeClienteModal();
  });

  document.getElementById("btnMesclarClientes").addEventListener("click", abrirMesclarClientesModal);
  document.getElementById("mesclarClientesModalClose").addEventListener("click", fecharMesclarClientesModal);
  document.getElementById("mesclarClientesCancelar").addEventListener("click", fecharMesclarClientesModal);
  document.getElementById("mesclarClientesConfirmar").addEventListener("click", confirmarMesclagemClientes);
  document.getElementById("mesclarClientesModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "mesclarClientesModalOverlay") fecharMesclarClientesModal();
  });

  document.getElementById("btnAdicionarTag").addEventListener("click", async () => {
    const input = document.getElementById("clienteNovaTag");
    await adicionarTagCliente(currentClienteModalNome, input.value);
    input.value = "";
  });
  document.getElementById("clienteNovaTag").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btnAdicionarTag").click(); }
  });
  document.getElementById("btnAdicionarNota").addEventListener("click", async () => {
    const textarea = document.getElementById("clienteNovaNota");
    await adicionarNotaCliente(currentClienteModalNome, textarea.value);
    textarea.value = "";
  });

  initForms();
  initBackupControls();
  initMotivoSugestoes();
  initDashFiltro();
  initDashPdfButtons();
  initRelatorios();
  initHistorico();
  initEntregas();
  initCatalogo();
  initThemeToggle();
  initFontSizeToggle();
  initEstoqueResize();
  initMobileMenu();
  initCollapsibleCards();
  initKanbanColumnsCollapse();
  initNavGroups();
  initMinhasConfiguracoes();
  initAdministracao();
  const btnCentralAjuda = document.getElementById("btnCentralAjuda");
  if (btnCentralAjuda) btnCentralAjuda.addEventListener("click", () => toast("Central de ajuda ainda não está disponível — fale com o time por enquanto."));

  setView(primeiraViewPermitida());
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
      if (document.getElementById("view-dashboard").classList.contains("active")) {
        renderDashboard();
      }
      if (currentUser) {
        sb.from("user_preferences").upsert({ user_id: currentUser.id, tema: choice }, { onConflict: "user_id" })
          .then(({ error }) => { if (error) console.error("Erro ao salvar tema:", error); });
      }
    });
  });
}

function applyFontSizeChoice(choice) {
  if (choice === "pequeno" || choice === "grande") {
    document.documentElement.setAttribute("data-font-size", choice);
  } else {
    document.documentElement.removeAttribute("data-font-size");
  }
  document.querySelectorAll(".fontsize-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.fontsizeChoice === choice);
  });
}

function initFontSizeToggle() {
  const salvo = localStorage.getItem(FONT_SIZE_KEY) || "medio";
  applyFontSizeChoice(salvo);
  document.querySelectorAll(".fontsize-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.fontsizeChoice;
      localStorage.setItem(FONT_SIZE_KEY, choice);
      applyFontSizeChoice(choice);
      currentUserTamanhoLetra = choice;
      if (currentUser) {
        sb.from("user_preferences").upsert({ user_id: currentUser.id, tamanho_letra: choice }, { onConflict: "user_id" })
          .then(({ error }) => { if (error) console.error("Erro ao salvar tamanho da letra:", error); });
      }
    });
  });
}

/* ---------------- minhas configurações ---------------- */

function computeUserInitials(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return "?";
}

function updateSidebarUserChip() {
  const nome = currentUserNome || (currentUser && currentUser.email) || "";
  const nameEl = document.getElementById("sidebarUserName");
  const roleEl = document.getElementById("sidebarUserRole");
  const avatarEl = document.getElementById("sidebarUserAvatar");
  if (nameEl) nameEl.textContent = nome;
  if (roleEl) {
    roleEl.textContent = currentUserIsAdmin ? "Administrador"
      : currentUserRole === "viewer" ? "Somente leitura"
      : currentUserRole === "representante" ? "Representante"
      : "Editor";
  }
  if (avatarEl) {
    const url = fotoAvatarUsuarioUrl(currentUserAvatarPath);
    avatarEl.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="">` : "";
    if (!url) avatarEl.textContent = computeUserInitials(nome);
  }
}

function renderMinhasConfigAvatarPreview() {
  const el = document.getElementById("minhasConfigAvatarPreview");
  if (!el) return;
  const url = fotoAvatarUsuarioUrl(currentUserAvatarPath);
  el.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="">` : "";
  if (!url) el.textContent = computeUserInitials(currentUserNome || (currentUser && currentUser.email) || "");
}

function abrirMinhasConfiguracoesModal() {
  document.getElementById("minhasConfigNome").value = currentUserNome || "";
  document.getElementById("minhasConfigTelefone").value = currentUserTelefone || "";
  document.getElementById("minhasConfigEmail").textContent = (currentUser && currentUser.email) || "";
  document.getElementById("minhasConfigNotifProposta").checked = currentUserNotifNovaProposta;
  renderMinhasConfigAvatarPreview();
  document.getElementById("minhasConfigOverlay").classList.add("show");
}

function closeMinhasConfiguracoesModal() {
  document.getElementById("minhasConfigOverlay").classList.remove("show");
}

async function salvarPerfil() {
  const novoNome = document.getElementById("minhasConfigNome").value.trim();
  const novoTelefone = document.getElementById("minhasConfigTelefone").value.trim();
  if (!novoNome) { toast("O nome não pode ficar em branco."); return; }
  const { error } = await sb.rpc("atualizar_meu_perfil", { novo_nome: novoNome, novo_telefone: novoTelefone || null });
  if (error) { toast("Erro ao salvar perfil: " + error.message); return; }
  currentUserNome = novoNome;
  currentUserTelefone = novoTelefone;
  updateSidebarUserChip();
  toast("Perfil atualizado.");
}

async function salvarNotificacaoPreferencia(checked) {
  currentUserNotifNovaProposta = checked;
  const { error } = await sb.from("user_preferences").upsert(
    { user_id: currentUser.id, notif_nova_proposta: checked }, { onConflict: "user_id" }
  );
  if (error) toast("Erro ao salvar preferência: " + error.message);
}

async function uploadAvatar(file) {
  if (!currentUser) return;
  if (file.size > 5 * 1024 * 1024) { toast("Imagem muito grande (máx. 5 MB)."); return; }
  const pathAntigo = currentUserAvatarPath;
  const path = `${currentUser.id}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: uploadError } = await sb.storage.from(AVATAR_BUCKET).upload(path, file);
  if (uploadError) { toast("Erro ao enviar foto: " + uploadError.message); return; }
  const { error } = await sb.rpc("atualizar_meu_avatar", { novo_avatar_path: path });
  if (error) { toast("Erro ao salvar foto: " + error.message); return; }
  currentUserAvatarPath = path;
  if (pathAntigo) await sb.storage.from(AVATAR_BUCKET).remove([pathAntigo]);
  renderMinhasConfigAvatarPreview();
  updateSidebarUserChip();
  toast("Foto de perfil atualizada.");
}

function initMinhasConfiguracoes() {
  document.getElementById("sidebarUser").addEventListener("click", abrirMinhasConfiguracoesModal);
  document.getElementById("minhasConfigCancelar").addEventListener("click", closeMinhasConfiguracoesModal);
  document.getElementById("minhasConfigOverlay").addEventListener("click", (e) => {
    if (e.target.id === "minhasConfigOverlay") closeMinhasConfiguracoesModal();
  });
  document.getElementById("btnMinhasConfigAvatar").addEventListener("click", () => {
    document.getElementById("minhasConfigAvatarInput").click();
  });
  document.getElementById("minhasConfigAvatarInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await uploadAvatar(file);
  });
  document.getElementById("minhasConfigSalvar").addEventListener("click", async () => {
    await salvarPerfil();
    await salvarNotificacaoPreferencia(document.getElementById("minhasConfigNotifProposta").checked);
    closeMinhasConfiguracoesModal();
  });
}

/* ---------------- administração (admin) ---------------- */

const ADMIN_VIEW_DEFS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "estoque", label: "Estoque" },
  { key: "previsto", label: "Estoque Previsto" },
  { key: "movimentacoes", label: "Movimentações" },
  { key: "faturamento", label: "Faturamento" },
  { key: "clientes", label: "Clientes" },
  { key: "produtos", label: "Produtos" },
  { key: "catalogo", label: "Catálogo" },
  { key: "fretes", label: "Fretes" },
  { key: "entregas", label: "Entregas" },
  { key: "relatorios", label: "Relatórios" },
  { key: "historico", label: "Histórico" }
];
const ADMIN_ROLE_LABEL = { editor: "Editor", viewer: "Somente leitura", representante: "Representante" };

let adminUsuarios = [];
let adminEditingUserId = null;

async function renderAdministracao() {
  if (configuracoesSite) {
    document.getElementById("configEstoqueBaixoLimite").value = configuracoesSite.estoque_baixo_limite;
    document.getElementById("configPropostaValidadeDias").value = configuracoesSite.proposta_validade_dias;
  }
  const { data, error } = await sb.from("user_roles").select("*").order("email");
  if (error) { toast("Erro ao carregar usuários: " + error.message); return; }
  adminUsuarios = data || [];
  renderAdminUsuariosTable();
}

function renderAdminUsuariosTable() {
  document.getElementById("adminUsuariosTbody").innerHTML = adminUsuarios.map(u => `
    <tr>
      <td>${escapeHtml(u.nome || "—")}</td>
      <td class="mono">${escapeHtml(u.email || "—")}</td>
      <td>${escapeHtml(ADMIN_ROLE_LABEL[u.role] || u.role || "—")}</td>
      <td>${u.is_admin ? "Sim" : "—"}</td>
      <td><button type="button" class="btn small outline" data-editaruser="${escapeAttr(u.user_id)}">Editar</button></td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-editaruser]").forEach(btn => {
    btn.addEventListener("click", () => abrirUsuarioEditModal(btn.dataset.editaruser));
  });
}

function abrirUsuarioEditModal(userId) {
  const u = adminUsuarios.find(x => x.user_id === userId);
  if (!u) return;
  adminEditingUserId = userId;
  document.getElementById("usuarioEditNome").value = u.nome || "";
  document.getElementById("usuarioEditEmail").textContent = u.email || "—";
  document.getElementById("usuarioEditRole").value = u.role || "editor";
  document.getElementById("usuarioEditIsAdmin").checked = !!u.is_admin;
  document.getElementById("usuarioEditPodeAutorizar").checked = !!u.pode_autorizar_gerencia;
  const visibleViews = u.visible_views || null;
  document.getElementById("usuarioEditVisibleViewsLista").innerHTML = ADMIN_VIEW_DEFS.map(v => `
    <label class="dash-filter-item">
      <input type="checkbox" data-viewkey="${escapeAttr(v.key)}" ${(!visibleViews || visibleViews.includes(v.key)) ? "checked" : ""}>
      ${escapeHtml(v.label)}
    </label>
  `).join("");
  document.getElementById("usuarioEditModalOverlay").classList.add("show");
}

function closeUsuarioEditModal() {
  document.getElementById("usuarioEditModalOverlay").classList.remove("show");
  adminEditingUserId = null;
}

async function salvarUsuarioEdit() {
  if (!adminEditingUserId) return;
  const nome = document.getElementById("usuarioEditNome").value.trim();
  const role = document.getElementById("usuarioEditRole").value;
  const isAdmin = document.getElementById("usuarioEditIsAdmin").checked;
  const podeAutorizar = document.getElementById("usuarioEditPodeAutorizar").checked;
  const checkboxes = Array.from(document.querySelectorAll("#usuarioEditVisibleViewsLista input"));
  const marcados = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.viewkey);
  const visibleViews = marcados.length === checkboxes.length ? null : marcados; // todos marcados = sem restrição
  const payload = { nome: nome || null, role, is_admin: isAdmin, pode_autorizar_gerencia: podeAutorizar, visible_views: visibleViews };
  const { error } = await sb.from("user_roles").update(payload).eq("user_id", adminEditingUserId);
  if (error) { toast("Erro ao salvar usuário: " + error.message); return; }
  const u = adminUsuarios.find(x => x.user_id === adminEditingUserId);
  if (u) Object.assign(u, payload);
  renderAdminUsuariosTable();
  closeUsuarioEditModal();
  toast("Usuário atualizado.");
}

async function salvarConfiguracoesSite() {
  const limite = parseInt(document.getElementById("configEstoqueBaixoLimite").value, 10);
  const validade = parseInt(document.getElementById("configPropostaValidadeDias").value, 10);
  if (!(limite >= 0) || !(validade >= 1)) { toast("Valores inválidos."); return; }
  const { error } = await sb.from("configuracoes_site").update({ estoque_baixo_limite: limite, proposta_validade_dias: validade }).eq("id", true);
  if (error) { toast("Erro ao salvar configurações: " + error.message); return; }
  configuracoesSite = { ...configuracoesSite, estoque_baixo_limite: limite, proposta_validade_dias: validade };
  ESTOQUE_BAIXO_LIMITE = limite;
  atualizarAlertaEstoqueBaixo();
  toast("Configurações do site atualizadas.");
}

function initAdministracao() {
  document.getElementById("btnSalvarConfigSite").addEventListener("click", salvarConfiguracoesSite);
  document.getElementById("usuarioEditCancelar").addEventListener("click", closeUsuarioEditModal);
  document.getElementById("usuarioEditModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "usuarioEditModalOverlay") closeUsuarioEditModal();
  });
  document.getElementById("usuarioEditSalvar").addEventListener("click", salvarUsuarioEdit);
}

/* ---------------- menu mobile (gaveta lateral) ---------------- */

function setMobileMenu(open) {
  document.getElementById("sidebar").classList.toggle("open", open);
  document.getElementById("mobileMenuBackdrop").classList.toggle("show", open);
}

function initMobileMenu() {
  document.getElementById("mobileMenuBtn").addEventListener("click", () => setMobileMenu(true));
  document.getElementById("mobileMenuBackdrop").addEventListener("click", () => setMobileMenu(false));
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => setMobileMenu(false));
  });
}

/* ---------------- auth / boot ---------------- */

let appInitialized = false;

function showLogin(message) {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("appShell").style.display = "none";
  const erro = document.getElementById("loginErro");
  if (message) {
    erro.textContent = message;
    erro.style.display = "block";
  } else {
    erro.style.display = "none";
  }
}

async function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loadingScreen").style.display = "flex";
  updateSidebarUserChip();
  if (!appInitialized) {
    appInitialized = true;
    await init();
    subscribeRealtime();
    iniciarFallbackRefresh();
  }
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("appShell").style.display = "flex";
}

function initAuthUI() {
  document.getElementById("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;
    const btn = document.getElementById("loginSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Entrando...";
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    btn.disabled = false;
    btn.textContent = "Entrar";
    if (error) {
      showLogin("E-mail ou senha inválidos.");
      return;
    }
    currentUser = data.user;
    await showApp();
  });

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.reload();
  });
}

async function boot() {
  initAuthUI();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await showApp();
  } else {
    showLogin();
  }
}

document.addEventListener("DOMContentLoaded", boot);

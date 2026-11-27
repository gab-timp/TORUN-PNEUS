/* ---------------- Sem Venda: escolha do sistema, menu e telas ---------------- */
/* Carrega antes do app.js; usa currentUser*, setView, primeiraViewPermitida e
   currentUserRoleLabel do app.js, que só são resolvidos na hora da chamada. */

const SISTEMA_KEY = "torun_sistema_atual_v1";

function temAcessoSemVenda() {
  return currentUserIsAdmin || currentUserPodeAcessarSemVenda;
}

// Atacado e Encomenda são sistemas próprios (CRM, crm.js), liberados pelo papel no cadastro do usuário.
// Sem Venda segue como era: só admin ou quem tem a caixa "Pode acessar o Sem Venda".
const SISTEMAS_CRM = ["atacado", "encomenda"];

// sistemas que este usuário pode abrir (o varejo é de todos, menos de quem está com a chave do Torun desligada), na ordem dos cartões da tela de escolha
// Portal de pedidos do representante (pedido-representante.html): é outra página, então aqui ele aparece como um "sistema" que só leva até lá.
// Login de papel Representante usa o portal no lugar do Torun (Varejo); login do escritório com a caixa "Portal do representante" só ganha
// o cartão quando está com o Torun (Varejo) desligado (quem usa o Varejo continua entrando nele como sempre).
function portalNoLugarDoVarejo() {
  if (currentUserIsAdmin) return false;
  if (currentUserRole === "representante") return true;
  return typeof crmPodePortal !== "undefined" && crmPodePortal && typeof temAcessoVarejo === "function" && !temAcessoVarejo();
}

function irParaPortalRepresentante(substituir) {
  const destino = "pedido-representante.html";
  if (substituir) window.location.replace(destino); else window.location.href = destino;
}

function sistemasDisponiveis() {
  // login de representante (sem papel no CRM): só o sistema dele, com o painel dele; nada do varejo nem do Sem Venda
  if (typeof crmRepresentante !== "undefined" && crmRepresentante && !currentUserIsAdmin) return crmSistemasVisiveis();
  const lista = portalNoLugarDoVarejo() ? ["portal"] : (typeof temAcessoVarejo === "function" && !temAcessoVarejo() ? [] : ["varejo"]);
  if (temAcessoSemVenda()) lista.push("semvenda");
  const crm = crmSistemasVisiveis();
  ["encomenda", "atacado"].forEach(s => { if (crm.includes(s)) lista.push(s); });
  if (!lista.length) lista.push("varejo"); // sem nenhum sistema liberado: não deixa a pessoa numa tela vazia
  return lista;
}

function sistemaLembrado() {
  try { return sessionStorage.getItem(SISTEMA_KEY); } catch (e) { return null; }
}

function lembrarSistema(sistema) {
  try { sessionStorage.setItem(SISTEMA_KEY, sistema); } catch (e) { /* sem sessionStorage: pergunta de novo no próximo carregamento */ }
}

function esquecerSistema() {
  try { sessionStorage.removeItem(SISTEMA_KEY); } catch (e) { /* idem */ }
}

function aplicarSistema(sistema) {
  const semVenda = sistema === "semvenda";
  const crm = SISTEMAS_CRM.includes(sistema);
  lembrarSistema(sistema);
  document.body.classList.toggle("sistema-semvenda", semVenda);
  document.body.classList.toggle("sistema-crm", crm);
  document.getElementById("navVarejo").style.display = semVenda || crm ? "none" : "";
  document.getElementById("navSemVenda").style.display = semVenda ? "" : "none";
  document.getElementById("navCrm").style.display = crm ? "" : "none";
  document.getElementById("brandSub").textContent = semVenda ? "Sem Venda" : crm ? CRM_SISTEMAS[sistema] : "Controle de Estoque";
  document.getElementById("btnTrocarSistema").style.display = sistemasDisponiveis().length > 1 ? "" : "none";
  document.title = semVenda ? "TORUN PNEUS · Sem Venda" : crm ? `TORUN PNEUS · ${CRM_SISTEMAS[sistema]}` : "TORUN PNEUS · Painel de Controle";
  if (crm) crmEntrarNoSistema(sistema);
  setView(semVenda ? "sv-dashboard" : crm ? crmViewInicial() : primeiraViewPermitida());
}

function mostrarEscolhaSistema() {
  // só aparecem os cartões dos sistemas que o usuário pode abrir
  const disponiveis = sistemasDisponiveis();
  document.querySelectorAll("[data-sistema]").forEach(btn => {
    btn.style.display = disponiveis.includes(btn.dataset.sistema) ? "" : "none";
  });
  document.getElementById("sistemaCards").classList.toggle("muitos", disponiveis.length > 2);
  setMobileMenu(false);
  document.getElementById("appShell").style.display = "none";
  document.title = "TORUN PNEUS · Painel de Controle";
  document.getElementById("sistemaUsuario").textContent =
    `${currentUserNome || (currentUser && currentUser.email) || ""} · ${currentUserRoleLabel()}`;
  document.getElementById("sistemaScreen").style.display = "flex";
}

function escolherSistema(sistema) {
  if (sistema === "portal") { irParaPortalRepresentante(false); return; }
  document.getElementById("sistemaScreen").style.display = "none";
  document.getElementById("appShell").style.display = "flex";
  aplicarSistema(sistema);
}

// vindo do botão "Trocar de sistema" do portal (?escolher=1): mostra a escolha em vez de reabrir o último sistema
function tratarParametroEscolher() {
  try {
    if (new URLSearchParams(window.location.search).get("escolher")) {
      esquecerSistema();
      window.history.replaceState(null, "", window.location.pathname);
    }
  } catch (e) { /* sem URLSearchParams/history: segue o fluxo normal */ }
}

/* ---- entrada rápida ----
   O carregamento de tudo (estoque, vendas, clientes...) é o que demora depois do login. Quem só vai para o portal e quem vai ver a
   tela de escolha não precisa esperar por isso: basta o perfil (uma consulta só). Aqui o perfil é lido primeiro e então:
   - só o portal liberado: vai direto para ele, sem carregar mais nada;
   - mais de um sistema (e nenhum lembrado nesta aba): mostra a tela de escolha na hora e carrega o resto por trás; quem clicar num
     cartão antes de terminar de carregar vê a tela de carregando e entra assim que acabar (o portal abre na hora, não depende dos dados);
   - qualquer outro caso (ou se o perfil não carregar): devolve false e o fluxo de sempre segue.
   `carregarResto` é a função que faz o carregamento completo. */
async function carregarPerfilParaEntrada() {
  const { data, error } = await sb.from("user_roles").select("*").eq("user_id", currentUser.id).maybeSingle();
  if (error || !data) return false;
  currentUserRole = data.role || "editor";
  currentUserIsAdmin = !!data.is_admin;
  currentUserPodeAcessarSemVenda = !!data.pode_acessar_sem_venda;
  currentUserNome = data.nome || currentUser.email;
  crmDefinirPerfil(data);
  return true;
}

async function entradaRapida(carregarResto) {
  try {
    if (!(await carregarPerfilParaEntrada())) return false;
  } catch (e) { return false; }
  tratarParametroEscolher();
  const disp = sistemasDisponiveis();
  if (disp.length === 1 && disp[0] === "portal") { irParaPortalRepresentante(true); return true; }
  const lembrado = sistemaLembrado();
  if (disp.length < 2 || (lembrado && disp.includes(lembrado))) return false;

  let pronto = false;
  let pendente = null;
  const cards = document.getElementById("sistemaCards");
  const cliqueCedo = (e) => {
    const btn = e.target.closest("[data-sistema]");
    if (!btn || pronto) return; // depois de pronto quem responde são os cliques normais (initSistemas)
    if (btn.dataset.sistema === "portal") { irParaPortalRepresentante(false); return; }
    pendente = btn.dataset.sistema;
    document.getElementById("sistemaScreen").style.display = "none";
    document.getElementById("loadingScreen").style.display = "flex";
  };
  cards.addEventListener("click", cliqueCedo);
  document.getElementById("loadingScreen").style.display = "none";
  mostrarEscolhaSistema();

  Promise.resolve().then(carregarResto).then(() => {
    pronto = true;
    cards.removeEventListener("click", cliqueCedo);
    if (pendente) {
      document.getElementById("loadingScreen").style.display = "none";
      escolherSistema(pendente);
    }
  }, (err) => {
    console.error("Erro ao carregar o sistema:", err);
    pronto = true;
    cards.removeEventListener("click", cliqueCedo);
    document.getElementById("loadingScreen").style.display = "none";
    mostrarEscolhaSistema();
    toast("Não foi possível carregar os dados. Recarregue a página.");
  });
  return true;
}

// Quem só tem o varejo (sem Sem Venda, Atacado ou Encomenda) entra direto nele, como sempre foi.
function entrarNoSistema() {
  const shell = document.getElementById("appShell");
  const disponiveis = sistemasDisponiveis();
  tratarParametroEscolher();
  if (disponiveis.length <= 1) {
    // só o portal liberado (representante comum): o link normal leva direto à tela de pedido
    if (disponiveis[0] === "portal") { irParaPortalRepresentante(true); return; }
    shell.style.display = "flex";
    if (disponiveis[0] && disponiveis[0] !== "varejo") aplicarSistema(disponiveis[0]); // representante: abre direto o sistema dele
    return;
  }
  const lembrado = sistemaLembrado();
  if (lembrado && disponiveis.includes(lembrado)) {
    shell.style.display = "flex";
    aplicarSistema(lembrado);
    return;
  }
  mostrarEscolhaSistema();
}

function initSistemas() {
  document.querySelectorAll("[data-sistema]").forEach(btn => {
    btn.addEventListener("click", () => escolherSistema(btn.dataset.sistema));
  });
  document.getElementById("btnTrocarSistema").addEventListener("click", mostrarEscolhaSistema);
  initSemVendaTelas();
  initCrmTelas();
}

/* ---------------- Sem Venda, etapa 2: Produtos e Estoque Previsto ---------------- */
/* Dados próprios (tabelas sv_produtos e sv_previsoes), carregados ao abrir a tela. Usa os
   helpers do app.js (sb, toast, confirmModal, escapeHtml, fmt, uid, updateWithConflictCheck,
   statusBadgeClass, SV_PREVISTO_STATUS, CATEGORIA_LABEL, CONFLITO_MSG). Sem log de histórico:
   o log do sistema é legível por quem não tem acesso ao Sem Venda. */

const SV_ARMAZENS = ["Nguedes", "RF", "ZF", "Multilog"];
// nome que o servidor põe no lugar do cliente, nas reservas de clientes de outro executivo (sql/executivo_carteira_propria_sem_venda.sql)
const SV_CLIENTE_MASCARADO = "Outro executivo";
const svReservaMascarada = (r) => r.cliente === SV_CLIENTE_MASCARADO;
const SV_SEM_REPRESENTANTE = "__sem"; // valor da opção "Sem representante" (no banco, representante fica vazio)
const SV_RECARGA_MIN_MS = 3000;

const SV_FOTOS_BUCKET = "sem-venda-fotos";
const SV_FOTO_MAX_BYTES = 5 * 1024 * 1024;

const svState = { produtos: [], previsoes: [], reservas: [] };
let svUltimaCarga = 0;
let svEditandoProduto = null;
let svEditandoPrevistoId = null;
let svEditandoPrevistoUpdatedAt = null;
let svFotoPendente = null;
let svOpcoesReserva = [];

function svProdutoFromRow(r) {
  return {
    codigo: r.codigo, medida: r.medida, marca: r.marca || "", modelo: r.modelo || "",
    categoria: r.categoria || "", carcaca: r.carcaca || "", situacao: r.situacao || "ATIVO",
    icIv: r.ic_iv || "", pr: r.pr || "", capCarga: r.cap_carga || "", fotoPath: r.foto_path || null,
    preco: r.preco_proposta === null || r.preco_proposta === undefined ? null : Number(r.preco_proposta)
  };
}

function svReservaFromRow(r) {
  return {
    id: r.id, codigo: r.codigo, quantidade: Number(r.quantidade), cliente: r.cliente,
    // reserva feita antes da mudança (ou por tela antiga) só tem o responsável: ele vale como vendedor interno
    vendedorInterno: r.vendedor_interno || r.responsavel || "",
    representante: r.representante || null, // vazio = "Sem representante"
    armazem: r.armazem === null || r.armazem === undefined ? null : r.armazem,
    previsaoId: r.previsao_id || null, situacao: r.situacao, data: r.data || "", obs: r.obs || "",
    condicaoPagamento: r.condicao_pagamento || "", // condição em texto da lista antiga: só leitura, mostrada como "condição antiga"
    formaPagamento: r.forma_pagamento || "",
    unidadeNegocio: r.unidade_negocio || "",
    divisaoPagamento: Array.isArray(r.divisao_pagamento) ? r.divisao_pagamento : null,
    valorRecebido: r.valor_recebido === null || r.valor_recebido === undefined ? null : Number(r.valor_recebido),
    tipoTransporte: r.tipo_transporte || "", transportadora: r.transportadora || "", clienteRetira: r.cliente_retira === true,
    // sql/sem_venda_pedido_parcial.sql: pedido total (padrão) ou parcial; a venda parcial divide a reserva em duas linhas
    tipoPedido: r.tipo_pedido === "PARCIAL" ? "PARCIAL" : "TOTAL",
    pedidoTotal: r.pedido_total === null || r.pedido_total === undefined ? null : Number(r.pedido_total),
    reservaOrigemId: r.reserva_origem_id || null, liberada: !!r.liberada,
    // preço e dia gravados no "Confirmar venda"; vazios nas vendas confirmadas antes dessa mudança
    precoUnitario: r.preco_unitario === null || r.preco_unitario === undefined ? null : Number(r.preco_unitario),
    vendidoEm: r.vendido_em || "",
    pedidoId: r.pedido_id || null, // liga os produtos de um mesmo pedido (sql/sem_venda_pedido_varios_produtos.sql)
    numeroPedido: r.numero_pedido === null || r.numero_pedido === undefined ? null : Number(r.numero_pedido), // sql/sem_venda_pedido_documento.sql
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svReservaToRow(r) {
  return {
    ...(r.pedidoId ? { pedido_id: r.pedidoId } : {}), // so vai quando o pedido tem 2+ produtos: reserva simples nao depende do SQL novo
    id: r.id, codigo: r.codigo, quantidade: r.quantidade, cliente: r.cliente,
    vendedor_interno: r.vendedorInterno, representante: r.representante || null,
    armazem: r.previsaoId ? null : (r.armazem || ""), previsao_id: r.previsaoId || null,
    situacao: r.situacao, data: r.data, obs: r.obs || null, forma_pagamento: r.formaPagamento || null, unidade_negocio: r.unidadeNegocio || null,
    tipo_transporte: r.tipoTransporte || null, transportadora: r.transportadora || null,
    ...(r.clienteRetira ? { cliente_retira: true } : {}), // só vai quando marcado: reserva comum não depende do SQL novo
    tipo_pedido: r.tipoPedido === "PARCIAL" ? "PARCIAL" : "TOTAL"
  };
}

function svFotoUrl(path) {
  if (!path) return null;
  const { data } = sb.storage.from(SV_FOTOS_BUCKET).getPublicUrl(path);
  return data ? data.publicUrl : null;
}

function svProdutoToRow(p) {
  return {
    codigo: p.codigo, medida: p.medida, marca: p.marca || null, modelo: p.modelo || null,
    categoria: p.categoria || null, carcaca: p.carcaca || null, situacao: p.situacao || "ATIVO",
    ic_iv: p.icIv || null, pr: p.pr || null, cap_carga: p.capCarga || null,
    preco_proposta: p.preco === null || p.preco === undefined ? null : p.preco
  };
}

function svPrevistoFromRow(r) {
  return {
    id: r.id, numeroProcesso: r.numero_processo, itens: Array.isArray(r.itens) ? r.itens.filter(it => it && typeof it === "object") : [], dataChegada: r.data_chegada || "",
    status: r.status, armazem: r.armazem || "", obs: r.obs || "", dtc: !!r.dtc,
    // custo total do processo (sql/sem_venda_custo_no_processo.sql); vazio = ainda não informado
    custoTotal: r.custo_total === null || r.custo_total === undefined ? null : Number(r.custo_total),
    custoForaDoInvestido: !!r.custo_fora_do_investido, createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svPrevistoToRow(p) {
  return {
    id: p.id, numero_processo: p.numeroProcesso, itens: p.itens || [], data_chegada: p.dataChegada || null,
    status: p.status, armazem: p.armazem || null, obs: p.obs || null, dtc: !!p.dtc,
    custo_total: p.custoTotal === null || p.custoTotal === undefined ? null : p.custoTotal,
    custo_fora_do_investido: !!p.custoForaDoInvestido
  };
}

function svGetProduto(codigo) {
  return svState.produtos.find(p => p.codigo === codigo);
}

let svCargaEmAndamento = null;

// Uma carga por vez (quem chega no meio pega a mesma) e no máximo uma a cada 3s, mesmo quando falha
// (sem isso, tabela inexistente ou rede fora repetiria a consulta e o aviso a cada evento).
function svCarregarDados(forcar) {
  if (svCargaEmAndamento) return svCargaEmAndamento;
  if (!forcar && Date.now() - svUltimaCarga < SV_RECARGA_MIN_MS) return Promise.resolve(true);
  svUltimaCarga = Date.now();
  svCargaEmAndamento = (async () => {
    // as reservas vêm por sv_reservas_lista (executivo vê o nome só dos clientes dele); sem o SQL rodado cai na leitura antiga
    const buscarReservas = async () => {
      const lista = await sb.rpc("sv_reservas_lista");
      if (!lista.error) return lista;
      return sb.from("sv_reservas").select("*").order("created_at", { ascending: false });
    };
    const [prod, prev, res] = await Promise.all([
      sb.from("sv_produtos").select("*").order("codigo"),
      sb.from("sv_previsoes").select("*").order("created_at", { ascending: false }),
      buscarReservas()
    ]);
    const erro = prod.error || prev.error || res.error;
    if (erro) {
      toast("Erro ao carregar o Sem Venda: " + erro.message);
      return false;
    }
    svState.produtos = (prod.data || []).map(svProdutoFromRow);
    svState.previsoes = (prev.data || []).map(svPrevistoFromRow);
    svState.reservas = (res.data || []).map(svReservaFromRow);
    return true;
  })().finally(() => { svCargaEmAndamento = null; });
  return svCargaEmAndamento;
}

// chamado pelo setView() do app.js sempre que uma tela sv-* abre
async function svAoAbrirView(view) {
  if (!["sv-produtos", "sv-previsto", "sv-catalogo", "sv-reserva", "sv-dashboard", "sv-estoque", "sv-armazenagem", "sv-relatoriopreco", "sv-clientes"].includes(view)) return;
  if (!(await svCarregarDados())) return;
  // o cadastro de clientes tem carga própria (tabela sv_clientes): só as telas que o usam dependem dele
  if (["sv-clientes", "sv-reserva", "sv-relatoriopreco"].includes(view) && !(await svCarregarClientes(view === "sv-clientes"))) return;
  // as listas de vendedores e de condições de pagamento têm carga própria: se a tabela não existir, só a Reserva reclama
  if (view === "sv-reserva") await Promise.all([svCarregarVendedores(), svCarregarTransportadoras(), svCarregarRepresentantes()]);
  if (view === "sv-produtos") svRenderProdutos();
  else if (view === "sv-previsto") svRenderPrevistos();
  else if (view === "sv-catalogo") svRenderCatalogo();
  else if (view === "sv-dashboard") svRenderDashboard();
  else if (view === "sv-estoque") svRenderEstoque();
  else if (view === "sv-armazenagem") svRenderArmazenagem();
  else if (view === "sv-relatoriopreco") svAbrirProposta();
  else if (view === "sv-clientes") svRenderClientes();
  else svRenderReserva();
}

function svOpcoesCategoria(primeira) {
  return `<option value="">${primeira}</option>` +
    Object.entries(CATEGORIA_LABEL).map(([k, label]) => `<option value="${escapeAttr(k)}">${escapeHtml(label)}</option>`).join("");
}

/* ---------- Produtos ---------- */

function svRenderProdutos() {
  const selMarca = document.getElementById("svProdFiltroMarca");
  const marcaAtual = selMarca.value;
  const marcas = [...new Set(svState.produtos.map(p => p.marca).filter(Boolean))].sort();
  selMarca.innerHTML = `<option value="">Todas</option>` + marcas.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("");
  if (marcas.includes(marcaAtual)) selMarca.value = marcaAtual;

  const search = (document.getElementById("svProdSearch").value || "").trim().toLowerCase();
  const fCategoria = document.getElementById("svProdFiltroCategoria").value;
  const fMarca = selMarca.value;
  const fCarcaca = document.getElementById("svProdFiltroCarcaca").value;
  const fSituacao = document.getElementById("svProdFiltroSituacao").value;

  let rows = svState.produtos.slice();
  if (search) rows = rows.filter(p => p.codigo.toLowerCase().includes(search) || p.medida.toLowerCase().includes(search));
  if (fCategoria === "__sem") rows = rows.filter(p => !p.categoria);
  else if (fCategoria) rows = rows.filter(p => p.categoria === fCategoria);
  if (fMarca) rows = rows.filter(p => p.marca === fMarca);
  if (fCarcaca === "__sem") rows = rows.filter(p => !p.carcaca);
  else if (fCarcaca) rows = rows.filter(p => p.carcaca === fCarcaca);
  if (fSituacao) rows = rows.filter(p => p.situacao === fSituacao);

  const temFiltro = !!(search || fCategoria || fMarca || fCarcaca || fSituacao);
  document.getElementById("svProdCount").textContent = temFiltro
    ? `${rows.length} de ${svState.produtos.length} produto(s)`
    : `${svState.produtos.length} produto(s) cadastrado(s)`;

  const vazio = document.getElementById("svProdEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = svState.produtos.length === 0
    ? "Nenhum produto cadastrado no Sem Venda ainda."
    : "Nenhum produto com esses filtros.";

  const tbody = document.getElementById("svProdTbody");
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td class="mono">${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.medida)}</td>
      <td>${p.categoria ? escapeHtml(CATEGORIA_LABEL[p.categoria] || p.categoria) : '<span class="muted">—</span>'}</td>
      <td>${p.marca ? escapeHtml(p.marca) : '<span class="muted">—</span>'}</td>
      <td>${p.carcaca === "RADIAL" ? "Radial" : p.carcaca === "DIAGONAL" ? "Diagonal" : '<span class="muted">—</span>'}</td>
      <td class="sv-num">${p.preco === null ? '<span class="muted">—</span>' : escapeHtml(formatMoney(p.preco))}</td>
      <td>${p.situacao === "DESCONTINUADO" ? '<span class="status-pill pill-esgotado">Descontinuado</span>' : '<span class="status-pill pill-normal">Ativo</span>'}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="icon-btn sv-write" data-svedit="${escapeAttr(p.codigo)}" title="Editar"><svg class="ic" viewBox="0 0 20 20"><use href="#i-pencil"/></svg></button>
          <button type="button" class="btn small danger sv-write" data-svdel="${escapeAttr(p.codigo)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-svedit]").forEach(btn => {
    btn.addEventListener("click", () => svIniciarEdicaoProduto(btn.dataset.svedit));
  });
  tbody.querySelectorAll("[data-svdel]").forEach(btn => {
    btn.addEventListener("click", () => svExcluirProduto(btn.dataset.svdel));
  });
}

function svIniciarEdicaoProduto(codigo) {
  const p = svGetProduto(codigo);
  if (!p) return;
  svEditandoProduto = codigo;
  const campo = document.getElementById("svProdCodigo");
  campo.value = p.codigo;
  campo.readOnly = true; // o código é a chave: trocar depois quebraria os processos que usam ele
  document.getElementById("svProdMedida").value = p.medida;
  document.getElementById("svProdMarca").value = p.marca;
  document.getElementById("svProdModelo").value = p.modelo;
  document.getElementById("svProdCategoria").value = p.categoria;
  document.getElementById("svProdCarcaca").value = p.carcaca;
  document.getElementById("svProdSituacao").value = p.situacao;
  document.getElementById("svProdIcIv").value = p.icIv;
  document.getElementById("svProdPr").value = p.pr;
  document.getElementById("svProdCapCarga").value = p.capCarga;
  document.getElementById("svProdFormTitle").textContent = "Editar produto";
  document.getElementById("svProdEditBanner").style.display = "block";
  document.getElementById("svBtnSubmitProduto").textContent = "Salvar alterações";
  svLimparFotoPendente();
  svAtualizarPreviewFoto();
  const form = document.getElementById("svFormProduto");
  form.closest(".card-collapsible")?.classList.remove("collapsed");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function svCancelarEdicaoProduto() {
  svEditandoProduto = null;
  document.getElementById("svFormProduto").reset();
  document.getElementById("svProdCodigo").readOnly = false;
  document.getElementById("svProdFormTitle").textContent = "Novo produto";
  document.getElementById("svProdEditBanner").style.display = "none";
  document.getElementById("svBtnSubmitProduto").textContent = "Adicionar produto";
  svLimparFotoPendente();
  svAtualizarPreviewFoto();
}

/* ---------- Foto do produto ---------- */

let svFotoPreviewUrl = null;

function svLimparFotoPendente() {
  svFotoPendente = null;
  if (svFotoPreviewUrl) { URL.revokeObjectURL(svFotoPreviewUrl); svFotoPreviewUrl = null; }
  document.getElementById("svProdFotoInput").value = "";
}

function svAtualizarPreviewFoto() {
  const p = svEditandoProduto ? svGetProduto(svEditandoProduto) : null;
  let url = null;
  if (svFotoPendente) {
    if (svFotoPreviewUrl) URL.revokeObjectURL(svFotoPreviewUrl);
    svFotoPreviewUrl = URL.createObjectURL(svFotoPendente);
    url = svFotoPreviewUrl;
  } else if (p) {
    url = svFotoUrl(p.fotoPath);
  }
  document.getElementById("svProdFotoPreview").innerHTML = url
    ? `<img src="${escapeAttr(url)}" alt="Foto do produto">`
    : `<span>Sem foto</span>`;
  document.getElementById("svBtnProdRemoverFoto").style.display = (svFotoPendente || (p && p.fotoPath)) ? "" : "none";
}

async function svEnviarFotoProduto(codigo, file) {
  const p = svGetProduto(codigo);
  if (!p) return false;
  const pathAntigo = p.fotoPath;
  const path = `${sanitizarNomeArquivo(codigo)}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
  const { error: erroUpload } = await sb.storage.from(SV_FOTOS_BUCKET).upload(path, file);
  if (erroUpload) { toast("Erro ao enviar foto: " + erroUpload.message); return false; }
  const { data, error } = await sb.from("sv_produtos").update({ foto_path: path }).eq("codigo", codigo).select();
  if (error || !data || data.length === 0) {
    toast("Erro ao salvar foto: " + (error ? error.message : "sem permissão ou produto removido"));
    await sb.storage.from(SV_FOTOS_BUCKET).remove([path]); // não deixa arquivo órfão no bucket
    return false;
  }
  p.fotoPath = path;
  if (pathAntigo) await sb.storage.from(SV_FOTOS_BUCKET).remove([pathAntigo]);
  return true;
}

async function svEscolherFoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { toast("Escolha um arquivo de imagem."); svLimparFotoPendente(); return; }
  if (file.size > SV_FOTO_MAX_BYTES) { toast("Imagem muito grande (máx. 5 MB)."); svLimparFotoPendente(); return; }
  if (svEditandoProduto) {
    // produto já existe: envia na hora; num produto novo a foto espera o cadastro ser salvo
    const ok = await svEnviarFotoProduto(svEditandoProduto, file);
    svLimparFotoPendente();
    svAtualizarPreviewFoto();
    if (ok) { svRenderProdutos(); toast("Foto enviada."); }
    return;
  }
  svFotoPendente = file;
  svAtualizarPreviewFoto();
}

async function svRemoverFoto() {
  if (!svEditandoProduto) { svLimparFotoPendente(); svAtualizarPreviewFoto(); return; }
  const p = svGetProduto(svEditandoProduto);
  if (!p || !p.fotoPath) return;
  const { error: erroRemover } = await sb.storage.from(SV_FOTOS_BUCKET).remove([p.fotoPath]);
  if (erroRemover) { toast("Erro ao remover foto: " + erroRemover.message); return; }
  const { data, error } = await sb.from("sv_produtos").update({ foto_path: null }).eq("codigo", p.codigo).select();
  if (error || !data || data.length === 0) { toast("Erro ao salvar: " + (error ? error.message : "sem permissão")); return; }
  p.fotoPath = null;
  svAtualizarPreviewFoto();
  svRenderProdutos();
  toast("Foto removida.");
}

// o botão fica desabilitado até a resposta voltar: duplo clique não grava duas vezes
async function svSalvarProduto(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnSubmitProduto");
  if (botao.disabled) return;
  botao.disabled = true;
  try { await svSalvarProdutoDados(e); } finally { botao.disabled = false; }
}

// lê um campo de valor em R$: vazio = null; negativo = NaN (quem chama avisa)
function svLerValor(id) {
  const texto = document.getElementById(id).value;
  if (texto === "") return null;
  const n = Math.round(Number(texto) * 100) / 100;
  return n >= 0 ? n : NaN;
}

async function svSalvarProdutoDados(e) {
  const dados = {
    codigo: document.getElementById("svProdCodigo").value.trim(),
    medida: document.getElementById("svProdMedida").value.trim(),
    marca: document.getElementById("svProdMarca").value.trim(),
    modelo: document.getElementById("svProdModelo").value.trim(),
    categoria: document.getElementById("svProdCategoria").value,
    carcaca: document.getElementById("svProdCarcaca").value,
    situacao: document.getElementById("svProdSituacao").value,
    icIv: document.getElementById("svProdIcIv").value.trim(),
    pr: document.getElementById("svProdPr").value.trim(),
    capCarga: document.getElementById("svProdCapCarga").value.trim(),
    // o valor não é tabelado: o cadastro não pede preço; produto já cadastrado mantém o que tinha
    preco: svEditandoProduto ? ((svState.produtos.find(x => x.codigo === svEditandoProduto) || {}).preco ?? null) : null
  };
  if (!dados.codigo || !dados.medida) { toast("Informe o código e a medida."); return; }

  if (svEditandoProduto) {
    const { codigo, ...campos } = svProdutoToRow({ ...dados, codigo: svEditandoProduto });
    const { data, error } = await sb.from("sv_produtos").update(campos).eq("codigo", svEditandoProduto).select();
    if (error) { toast("Erro ao salvar: " + error.message); return; }
    if (!data || data.length === 0) { toast("Não foi possível salvar (sem permissão ou produto removido)."); return; }
    const i = svState.produtos.findIndex(x => x.codigo === svEditandoProduto);
    if (i >= 0) svState.produtos[i] = svProdutoFromRow(data[0]);
    svCancelarEdicaoProduto();
    svRenderProdutos();
    toast("Produto atualizado.");
    return;
  }

  if (svState.produtos.some(p => p.codigo.toLowerCase() === dados.codigo.toLowerCase())) {
    toast("Já existe um produto com esse código.");
    return;
  }
  const { data, error } = await sb.from("sv_produtos").insert({ ...svProdutoToRow(dados), created_by: currentUser ? currentUser.id : null }).select();
  if (error) { toast("Erro ao adicionar produto: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível adicionar (sem permissão)."); return; }
  svState.produtos.push(svProdutoFromRow(data[0]));
  svState.produtos.sort((a, b) => a.codigo.localeCompare(b.codigo));
  const fotoParaEnviar = svFotoPendente;
  const resultadoFoto = fotoParaEnviar ? await svEnviarFotoProduto(dados.codigo, fotoParaEnviar) : null;
  e.target.reset();
  svLimparFotoPendente();
  svAtualizarPreviewFoto();
  svRenderProdutos();
  if (fotoParaEnviar && !resultadoFoto) toast("Produto adicionado, mas a foto não foi enviada. Abra Editar pra tentar de novo.");
  else toast("Produto adicionado.");
}

async function svExcluirProduto(codigo) {
  const usado = svState.previsoes.some(pr => (pr.itens || []).some(it => it.codigo === codigo));
  if (usado) { toast("Não é possível excluir: esse produto está numa medida de Estoque Previsto."); return; }
  if (svState.reservas.some(r => r.codigo === codigo)) { toast("Não é possível excluir: esse produto tem reservas."); return; }
  const ok = await confirmModal("Excluir produto?", `Remover "${codigo}" do cadastro do Sem Venda?`);
  if (!ok) return;
  const alvo = svGetProduto(codigo);
  const { data, error } = await sb.from("sv_produtos").delete().eq("codigo", codigo).select();
  if (error) { toast("Erro ao excluir produto: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou produto já removido)."); return; }
  if (alvo && alvo.fotoPath) await sb.storage.from(SV_FOTOS_BUCKET).remove([alvo.fotoPath]);
  svState.produtos = svState.produtos.filter(p => p.codigo !== codigo);
  if (svEditandoProduto === codigo) svCancelarEdicaoProduto();
  svRenderProdutos();
  toast("Produto removido.");
}

/* ---------- Estoque Previsto ---------- */

function svProdutoOptionsHTML() {
  return '<option value="">Selecione o produto…</option>' + svState.produtos.slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map(p => `<option value="${escapeAttr(p.codigo)}">${escapeHtml(p.codigo)} — ${escapeHtml(p.medida)}${p.situacao === "DESCONTINUADO" ? " (descontinuado)" : ""}</option>`)
    .join("");
}

function svCriarLinhaItem(containerId) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <select class="item-produto" required>${svProdutoOptionsHTML()}</select>
    <input type="number" class="item-qtd" min="1" step="1" placeholder="Qtd" required>
    <input type="number" class="item-custo" min="0" step="0.01" placeholder="Custo unit." aria-label="Custo unitário em reais" inputmode="decimal">
    <span class="item-subtotal mono">—</span>
    <button type="button" class="btn small danger item-remove" title="Remover medida">✕</button>
  `;
  produtoComboAprimorar(row.querySelector(".item-produto"));
  row.querySelector(".item-qtd").addEventListener("input", svAtualizarCustoForm);
  row.querySelector(".item-custo").addEventListener("input", svAtualizarCustoForm);
  row.querySelector(".item-remove").addEventListener("click", () => {
    const container = document.getElementById(containerId);
    if (container.children.length > 1) {
      row.remove();
      updateItemRemoveVisibility(containerId);
      if (containerId === "svPrevItens") svAtualizarCustoForm();
    }
  });
  return row;
}

function svResetItens() {
  const container = document.getElementById("svPrevItens");
  container.innerHTML = "";
  container.appendChild(svCriarLinhaItem("svPrevItens"));
  updateItemRemoveVisibility("svPrevItens");
}

// produto que sumiu da lista (outra pessoa removeu) continua como opção marcada, em vez de o
// select cair silenciosamente no primeiro produto e gravar o item errado
function svGarantirOpcao(sel, codigo) {
  if ([...sel.options].some(o => o.value === codigo)) return;
  const op = document.createElement("option");
  op.value = codigo;
  op.textContent = `${codigo} — (produto removido)`;
  sel.appendChild(op);
}

function svAtualizarSelectsProduto() {
  const opcoes = svProdutoOptionsHTML();
  document.querySelectorAll("#svPrevItens .item-produto").forEach(sel => {
    const anterior = sel.value;
    sel.innerHTML = opcoes;
    if (anterior) {
      svGarantirOpcao(sel, anterior);
      sel.value = anterior;
    }
  });
  document.getElementById("svPrevSemProdutos").style.display = svState.produtos.length === 0 ? "block" : "none";
}

/* ---------- Estoque Previsto em kanban (mesmo desenho do Torun): uma coluna por status, arrasta o card pra mudar ---------- */

// Mesma regra dos controles que já existiam no card (somenteLeitura): só "viewer" não mexe.
function svPodeEditarPrevisto() {
  return currentUserRole !== "viewer";
}

let svPrevSortables = [];

// Colunas do Estoque Previsto do Sem Venda. NÃO são as do Torun (PREVISTO_STATUS no app.js): aqui não há ATRACADO,
// AGUARDANDO RETIRADA DO PORTO virou NACIONALIZADO, AG RETIRADA DO PORTO e entraram PRESENCIADO e FATURADO.
const SV_PREVISTO_STATUS = ["AGUARDANDO PRONTIDÃO", "AGUARDANDO EMBARQUE", "PROCESSO EM AGUA", "AGUARDANDO PRESENÇA", "PRESENCIADO",
  "NACIONALIZADO, AG RETIRADA DO PORTO", "FINALIZADO", "FATURADO"];
// Função (não constante): este arquivo carrega ANTES do app.js, então PREVISTO_COR ainda não existe aqui no
// topo do arquivo -- só na hora de desenhar.
function svCorPrevisto(status) {
  const extras = {
    "PRESENCIADO": { accent: "#8B5CF6", deep: "#5B21B6", pale: "#EDE7FD" },
    "NACIONALIZADO, AG RETIRADA DO PORTO": PREVISTO_COR["AGUARDANDO RETIRADA DO PORTO"],
    "FATURADO": { accent: "#0D9488", deep: "#115E59", pale: "#D5F5F0" }
  };
  return extras[status] || PREVISTO_COR[status];
}
// o pneu já chegou (entra no estoque do Sem Venda): FINALIZADO e continua valendo depois de FATURADO
function svStatusChegou(status) { return status === "FINALIZADO" || status === "FATURADO"; }
function svStatusBadgeClass(status) {
  if (status === "NACIONALIZADO, AG RETIRADA DO PORTO") return "st-porto";
  if (status === "PRESENCIADO") return "st-presenca";
  if (status === "FATURADO") return "st-chegou";
  return statusBadgeClass(status);
}

// Monta as colunas uma vez só (no 1º render). A lista vem de SV_PREVISTO_STATUS e as cores de svCorPrevisto.
function svMontarKanbanPrevisto() {
  const board = document.getElementById("svPrevBoard");
  board.innerHTML = SV_PREVISTO_STATUS.map((status, i) => {
    const cor = svCorPrevisto(status) || { accent: "#78716C", deep: "#44403C", pale: "#EFECEA" };
    return `
      <div class="kanban-col" style="--col-accent:${cor.accent}; --col-deep:${cor.deep}; --col-pale:${cor.pale};">
        <div class="kanban-col-head"><span>${escapeHtml(status)}</span><span class="kanban-count" id="svPrevCount${i}">0</span><span class="kanban-col-toggle">⌄</span></div>
        <div class="kanban-cards" id="svPrevCol${i}" data-status="${escapeAttr(status)}"></div>
      </div>`;
  }).join("");

  board.querySelectorAll(".kanban-col-head").forEach(head => {
    head.addEventListener("click", () => head.closest(".kanban-col").classList.toggle("collapsed"));
  });
  board.addEventListener("click", (e) => {
    const reservar = e.target.closest("[data-svreservarproc]");
    if (reservar) { if (!reservar.disabled) svReservarProcesso(reservar.dataset.svreservarproc); return; }
    const card = e.target.closest(".kanban-card");
    if (card) svAbrirPrevistoDetalhe(card.dataset.id);
  });
  initKanbanBoardDragScroll("svPrevBoard");

  svPrevSortables = SV_PREVISTO_STATUS.map((_, i) => Sortable.create(document.getElementById("svPrevCol" + i), {
    group: "sv-prev-kanban",
    animation: 150,
    disabled: !svPodeEditarPrevisto(),
    onEnd: svMoverPrevistoDeColuna
  }));
}

// Soltar o card em outra coluna = trocar o status. Passa por svAtualizarCampoPrevisto, a mesma função do
// seletor de status de antes: ela recarrega os dados e confere o saldo (não deixa um processo que já
// chegou voltar de etapa se isso deixar reserva ou venda sem estoque) antes de gravar.
async function svMoverPrevistoDeColuna(evt) {
  const id = evt.item.dataset.id;
  const novoStatus = evt.to.dataset.status;
  const statusAntigo = evt.from.dataset.status;
  if (novoStatus === statusAntigo) return;
  const alvo = svState.previsoes.find(x => x.id === id);
  if (!alvo) return;
  // sem armazém os pneus não têm onde ficar na Armazenagem: o processo só finaliza com o armazém escolhido
  if (svStatusChegou(novoStatus) && !alvo.armazem) {
    toast("Escolha o armazém de destino para finalizar o processo. Abra o processo, escolha o armazém e salve.");
    svRenderPrevistos();
    return;
  }
  const ok = await confirmModal("Mudar status do processo?",
    `Tem certeza que deseja mudar o processo ${alvo.numeroProcesso} para "${novoStatus}"?`);
  if (ok) await svAtualizarCampoPrevisto(id, { status: novoStatus }, "Status atualizado.");
  svRenderPrevistos(); // se foi barrado ou cancelado, o card volta pra coluna de antes
}

function svPrevTextoArmazem(p) {
  return p.armazem ? svNomeArmazem(p.armazem) : "";
}

// Uma linha por medida do processo, com o que ainda está livre.
// A caminho: livre = total - reservado - vendido, das reservas ligadas ao próprio processo.
// Já chegou: a reserva é do armazém, não do processo; então o livre é o saldo do produto no armazém do processo (noArmazem).
// `calc` = resultado de svCalcularEstoque() (passe o mesmo para todos os cards: a conta é cara).
function svLivrePorMedida(p, calc) {
  const chegou = svStatusChegou(p.status);
  const porCodigo = new Map();
  p.itens.forEach(it => {
    if (!it.codigo) return;
    if (!porCodigo.has(it.codigo)) porCodigo.set(it.codigo, { codigo: it.codigo, total: 0, reservado: 0, vendido: 0, livre: 0, noArmazem: chegou });
    porCodigo.get(it.codigo).total += Number(it.quantidade) || 0;
  });
  // reservado e vendido do processo = reservas ligadas a ele (feitas enquanto ainda vinha); vale também depois que chegou
  const ligadas = svState.reservas.filter(r => r.previsaoId === p.id && r.situacao !== "CANCELADA");
  porCodigo.forEach(m => {
    ligadas.filter(r => r.codigo === m.codigo).forEach(r => { if (r.situacao === "VENDIDA") m.vendido += r.quantidade; else m.reservado += r.quantidade; });
    if (chegou) {
      const l = calc.linhas.find(x => x.codigo === m.codigo && x.armazem === (p.armazem || ""));
      m.livre = l ? Math.max(0, l.disp) : 0;
    } else {
      m.livre = Math.max(0, m.total - m.reservado - m.vendido);
    }
  });
  return [...porCodigo.values()];
}

// "Processo reservado": tudo o que veio no processo (cada medida) já está reservado ou vendido. Não olha o saldo do armazém.
function svProcessoReservadoInteiro(medidas) {
  const com = medidas.filter(m => m.total > 0);
  return com.length > 0 && com.every(m => m.reservado + m.vendido >= m.total);
}

function svRenderPrevistos() {
  svAtualizarSelectsProduto();
  if (!document.getElementById("svPrevCol0")) svMontarKanbanPrevisto();
  const search = (document.getElementById("svPrevSearch").value || "").trim().toLowerCase();
  const calcCards = svCalcularEstoque();
  const aChegarCards = calcCards.aChegar;

  let rows = svState.previsoes.slice();
  if (search) {
    rows = rows.filter(p => {
      const itens = p.itens.map(it => { const prod = svGetProduto(it.codigo); return it.codigo + " " + (prod ? prod.medida : ""); }).join(" ");
      return (p.numeroProcesso + " " + itens).toLowerCase().includes(search);
    });
  }
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  document.getElementById("svPrevEmpty").style.display = svState.previsoes.length === 0 ? "block" : "none";

  SV_PREVISTO_STATUS.forEach((status, i) => {
    const doStatus = rows.filter(p => p.status === status);
    document.getElementById("svPrevCount" + i).textContent = doStatus.length;
    document.getElementById("svPrevCol" + i).innerHTML = doStatus.map(p => {
      const medidas = svLivrePorMedida(p, calcCards);
      const inteiro = svProcessoReservadoInteiro(medidas);
      const itensHtml = medidas.map(m => {
        const prod = svGetProduto(m.codigo);
        const pctRes = m.total > 0 ? Math.min(100, (m.reservado / m.total) * 100) : 0;
        const pctVen = m.total > 0 ? Math.min(100 - pctRes, (m.vendido / m.total) * 100) : 0;
        const legenda = m.noArmazem ? "livres no armazém" : (m.livre <= 0 ? "sem nada livre" : `livres de ${fmt(m.total)}`);
        // reservado inteiro: "RESERVADO" no lugar do número; já chegou e só em parte: sem número (o saldo do armazém fica na janela do card)
        const q = inteiro ? `<span class="sv-prev-q reservado"><b>RESERVADO</b></span>`
          : m.noArmazem ? ""
          : `<span class="sv-prev-q${m.livre <= 0 ? " zero" : ""}"><b>${fmt(m.livre)}</b><small>${legenda}</small></span>`;
        return `
          <li>
            <span class="mono">${escapeHtml(m.codigo)}</span>
            <span class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span>
            ${q}
            ${!inteiro && !m.noArmazem && (pctRes > 0 || pctVen > 0) ? `<span class="sv-prev-barra" title="Reservado e vendido deste processo"><i class="res" style="width:${pctRes}%"></i><i class="ven" style="width:${pctVen}%"></i></span>` : ""}
          </li>`;
      }).join("");
      const comprometido = svStatusChegou(status) && !inteiro ? 0 : medidas.reduce((s, m) => s + m.reservado + m.vendido, 0);
      return `
        <div class="kanban-card" data-id="${escapeAttr(p.id)}">
          <div class="kanban-card-nf">${escapeHtml(p.numeroProcesso)}</div>
          ${inteiro ? `<span class="sv-prev-flag" title="Tudo o que veio neste processo está reservado ou vendido">PROCESSO RESERVADO</span>` : ""}
          ${medidas.length ? `<ul class="kanban-card-itens-list">${itensHtml}</ul>` : ""}
          <div class="kanban-card-meta">
            ${p.armazem
              ? `<span class="kanban-card-tag containers" title="Armazém onde o processo vai entrar">${escapeHtml(svPrevTextoArmazem(p))}</span>`
              : `<span class="kanban-card-tag sem-data">Sem armazém</span>`}
            ${p.dataChegada
              ? `<span class="kanban-card-tag ${svStatusChegou(status) ? "entregue" : ""}">Chegada ${formatDateBR(p.dataChegada)}</span>`
              : `<span class="kanban-card-tag sem-data">Sem data de chegada</span>`}
            ${p.dtc ? `<span class="kanban-card-tag dtc" title="Processo com DTC">DTC</span>` : ""}
            ${comprometido > 0 ? `<span class="kanban-card-tag reservadas" title="Soma do reservado e do vendido deste processo">${fmt(comprometido)} reservadas ou vendidas</span>` : ""}
          </div>
          ${p.obs ? `<div class="kanban-card-obs">${escapeHtml(p.obs)}</div>` : ""}
          <div class="kanban-card-acoes"><button type="button" class="btn small primary sv-write" data-svreservarproc="${escapeAttr(p.id)}"${inteiro ? " disabled title=\"Processo já reservado inteiro\"" : svProcessoTemLivre(p, aChegarCards) ? "" : " disabled title=\"Nada livre neste processo\""}>Reservar processo</button></div>
        </div>`;
    }).join("");
  });

  // permissão pode mudar depois do 1º render (o perfil carrega junto com os dados)
  svPrevSortables.forEach(s => s.option("disabled", !svPodeEditarPrevisto()));
}

// processo que ainda não chegou: precisa ter algo livre (total menos reservado e vendido). Já chegado: vale o estoque do armazém,
// conferido na hora de abrir a reserva.
function svProcessoTemLivre(p, aChegar) {
  if (svStatusChegou(p.status)) return p.itens.length > 0;
  return aChegar.some(a => a.previsaoId === p.id && a.livres > 0);
}

// "Reservar processo": abre a Nova reserva com todos os produtos do processo, cada um com o que ainda está livre.
// Item sem nada livre fica de fora e o aviso diz qual.
async function svReservarProcesso(id) {
  const p = svState.previsoes.find(x => x.id === id);
  if (!p) return;
  // as listas da janela (clientes, vendedores, representantes, transportadoras) só eram carregadas ao abrir a tela
  // Reserva: vindo do Estoque Previsto elas estavam vazias ("Nenhum vendedor cadastrado"). Carrega antes de abrir.
  await Promise.all([svCarregarClientes(false), svCarregarVendedores(), svCarregarTransportadoras(), svCarregarRepresentantes()]);
  svAbrirNovaReserva();
  const caixa = document.getElementById("svResExtras");
  const porOpcao = new Map(); // índice da opção -> quantidade
  const fora = [];
  p.itens.forEach(it => {
    const qtd = Number(it.quantidade) || 0;
    const i = svOpcoesReserva.findIndex(o => svStatusChegou(p.status)
      ? o.tipo === "E" && o.codigo === it.codigo && (o.armazem || "") === (p.armazem || "")
      : o.tipo === "P" && o.previsaoId === p.id && o.codigo === it.codigo);
    if (i < 0 || qtd <= 0) { const prod = svGetProduto(it.codigo); fora.push(prod ? prod.medida : it.codigo); return; }
    porOpcao.set(i, (porOpcao.get(i) || 0) + qtd);
  });
  if (!porOpcao.size) {
    svFecharNovaReserva();
    toast("Nada livre neste processo para reservar.");
    return;
  }
  caixa.innerHTML = "";
  let n = 0;
  porOpcao.forEach((qtd, i) => {
    const linha = svAdicionarItem(n > 0);
    svEscolherOpcao(linha, i);
    linha.querySelector(".sv-item-qtd").value = String(Math.min(qtd, svOpcoesReserva[i].disp));
    n++;
  });
  svAtualizarResumoReserva();
  const aviso = document.getElementById("svResDisp");
  aviso.textContent = `Itens do processo ${p.numeroProcesso}, com o que ainda está livre. Tire o que não quiser ou ajuste a quantidade.`
    + (fora.length ? ` Ficaram de fora, sem nada livre: ${fora.join(", ")}.` : "");
  aviso.style.display = "";
}

/* ---------- janela do card (clique) ---------- */

let svPrevDetalheId = null;

function svAbrirPrevistoDetalhe(id) {
  const p = svState.previsoes.find(x => x.id === id);
  if (!p) return;
  svPrevDetalheId = id;

  const cor = svCorPrevisto(p.status);
  document.querySelector("#svPrevDetalheOverlay .modal").style.setProperty("--col-accent", cor ? cor.accent : "var(--orange)");
  document.getElementById("svPrevDetalheTitulo").textContent = p.numeroProcesso;
  const badge = document.getElementById("svPrevDetalheStatus");
  badge.className = "prev-status-badge " + svStatusBadgeClass(p.status);
  badge.textContent = p.status;
  svAtualizarDtcDaJanela(p);

  const ativas = svState.reservas.filter(r => r.previsaoId === p.id && r.situacao !== "CANCELADA");
  const qtdReservada = ativas.reduce((a, r) => a + (Number(r.quantidade) || 0), 0);
  const valor = (html, vazio) => `<div class="prev-detalhe-valor${vazio ? " vazio" : ""}">${html}</div>`;
  const custoProc = svCustoDoProcesso(p);
  document.getElementById("svPrevDetalheInfo").innerHTML = `
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Armazém</span>${
      p.armazem ? valor(escapeHtml(svPrevTextoArmazem(p))) : valor("Sem armazém", true)}</div>
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Data de chegada</span>${
      p.dataChegada ? valor(`<span class="mono">${formatDateBR(p.dataChegada)}</span>`) : valor("Sem data de chegada", true)}</div>
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">${custoProc.antigo ? "Custo total antigo" : "Custo do processo"}</span>${
      custoProc.temCusto ? valor(`<span class="mono">${escapeHtml(formatMoney(custoProc.total))}</span>${p.custoForaDoInvestido ? ' <span class="muted">(fora do valor investido)</span>' : ""}`) : valor("Custo não informado", true)}</div>
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Reservas ligadas</span>${
      ativas.length ? valor(`<span class="mono">${fmt(qtdReservada)}</span> un. em ${ativas.length} reserva${ativas.length > 1 ? "s" : ""}`) : valor("Nenhuma", true)}</div>`;

  const total = p.itens.reduce((a, it) => a + (Number(it.quantidade) || 0), 0);
  // reservado, vendido e livre por medida (mesma conta do card do kanban e da coluna "A caminho" do Estoque)
  const chegouP = svStatusChegou(p.status);
  const calcJanela = svCalcularEstoque();
  const livreMedidas = svLivrePorMedida(p, calcJanela);
  const inteiro = svProcessoReservadoInteiro(livreMedidas);
  document.getElementById("svPrevDetalheFaixa").style.display = inteiro ? "" : "none";
  const livreDe = (codigo) => livreMedidas.find(m => m.codigo === codigo);
  const somaM = (campo) => livreMedidas.reduce((s, m) => s + m[campo], 0);
  document.getElementById("svPrevDetalheMedidas").innerHTML = p.itens.length ? `
    <table class="prev-detalhe-tabela">
      <thead><tr><th style="width:11%;">Código</th><th>Medida</th><th class="num">Total</th><th class="num">Reserv.</th><th class="num">Vend.</th><th class="num">Livre${chegouP ? "*" : ""}</th><th class="num" style="width:14%;">Custo unit.</th><th class="num" style="width:15%;">Subtotal</th></tr></thead>
      <tbody>
        ${p.itens.map(it => {
          const prod = svGetProduto(it.codigo);
          const lm = livreDe(it.codigo);
          const colsLivre = lm
            ? (chegouP
              ? `<td class="num mono">${fmt(lm.reservado)}</td><td class="num mono">${fmt(lm.vendido)}</td><td class="num mono prev-livre">${fmt(lm.livre)}</td>`
              : `<td class="num mono">${fmt(lm.reservado)}</td><td class="num mono">${fmt(lm.vendido)}</td><td class="num mono prev-livre${lm.livre <= 0 ? " zero" : ""}">${fmt(lm.livre)}</td>`)
            : `<td class="num">—</td><td class="num">—</td><td class="num">—</td>`;
          const temUnit = it.custoUnitario !== null && it.custoUnitario !== undefined;
          const celulas = temUnit
            ? `<td class="num mono">${escapeHtml(formatMoney(it.custoUnitario))}</td><td class="num mono">${escapeHtml(formatMoney((Number(it.quantidade) || 0) * Number(it.custoUnitario)))}</td>`
            : `<td class="num">${custoProc.antigo ? "—" : '<span class="muted">Custo não informado</span>'}</td><td class="num">—</td>`;
          return `<tr><td class="mono">${escapeHtml(it.codigo)}</td><td class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</td><td class="num mono">${fmt(it.quantidade)}</td>${colsLivre}${celulas}</tr>`; }).join("")}
        <tr class="total"><td colspan="2">Total do processo</td><td class="num mono">${fmt(total)}</td><td class="num mono">${fmt(somaM("reservado"))}</td><td class="num mono">${fmt(somaM("vendido"))}</td>${chegouP ? `<td class="num">—</td>` : `<td class="num mono">${fmt(somaM("livre"))}</td>`}<td></td><td class="num mono">${custoProc.temCusto ? escapeHtml(formatMoney(custoProc.total)) : "—"}</td></tr>
      </tbody>
    </table>
    <div class="prev-detalhe-obs">${chegouP
      ? "*Livre = saldo do produto no armazém deste processo (a reserva é do armazém, não do processo)."
      : "Livre = total − reservado − vendido neste processo."}</div>
    ${custoProc.antigo ? `<div class="prev-detalhe-obs">Este processo foi lançado com o custo total. Ele segue contando no valor investido até você informar o custo unitário dos itens (em Editar).</div>`
      : custoProc.temCusto && custoProc.itensSemCusto > 0 ? `<div class="prev-detalhe-obs">${custoProc.itensSemCusto} ${custoProc.itensSemCusto === 1 ? "item sem custo informado" : "itens sem custo informado"}. Edite o processo para preencher o custo unitário.</div>` : ""}` : `<div class="prev-detalhe-obs">Nenhuma medida cadastrada.</div>`;

  document.getElementById("svPrevDetalheObs").textContent = p.obs || "Sem observação.";

  const pode = svPodeEditarPrevisto();
  document.getElementById("svPrevDetalheEditar").style.display = pode ? "" : "none";
  document.getElementById("svPrevDetalheExcluir").style.display = pode ? "" : "none";
  document.getElementById("svPrevDetalheReservar").disabled = inteiro || !svProcessoTemLivre(p, calcJanela.aChegar);
  document.getElementById("svPrevDetalheOverlay").classList.add("show");
}

function svFecharPrevistoDetalhe() {
  document.getElementById("svPrevDetalheOverlay").classList.remove("show");
  svPrevDetalheId = null;
}

// etiqueta DTC ao lado do status e caixa "DTC" da janela do card (só quem edita mexe na caixa)
function svAtualizarDtcDaJanela(p) {
  document.getElementById("svPrevDetalheDtcTag").style.display = p.dtc ? "" : "none";
  const caixa = document.getElementById("svPrevDetalheDtc");
  caixa.checked = !!p.dtc;
  caixa.disabled = !svPodeEditarPrevisto();
}

// Marca/desmarca o DTC na hora, sem passar pelo formulário. Não mexe no saldo (só o status mexe), então não
// precisa da conferência de saldo do svAtualizarCampoPrevisto.
async function svAlternarDtcPrevisto(id, valor) {
  const alvo = svState.previsoes.find(x => x.id === id);
  if (!alvo) return;
  const anterior = !!alvo.dtc;
  alvo.dtc = valor;
  const { data, error } = await sb.from("sv_previsoes").update({ dtc: valor }).eq("id", id).select();
  if (error || !data || data.length === 0) {
    alvo.dtc = anterior;
    svAtualizarDtcDaJanela(alvo);
    toast(error ? "Erro ao salvar o DTC: " + error.message : "Não foi possível salvar o DTC (sem permissão ou processo removido).");
    return;
  }
  alvo.updatedAt = data[0].updated_at;
  // se esse mesmo processo está aberto no formulário de edição, a caixa e o instante de referência do conflito acompanham
  if (svEditandoPrevistoId === id) {
    svEditandoPrevistoUpdatedAt = data[0].updated_at;
    document.getElementById("svPrevDtc").checked = valor;
  }
  svAtualizarDtcDaJanela(alvo);
  svRenderPrevistos();
  toast(valor ? "DTC marcado." : "DTC desmarcado.");
}

function svInitPrevDetalhe() {
  document.getElementById("svPrevDetalheDtc").addEventListener("change", (e) => {
    if (svPrevDetalheId) svAlternarDtcPrevisto(svPrevDetalheId, e.target.checked);
  });
  document.getElementById("svPrevDetalheX").addEventListener("click", svFecharPrevistoDetalhe);
  document.getElementById("svPrevDetalheFechar").addEventListener("click", svFecharPrevistoDetalhe);
  document.getElementById("svPrevDetalheOverlay").addEventListener("click", (e) => {
    if (e.target.id === "svPrevDetalheOverlay") svFecharPrevistoDetalhe();
  });
  document.getElementById("svPrevDetalheReservar").addEventListener("click", () => {
    const id = svPrevDetalheId;
    svFecharPrevistoDetalhe();
    if (id) svReservarProcesso(id);
  });
  document.getElementById("svPrevDetalheEditar").addEventListener("click", () => {
    const id = svPrevDetalheId;
    svFecharPrevistoDetalhe();
    if (id) svIniciarEdicaoPrevisto(id);
  });
  document.getElementById("svPrevDetalheExcluir").addEventListener("click", async () => {
    const id = svPrevDetalheId;
    if (!id) return;
    if (await svExcluirPrevisto(id)) svFecharPrevistoDetalhe();
  });
}

async function svAtualizarCampoPrevisto(id, campos, mensagem) {
  const existente = svState.previsoes.find(x => x.id === id);
  if (!existente) return;
  // um processo finalizado precisa de armazém (é onde os pneus aparecem na Armazenagem)
  const statusFinal = "status" in campos ? campos.status : existente.status;
  const armazemFinal = "armazem" in campos ? (campos.armazem || "") : existente.armazem;
  if (svStatusChegou(statusFinal) && !armazemFinal) { toast("Escolha o armazém de destino para finalizar o processo."); return; }
  // trocar status ou armazém de um processo que já chegou mexe no saldo: confere antes, com dados atualizados
  // (os chamadores redesenham a lista depois, então o seletor volta pro valor que valia)
  if ("status" in campos || "armazem" in campos) {
    if (!(await svCarregarDados(true))) return;
    const atual0 = svState.previsoes.find(x => x.id === id);
    if (!atual0) return;
    const mudanca = {};
    if ("status" in campos) mudanca.status = campos.status;
    if ("armazem" in campos) mudanca.armazem = campos.armazem || "";
    const problema = svProblemaDeSaldo(svState.previsoes.map(p => p.id === id ? { ...p, ...mudanca } : p), atual0);
    if (problema) { toast(problema); return; }
  }
  const { data, error } = await sb.from("sv_previsoes").update(campos).eq("id", id).select();
  if (error) { toast("Erro ao salvar: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível salvar (sem permissão ou processo removido)."); return; }
  const novo = svPrevistoFromRow(data[0]);
  const atual = svState.previsoes.find(x => x.id === id); // a lista pode ter sido recarregada durante o await
  if (atual) Object.assign(atual, novo);
  // se esse mesmo processo está aberto no formulário de edição, o formulário acompanha a mudança
  // e o instante de referência do conflito também, senão salvar depois daria falso "alterado por outra pessoa"
  if (svEditandoPrevistoId === id) {
    svEditandoPrevistoUpdatedAt = novo.updatedAt;
    if ("data_chegada" in campos) document.getElementById("svPrevDataChegada").value = novo.dataChegada;
    if ("status" in campos) document.getElementById("svPrevStatus").value = novo.status;
    if ("armazem" in campos) document.getElementById("svPrevArmazem").value = novo.armazem;
  }
  toast(mensagem);
}

function svIniciarEdicaoPrevisto(id) {
  const p = svState.previsoes.find(x => x.id === id);
  if (!p) return;
  svEditandoPrevistoId = id;
  svEditandoPrevistoUpdatedAt = p.updatedAt;

  document.getElementById("svPrevNumeroProcesso").value = p.numeroProcesso;
  document.getElementById("svPrevDataChegada").value = p.dataChegada;
  document.getElementById("svPrevStatus").value = p.status;
  document.getElementById("svPrevDtc").checked = !!p.dtc;
  document.getElementById("svPrevArmazem").value = p.armazem;
  document.getElementById("svPrevObs").value = p.obs;
  document.getElementById("svPrevCustoFora").checked = !!p.custoForaDoInvestido;

  const container = document.getElementById("svPrevItens");
  container.innerHTML = "";
  (p.itens.length ? p.itens : [{ codigo: "", quantidade: "" }]).forEach(it => {
    const row = svCriarLinhaItem("svPrevItens");
    container.appendChild(row);
    if (it.codigo) {
      const sel = row.querySelector(".item-produto");
      svGarantirOpcao(sel, it.codigo);
      sel.value = it.codigo;
    }
    row.querySelector(".item-qtd").value = it.quantidade;
    if (it.custoUnitario !== null && it.custoUnitario !== undefined) row.querySelector(".item-custo").value = it.custoUnitario;
  });
  updateItemRemoveVisibility("svPrevItens");
  svAtualizarCustoForm();

  document.getElementById("svPrevFormTitle").textContent = "Editar processo previsto";
  document.getElementById("svBtnSubmitPrevisto").textContent = "Salvar alterações";
  svAbrirPopupPrevisto();
}

function svAbrirPopupPrevisto() {
  document.getElementById("svPrevOverlay").classList.add("show");
  document.getElementById("svPrevNumeroProcesso").focus();
}

function svNovoPrevisto() {
  svCancelarEdicaoPrevisto(); // limpa qualquer edição que ficou pela metade
  svAbrirPopupPrevisto();
}

function svCancelarEdicaoPrevisto() {
  svEditandoPrevistoId = null;
  svEditandoPrevistoUpdatedAt = null;
  document.getElementById("svFormPrevisto").reset();
  document.getElementById("svPrevStatus").value = SV_PREVISTO_STATUS[0];
  svResetItens();
  svAtualizarCustoForm();
  document.getElementById("svPrevFormTitle").textContent = "Novo processo previsto";
  document.getElementById("svBtnSubmitPrevisto").textContent = "Adicionar processo";
  document.getElementById("svPrevOverlay").classList.remove("show");
}

async function svSalvarPrevisto(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnSubmitPrevisto");
  if (botao.disabled) return;
  botao.disabled = true;
  try { await svSalvarPrevistoDados(e); } finally { botao.disabled = false; }
}

async function svSalvarPrevistoDados(e) {
  const numeroProcesso = document.getElementById("svPrevNumeroProcesso").value.trim();
  const dataChegada = document.getElementById("svPrevDataChegada").value;
  const status = document.getElementById("svPrevStatus").value;
  const dtc = document.getElementById("svPrevDtc").checked;
  const armazem = document.getElementById("svPrevArmazem").value;
  const obs = document.getElementById("svPrevObs").value.trim();
  if (!numeroProcesso) { toast("Informe o número do processo."); return; }
  if (svStatusChegou(status) && !armazem) { toast("Escolha o armazém de destino para finalizar o processo."); return; }

  const itens = [];
  for (const row of document.querySelectorAll("#svPrevItens .item-row")) {
    const codigo = row.querySelector(".item-produto").value;
    const quantidadeRaw = row.querySelector(".item-qtd").value;
    if (!codigo && !quantidadeRaw) continue;
    if (!codigo || !quantidadeRaw || parseInt(quantidadeRaw, 10) <= 0) { toast("Preencha produto e quantidade em todas as medidas adicionadas."); return; }
    const custoUnitario = svLerCustoUnitario(row.querySelector(".item-custo").value);
    if (Number.isNaN(custoUnitario)) { toast("O custo unitário precisa ser um valor de zero em diante."); return; }
    itens.push(custoUnitario === null ? { codigo, quantidade: parseInt(quantidadeRaw, 10) } : { codigo, quantidade: parseInt(quantidadeRaw, 10), custoUnitario });
  }
  // o custo total antigo (de antes do custo unitário) continua guardado no processo; só deixa de valer quando há custo unitário
  const atual = svEditandoPrevistoId ? svState.previsoes.find(x => x.id === svEditandoPrevistoId) : null;
  const custoTotal = atual && atual.custoTotal !== undefined ? atual.custoTotal : null;
  const custoForaDoInvestido = document.getElementById("svPrevCustoFora").checked;
  const dados = { numeroProcesso, itens, dataChegada, status, armazem, obs, dtc, custoTotal, custoForaDoInvestido };

  if (svEditandoPrevistoId) {
    // com dados atualizados: alguém pode ter reservado desse processo agora há pouco
    if (!(await svCarregarDados(true))) return;
    const emEdicao = svState.previsoes.find(x => x.id === svEditandoPrevistoId);
    if (emEdicao) {
      const problema = svProblemaDeSaldo(svState.previsoes.map(p => p.id === emEdicao.id ? { ...p, ...dados } : p), emEdicao);
      if (problema) { toast(problema); return; }
    }
    const { conflict, error, row } = await updateWithConflictCheck(
      "sv_previsoes", svEditandoPrevistoId, svEditandoPrevistoUpdatedAt,
      svPrevistoToRow({ id: svEditandoPrevistoId, ...dados })
    );
    if (error) { toast("Erro ao salvar: " + error.message); return; }
    if (conflict) {
      svCancelarEdicaoPrevisto();
      await svCarregarDados(true);
      svRenderPrevistos();
      toast(CONFLITO_MSG);
      return;
    }
    const i = svState.previsoes.findIndex(x => x.id === svEditandoPrevistoId);
    if (i >= 0) svState.previsoes[i] = svPrevistoFromRow(row);
    svCancelarEdicaoPrevisto();
    svRenderPrevistos();
    toast("Processo previsto atualizado.");
    return;
  }

  const novo = { id: uid("svprev"), ...dados };
  const { data, error } = await sb.from("sv_previsoes").insert({ ...svPrevistoToRow(novo), created_by: currentUser ? currentUser.id : null }).select();
  if (error) { toast("Erro ao adicionar processo: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível adicionar (sem permissão)."); return; }
  svState.previsoes.unshift(svPrevistoFromRow(data[0]));
  svCancelarEdicaoPrevisto(); // limpa o formulário e fecha o popup
  svRenderPrevistos();
  toast("Processo previsto adicionado.");
}

// Devolve true só se o processo foi mesmo excluído (a janela do card usa isso pra decidir se fecha).
async function svExcluirPrevisto(id) {
  if (!(await svCarregarDados(true))) return false; // reservas atualizadas: alguém pode ter reservado agora há pouco
  const alvo = svState.previsoes.find(p => p.id === id);
  if (svState.reservas.some(r => r.previsaoId === id)) { toast("Não é possível excluir: há reservas ligadas a esse processo."); return false; }
  const problemaSaldo = svProblemaDeSaldo(svState.previsoes.filter(p => p.id !== id), null);
  if (problemaSaldo) { toast(problemaSaldo); return false; }
  const ok = await confirmModal("Excluir processo previsto?", `Remove o processo ${alvo ? alvo.numeroProcesso : ""} e as medidas dele desta lista.`);
  if (!ok) return false;
  const { data, error } = await sb.from("sv_previsoes").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir: " + error.message); return false; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou processo já removido)."); return false; }
  if (svEditandoPrevistoId === id) svCancelarEdicaoPrevisto();
  svState.previsoes = svState.previsoes.filter(p => p.id !== id);
  svRenderPrevistos();
  toast("Processo removido.");
  return true;
}

/* ---------- Saldo: calculado dos processos que chegaram menos as reservas ---------- */

// linhas: uma por produto + armazém, com o que chegou (processos FINALIZADO), o que está reservado
//   (reservas ativas), o que já foi vendido e o disponível = chegou − reservado − vendido.
// aChegar: uma por processo ainda não chegado + produto, com o que ainda dá pra reservar (livres).
// Nada disso é gravado: a tela recalcula a cada carga, então não existe saldo "errado" no banco.
function svCalcularEstoque() {
  const linhas = new Map();
  const linha = (codigo, armazem) => {
    const chave = codigo + "|" + (armazem || "");
    if (!linhas.has(chave)) linhas.set(chave, { codigo, armazem: armazem || "", chegou: 0, reservado: 0, vendido: 0, desde: "" });
    return linhas.get(chave);
  };
  const aChegar = new Map();

  svState.previsoes.forEach(p => {
    p.itens.forEach(it => {
      const qtd = Number(it.quantidade) || 0;
      if (!it.codigo || qtd <= 0) return;
      if (svStatusChegou(p.status)) {
        const l = linha(it.codigo, p.armazem);
        l.chegou += qtd;
        // desde: a chegada mais antiga entre os processos desse produto nesse armazém (base do "parado há")
        if (p.dataChegada && (!l.desde || p.dataChegada < l.desde)) l.desde = p.dataChegada;
      } else {
        const chave = p.id + "|" + it.codigo;
        if (!aChegar.has(chave)) aChegar.set(chave, { previsaoId: p.id, codigo: it.codigo, total: 0, reservado: 0, vendido: 0 });
        aChegar.get(chave).total += qtd;
      }
    });
  });

  svState.reservas.forEach(r => {
    if (r.situacao === "CANCELADA") return;
    const campo = r.situacao === "VENDIDA" ? "vendido" : "reservado";
    const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
    if (r.previsaoId && (!prev || !svStatusChegou(prev.status))) {
      const a = aChegar.get(r.previsaoId + "|" + r.codigo);
      if (a) a[campo] += r.quantidade;
      return;
    }
    linha(r.codigo, prev ? prev.armazem : r.armazem)[campo] += r.quantidade;
  });

  return {
    linhas: [...linhas.values()].map(l => ({ ...l, disp: l.chegou - l.reservado - l.vendido })),
    aChegar: [...aChegar.values()].map(a => ({ ...a, livres: a.total - a.reservado - a.vendido }))
  };
}

/* ---------- Trava: mexer num processo não pode furar o saldo ---------- */

// Reservas e vendas já feitas contam contra o que chegou. Editar ou excluir um processo de um jeito que deixe
// o saldo de um produto num armazém abaixo do que já está comprometido é barrado, igual à tela de Reserva, que
// não deixa reservar além do saldo. `novas` = lista de processos como ficaria depois da mudança; `alterado` = o
// processo que mudou (pra conferir as reservas ligadas a ele). Devolve a mensagem do problema, ou "" se é seguro.
// Quem já está negativo (dano antigo) pode corrigir: só barra o que piora.
function svProblemaDeSaldo(novas, alterado) {
  const saldoPorLinha = () => new Map(svCalcularEstoque().linhas.map(l => [l.codigo + "|" + l.armazem, l.disp]));
  const antes = saldoPorLinha();
  const original = svState.previsoes;
  svState.previsoes = novas;
  let depois;
  try { depois = saldoPorLinha(); } finally { svState.previsoes = original; }

  const problemas = [];
  depois.forEach((disp, chave) => {
    const era = antes.has(chave) ? antes.get(chave) : 0;
    if (disp < 0 && disp < era) {
      const [codigo, armazem] = chave.split("|");
      problemas.push(`${codigo} em ${svNomeArmazem(armazem)} ficaria com ${disp} un.`);
    }
  });

  // reservas ligadas ao próprio processo (ainda a caminho): o total do produto não pode cair abaixo do comprometido
  const novo = alterado ? novas.find(p => p.id === alterado.id) : null;
  if (novo && !svStatusChegou(novo.status)) {
    const comprometido = {};
    svState.reservas.filter(r => r.previsaoId === novo.id && r.situacao !== "CANCELADA")
      .forEach(r => { comprometido[r.codigo] = (comprometido[r.codigo] || 0) + r.quantidade; });
    Object.entries(comprometido).forEach(([codigo, qtd]) => {
      const total = novo.itens.filter(it => it.codigo === codigo).reduce((s, it) => s + (Number(it.quantidade) || 0), 0);
      if (total < qtd) problemas.push(`${codigo} no processo ${novo.numeroProcesso} ficaria com ${total} un., mas há ${qtd} reservadas ou vendidas`);
    });
  }

  return problemas.length
    ? `Não dá pra salvar: ${problemas.slice(0, 3).join("; ")}${problemas.length > 3 ? "…" : ""}. Cancele ou ajuste as reservas antes.`
    : "";
}

function svNomeArmazem(armazem) {
  return armazem || "Sem armazém";
}

/* ---------- Catálogo ---------- */

function svRenderCatalogo() {
  const { linhas } = svCalcularEstoque();
  const todas = linhas
    .filter(l => l.chegou - l.vendido > 0 || l.reservado > 0) // lote todo vendido sai (igual ao Dashboard e à Armazenagem)
    .map(l => ({ ...l, produto: svGetProduto(l.codigo) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.armazem.localeCompare(b.armazem));

  const selArmazem = document.getElementById("svCatFiltroArmazem");
  const armazemAtual = selArmazem.value;
  const armazensComEstoque = [...new Set(todas.map(l => l.armazem))];
  const armazens = [...SV_ARMAZENS.filter(a => armazensComEstoque.includes(a)), ...armazensComEstoque.filter(a => a && !SV_ARMAZENS.includes(a))];
  selArmazem.innerHTML = `<option value="">Todos os armazéns</option>` +
    armazens.map(a => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join("") +
    (armazensComEstoque.includes("") ? `<option value="__sem">Sem armazém</option>` : "");
  if ([...selArmazem.options].some(o => o.value === armazemAtual)) selArmazem.value = armazemAtual;

  const selMarca = document.getElementById("svCatFiltroMarca");
  const marcaAtual = selMarca.value;
  const marcas = [...new Set(todas.map(l => l.produto && l.produto.marca).filter(Boolean))].sort();
  selMarca.innerHTML = `<option value="">Todas</option>` + marcas.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join("");
  if (marcas.includes(marcaAtual)) selMarca.value = marcaAtual;

  const busca = (document.getElementById("svCatSearch").value || "").trim().toLowerCase();
  let rows = todas;
  if (busca) rows = rows.filter(l => (l.codigo + " " + (l.produto ? l.produto.medida + " " + l.produto.marca : "")).toLowerCase().includes(busca));
  if (selArmazem.value === "__sem") rows = rows.filter(l => !l.armazem);
  else if (selArmazem.value) rows = rows.filter(l => l.armazem === selArmazem.value);
  if (selMarca.value) rows = rows.filter(l => l.produto && l.produto.marca === selMarca.value);

  document.getElementById("svCatCount").textContent = `Mostrando ${rows.length} de ${todas.length} item(ns) em estoque`;
  const vazio = document.getElementById("svCatEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = todas.length === 0
    ? "Nenhum pneu em estoque ainda. Quando um processo do Estoque Previsto for marcado como FINALIZADO (com o armazém), os pneus aparecem aqui."
    : "Nenhum pneu com esses filtros.";

  document.getElementById("svCatGrid").innerHTML = rows.map(l => {
    const p = l.produto;
    const url = p ? svFotoUrl(p.fotoPath) : null;
    return `
      <div class="sv-cat-card">
        <div class="sv-cat-foto">${url ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(l.codigo)}" loading="lazy">` : "<span>sem foto</span>"}</div>
        <div class="sv-cat-corpo">
          <div class="mono sv-cat-codigo">${escapeHtml(l.codigo)}</div>
          <div class="sv-cat-medida">${p ? escapeHtml(p.medida) + (p.marca ? " — " + escapeHtml(p.marca) : "") : "(produto removido)"}</div>
          <div class="sv-cat-linha">
            <span class="sv-cat-chip">${escapeHtml(svNomeArmazem(l.armazem))}</span>
            <span class="mono sv-cat-disp${l.disp <= 0 ? " zerado" : ""}">${fmt(l.disp)} disp.</span>
          </div>
          ${l.reservado > 0 ? `<div class="sv-cat-reservado">${fmt(l.reservado)} un. reservadas</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

/* ---------- Reserva ---------- */
/* Lista em largura total; "Nova reserva" abre uma janela (pop-up). Mockup: https://claude.ai/artifact/6pB6Yymr9UWbgNG3SWYAcA */

let svResFiltroAtual = "ativas_vendidas";
const SV_RES_FILTROS = [
  { chave: "ativas_vendidas", rotulo: "Ativas e vendidas" },
  { chave: "ativas", rotulo: "Só ativas" },
  { chave: "canceladas", rotulo: "Canceladas e liberadas" },
  { chave: "todas", rotulo: "Todas" }
];
const SV_CAMPOS_RES = ["cliente", "unidade", "vendedor", "representante", "forma", "data", "tipotransp", "transportadora"];
// de qual unidade é a venda (check em sv_reservas.unidade_negocio); só informação, não limita quem vê a reserva
const SV_UNIDADES = { ATACADO: "Atacado", ENCOMENDA: "Encomenda" };
let svResUnidadeAtual = ""; // filtro da lista: "" = todas
// as mesmas formas de pagamento do Varejo (check em sv_reservas.forma_pagamento)
const SV_FORMAS_PAGAMENTO = ["PIX", "CARTÃO", "BOLETO PRÓPRIO", "BOLETO TRADEMASTER"];
// quem cuida do frete: o valor vai pro banco (check em sv_reservas), o texto aparece na tela
const SV_TIPOS_TRANSPORTE = { NOSSO: "Frete nosso", CLIENTE: "Frete do cliente" };
let svPickerAberto = null; // a linha de produto com a lista aberta
let svSalvandoReserva = false;

function svFiltrarPorSituacao(rows, chave) {
  if (chave === "ativas_vendidas") return rows.filter(r => r.situacao !== "CANCELADA");
  if (chave === "ativas") return rows.filter(r => r.situacao === "ATIVA");
  if (chave === "canceladas") return rows.filter(r => r.situacao === "CANCELADA");
  return rows;
}

function svSituacaoReserva(r) {
  if (r.situacao === "CANCELADA" && r.liberada) return { chave: "LIBERADA", rotulo: "Liberada", pill: "pill-atencao" };
  if (r.situacao === "CANCELADA") return { chave: "CANCELADA", rotulo: "Cancelada", pill: "pill-neutro" };
  if (r.situacao === "VENDIDA") return { chave: "VENDIDA", rotulo: "Vendido", pill: "pill-normal" };
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (prev && !svStatusChegou(prev.status)) return { chave: "AGUARDANDO", rotulo: "Aguardando chegada", pill: "pill-azul" };
  return { chave: "RESERVADO", rotulo: "Reservado", pill: "pill-baixo" };
}

// Coluna "Pedido": Total, ou Parcial com quantas unidades do pedido já foram vendidas. O pedido é a reserva original
// (a linha vendida aponta pra ela em reservaOrigemId); a reserva que sobrou e as vendas dela contam juntas.
function svPedidoCelula(r) {
  const parcial = r.tipoPedido === "PARCIAL" || r.pedidoTotal !== null || !!r.reservaOrigemId;
  if (!parcial) return `<span class="status-pill pill-neutro">Total</span>`;
  const origem = r.reservaOrigemId || r.id;
  const vendidas = svState.reservas
    .filter(x => x.situacao === "VENDIDA" && (x.id === origem || x.reservaOrigemId === origem))
    .reduce((s, x) => s + x.quantidade, 0);
  const total = r.pedidoTotal;
  let extra = "";
  if (total && r.situacao === "ATIVA") {
    extra = `<div class="muted sv-sub">${fmt(vendidas)} de ${fmt(total)} vendidas</div>
      <div class="sv-pedido-barra"><i style="width:${Math.min(100, Math.round(vendidas / total * 100))}%"></i></div>`;
  } else if (total && r.situacao === "VENDIDA") {
    extra = `<div class="muted sv-sub">parte de um pedido de ${fmt(total)} un.</div>`;
  } else if (r.liberada) {
    extra = `<div class="muted sv-sub">restante de uma venda parcial</div>`;
  }
  return `<span class="status-pill pill-azul">Parcial</span>${extra}`;
}

function svOrigemReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (!prev) return r.previsaoId ? "processo removido" : svNomeArmazem(r.armazem);
  if (svStatusChegou(prev.status)) return `Processo ${prev.numeroProcesso} · ${svNomeArmazem(prev.armazem)}`;
  return `A caminho · processo ${prev.numeroProcesso}`;
}

// "chega 08/11" ou "sem data prevista" (só enquanto a reserva espera o processo)
function svChegadaReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (!prev || svStatusChegou(prev.status)) return "";
  return prev.dataChegada ? `chega ${formatDateBR(prev.dataChegada).slice(0, 5)}` : "sem data prevista";
}

function svDiasTexto(iso) {
  const n = svDiasDesde(iso);
  if (n === null) return "";
  return n === 0 ? "hoje" : n === 1 ? "ontem" : `há ${n} dias`;
}

function svMontarOpcoesReserva() {
  const { linhas, aChegar } = svCalcularEstoque();
  const opcoes = [];
  linhas.filter(l => l.disp > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.armazem.localeCompare(b.armazem))
    .forEach(l => {
      const p = svGetProduto(l.codigo);
      const medida = p ? p.medida : "(produto removido)";
      opcoes.push({
        tipo: "E", codigo: l.codigo, armazem: l.armazem, disp: l.disp, medida,
        origem: l.armazem ? `Armazém ${svNomeArmazem(l.armazem)}` : svNomeArmazem(l.armazem),
        chip: `${fmt(l.disp)} disp.`,
        rotulo: `${l.codigo} — ${medida} (${l.disp} disp. · ${svNomeArmazem(l.armazem)})`
      });
    });
  aChegar.filter(a => a.livres > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .forEach(a => {
      const prev = svState.previsoes.find(x => x.id === a.previsaoId);
      const p = svGetProduto(a.codigo);
      opcoes.push({
        tipo: "P", codigo: a.codigo, previsaoId: a.previsaoId, disp: a.livres, medida: p ? p.medida : a.codigo,
        origem: `Processo ${prev.numeroProcesso} · ${prev.dataChegada ? "chega " + formatDateBR(prev.dataChegada).slice(0, 5) : "sem data prevista"}`,
        chip: `${fmt(a.livres)} livres`,
        rotulo: `${p ? p.medida : a.codigo} — processo ${prev.numeroProcesso} · ${prev.dataChegada ? "previsão " + formatDateBR(prev.dataChegada) : "sem data prevista"} (${a.livres} livres)`
      });
    });
  return opcoes;
}

function svChaveOpcao(o) {
  return [o.tipo, o.codigo, o.armazem || "", o.previsaoId || ""].join("|");
}

/* ----- erros dentro do campo ----- */

function svErroCampo(chave, msg) {
  document.getElementById(`svResCampo_${chave}`).classList.add("sv-campo-erro");
  document.getElementById(`svResErro_${chave}`).textContent = msg;
}

function svLimparErroCampo(chave) {
  document.getElementById(`svResCampo_${chave}`).classList.remove("sv-campo-erro");
  document.getElementById(`svResErro_${chave}`).textContent = "";
}

function svLimparErrosReserva() {
  SV_CAMPOS_RES.forEach(svLimparErroCampo);
  document.querySelectorAll("#svResExtras .sv-item-erro").forEach(el => { el.textContent = ""; });
}

function svFocarPrimeiroErro() {
  const chave = SV_CAMPOS_RES.find(k => document.getElementById(`svResCampo_${k}`).classList.contains("sv-campo-erro"));
  if (!chave) return;
  const alvo = document.getElementById(`svResCampo_${chave}`).querySelector("button:not(:disabled), input:not([hidden]), select:not(:disabled)");
  if (alvo) alvo.focus();
}

/* ----- produtos do pedido: todas as linhas são iguais (escolha do produto com busca + quantidade ao lado) ----- */

function svOpcaoDaLinha(linha) {
  const v = linha.dataset.idx;
  return v === undefined || v === "" ? null : (svOpcoesReserva[Number(v)] || null);
}

function svLinhasItens() {
  return [...document.querySelectorAll("#svResExtras .sv-item")];
}

function svRenderPickerBotao(linha) {
  const o = svOpcaoDaLinha(linha);
  const btn = linha.querySelector(".sv-picker-botao");
  btn.disabled = svOpcoesReserva.length === 0;
  btn.classList.toggle("sv-picker-preenchido", !!o);
  btn.innerHTML = o
    ? `<span class="sv-picker-lado"><span class="sv-picker-t"><b class="mono">${escapeHtml(o.codigo)}</b> ${escapeHtml(o.medida)}</span><span class="sv-picker-s">${escapeHtml(o.origem)}</span></span>
       <span class="sv-picker-chip">${fmt(o.disp)} disp.</span><span class="sv-picker-trocar">Trocar</span>`
    : `<span class="sv-picker-ph">${svOpcoesReserva.length === 0 ? "Nada disponível" : "Escolha o produto…"}</span><span class="sv-picker-chev" aria-hidden="true">▾</span>`;
}

function svRenderPickerOpcoes(linha) {
  const termo = (linha.querySelector(".sv-picker-busca").value || "").trim().toLowerCase();
  const sel = svOpcaoDaLinha(linha);
  const chaveSel = sel ? svChaveOpcao(sel) : null;
  const itens = svOpcoesReserva.map((o, i) => ({ o, i }))
    .filter(x => !termo || `${x.o.codigo} ${x.o.medida} ${x.o.origem}`.toLowerCase().includes(termo));
  const grupo = (titulo, tipo) => {
    const lista = itens.filter(x => x.o.tipo === tipo);
    if (!lista.length) return "";
    return `<div class="sv-picker-grupo">${escapeHtml(titulo)}</div>` + lista.map(x => {
      const marcada = svChaveOpcao(x.o) === chaveSel;
      return `<button type="button" role="option" class="sv-picker-opcao${marcada ? " sel" : ""}" data-svopcao="${x.i}" aria-selected="${marcada}">
        <span class="sv-picker-lado"><span class="sv-picker-t"><b class="mono">${escapeHtml(x.o.codigo)}</b> ${escapeHtml(x.o.medida)}</span><span class="sv-picker-s">${escapeHtml(x.o.origem)}</span></span>
        <span class="sv-picker-chip${tipo === "P" ? " azul" : ""}">${escapeHtml(x.o.chip)}</span>
      </button>`;
    }).join("");
  };
  linha.querySelector(".sv-picker-opcoes").innerHTML = grupo("Em estoque", "E") + grupo("A caminho (Estoque Previsto)", "P") ||
    `<div class="sv-picker-vazio">${svOpcoesReserva.length ? "Nenhum produto com essa busca." : "Nada disponível."}</div>`;
}

function svAbrirPicker(linha) {
  if (svOpcoesReserva.length === 0) return;
  if (svPickerAberto) svFecharPicker();
  svPickerAberto = linha;
  linha.querySelector(".sv-picker-painel").hidden = false;
  linha.querySelector(".sv-picker-botao").setAttribute("aria-expanded", "true");
  const busca = linha.querySelector(".sv-picker-busca");
  busca.value = "";
  svRenderPickerOpcoes(linha);
  busca.focus();
}

function svFecharPicker(devolverFoco) {
  const linha = svPickerAberto;
  svPickerAberto = null;
  if (!linha) return;
  linha.querySelector(".sv-picker-painel").hidden = true;
  const btn = linha.querySelector(".sv-picker-botao");
  btn.setAttribute("aria-expanded", "false");
  if (devolverFoco) btn.focus();
}

function svEscolherOpcao(linha, i) {
  linha.dataset.idx = String(i);
  linha.dataset.chave = svChaveOpcao(svOpcoesReserva[i]);
  svFecharPicker();
  linha.querySelector(".sv-item-erro").textContent = "";
  svAtualizarLinha(linha);
  svAtualizarResumoReserva();
  linha.querySelector(".sv-item-qtd").focus();
}

// máximo e dica de "máx." da quantidade e botão do produto de uma linha
function svAtualizarLinha(linha) {
  const o = svOpcaoDaLinha(linha);
  linha.querySelector(".sv-item-qtd").max = o ? String(o.disp) : "";
  linha.querySelector(".sv-qtd-max").textContent = o ? `máx. ${fmt(o.disp)}` : "";
  svRenderPickerBotao(linha);
}

function svAtualizarNotaDisponivel() {
  const nada = svOpcoesReserva.length === 0;
  const aviso = document.getElementById("svResDisp");
  aviso.textContent = nada ? "Nada disponível: marque um processo como FINALIZADO (com armazém) ou cadastre um processo a caminho no Estoque Previsto." : "";
  aviso.style.display = nada ? "" : "none";
  svLinhasItens().forEach(svAtualizarLinha);
  svAtualizarResumoReserva();
}

// todas as linhas do pedido, na ordem da tela
function svLerItens() {
  return svLinhasItens().map(linha => ({
    linha, opcao: svOpcaoDaLinha(linha), quantidade: parseInt(linha.querySelector(".sv-item-qtd").value, 10)
  }));
}

// rodapé da janela: resumo do que vai ser reservado e rótulo do botão ("Reservar 30 un.")
function svAtualizarResumoReserva() {
  const cliente = document.getElementById("svResCliente").value.trim();
  const resumo = document.getElementById("svResResumo");
  const ok = svLerItens().filter(x => x.opcao && x.quantidade > 0);
  const totalUn = ok.reduce((s, x) => s + x.quantidade, 0);
  const temProduto = svLerItens().some(x => x.opcao);
  if (!temProduto) resumo.textContent = "Escolha o produto para continuar.";
  else if (ok.length > 1) resumo.innerHTML = `${ok.length} produtos, ${fmt(totalUn)} un.${cliente ? " para " + escapeHtml(cliente) : ""}`;
  else if (ok.length === 1) resumo.innerHTML = `${fmt(totalUn)} un. de <span class="mono">${escapeHtml(ok[0].opcao.codigo)}</span>${cliente ? " para " + escapeHtml(cliente) : ""}`;
  else resumo.textContent = "";
  const botao = document.getElementById("svBtnSubmitReserva");
  botao.textContent = totalUn > 0 ? `Reservar ${fmt(totalUn)} un.` : "Reservar";
  botao.disabled = !temProduto || svSalvandoReserva;
}

function svAdicionarItem(removivel) {
  const linha = document.createElement("div");
  linha.className = "sv-item";
  linha.innerHTML = `
    <div class="sv-item-prod">
      <div class="sv-picker">
        <button type="button" class="sv-picker-botao" aria-haspopup="listbox" aria-expanded="false" aria-label="Produto"></button>
        <div class="sv-picker-painel" hidden>
          <input type="search" class="sv-picker-busca" placeholder="Buscar por código ou medida…" aria-label="Buscar produto" autocomplete="off">
          <div class="sv-picker-opcoes" role="listbox"></div>
        </div>
      </div>
    </div>
    <div class="sv-qtd-wrap">
      <input type="number" class="sv-item-qtd" min="1" step="1" placeholder="Qtd." aria-label="Quantidade">
      <span class="sv-qtd-max"></span>
    </div>
    ${removivel ? `<button type="button" class="sv-extra-rm" aria-label="Remover produto">✕</button>` : `<span></span>`}
    <div class="sv-erro-msg sv-item-erro" role="alert"></div>`;
  document.getElementById("svResExtras").appendChild(linha);
  svAtualizarLinha(linha);
  svAtualizarResumoReserva();
  return linha;
}

// depois de uma recarga das opções: cada linha mantém o produto escolhido (pela chave, não pela posição)
function svRefazerItens() {
  svLinhasItens().forEach(linha => {
    const chave = linha.dataset.chave || "";
    const i = chave ? svOpcoesReserva.findIndex(o => svChaveOpcao(o) === chave) : -1;
    if (i >= 0) linha.dataset.idx = String(i);
    else { delete linha.dataset.idx; delete linha.dataset.chave; }
    svAtualizarLinha(linha);
    if (svPickerAberto === linha) svRenderPickerOpcoes(linha);
  });
}

function svLigarItens() {
  const caixa = document.getElementById("svResExtras");
  document.getElementById("svResAddProduto").addEventListener("click", () => {
    svAdicionarItem(true).querySelector(".sv-picker-botao").click();
  });
  caixa.addEventListener("click", (e) => {
    const linha = e.target.closest(".sv-item");
    if (!linha) return;
    if (e.target.closest(".sv-extra-rm")) {
      if (svPickerAberto === linha) svFecharPicker();
      linha.remove();
      svAtualizarResumoReserva();
    } else if (e.target.closest(".sv-picker-botao")) {
      if (svPickerAberto === linha) svFecharPicker(true); else svAbrirPicker(linha);
    } else if (e.target.closest("[data-svopcao]")) {
      svEscolherOpcao(linha, Number(e.target.closest("[data-svopcao]").dataset.svopcao));
    }
  });
  caixa.addEventListener("input", (e) => {
    const linha = e.target.closest(".sv-item");
    if (!linha) return;
    if (e.target.classList.contains("sv-picker-busca")) svRenderPickerOpcoes(linha);
    else { linha.querySelector(".sv-item-erro").textContent = ""; svAtualizarResumoReserva(); }
  });
  caixa.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.classList.contains("sv-picker-busca")) return;
    e.preventDefault(); // Enter na busca escolhe o primeiro resultado, não envia o formulário
    const linha = e.target.closest(".sv-item");
    const primeira = linha.querySelector("[data-svopcao]");
    if (primeira) svEscolherOpcao(linha, Number(primeira.dataset.svopcao));
  });
}

function svRenderReservaForm() {
  svOpcoesReserva = svMontarOpcoesReserva();
  svRefazerItens();
  svAtualizarNotaDisponivel();

  document.getElementById("svListaClientes").innerHTML =
    svClientes.map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");

  // Vendedor interno (lista cadastrada em Administração), Representante (ativos, ou "Sem representante") e
  // Forma de pagamento (fixa, a do Varejo). Todos começam em "Selecione…": nenhum vem preenchido sozinho.
  const selVendedor = document.getElementById("svResVendedor");
  const vendedorAnterior = selVendedor.value;
  selVendedor.innerHTML = `<option value="">${svVendedores.length ? "Selecione…" : "Nenhum vendedor cadastrado"}</option>` +
    svVendedores.map(v => `<option value="${escapeAttr(v.nome)}">${escapeHtml(rotuloVendedor(v.nome))}</option>`).join("");
  if (svVendedores.some(v => v.nome === vendedorAnterior)) selVendedor.value = vendedorAnterior;
  selVendedor.disabled = svVendedores.length === 0;
  document.getElementById("svResVendedorAviso").style.display = svVendedores.length === 0 ? "" : "none";

  const selRep = document.getElementById("svResRepresentante");
  const repAnterior = selRep.value;
  // os com login de representante e os cadastrados à parte em Administração (sem login), numa lista só
  const representantes = nomesSemDuplicados([...(state.representantes || []), ...svRepresentantes.map(r => r.nome)].filter(Boolean), state.representantes || []);
  selRep.innerHTML = `<option value="">Selecione…</option><option value="${SV_SEM_REPRESENTANTE}">Sem representante</option>` +
    representantes.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(rotuloVendedor(n))}</option>`).join("");
  if ([...selRep.options].some(o => o.value === repAnterior)) selRep.value = repAnterior;

  const selForma = document.getElementById("svResForma");
  const formaAnterior = selForma.value;
  selForma.innerHTML = svOpcoesForma("");
  selForma.value = formaAnterior; // mantém a escolha quando a lista é refeita (por valor, não por "selected": o reset da janela não pode trazê-la de volta)
  const selUnidade = document.getElementById("svResUnidade");
  // Reserva nova é sempre do Atacado: campo fixo, sem a opção Encomenda (reservas antigas continuam mostrando a unidade que tinham)
  selUnidade.innerHTML = `<option value="ATACADO" selected>${escapeHtml(SV_UNIDADES.ATACADO)}</option>`;
  selUnidade.value = "ATACADO";
  selUnidade.disabled = true;

  const selTipo = document.getElementById("svResTipoTransporte");
  const tipoAnterior = selTipo.value;
  selTipo.innerHTML = `<option value="">Selecione…</option>` +
    Object.entries(SV_TIPOS_TRANSPORTE).map(([valor, rotulo]) => `<option value="${valor}">${escapeHtml(rotulo)}</option>`).join("");
  if (SV_TIPOS_TRANSPORTE[tipoAnterior]) selTipo.value = tipoAnterior;

  const selTransp = document.getElementById("svResTransportadora");
  const transpAnterior = selTransp.value;
  selTransp.innerHTML = `<option value="">${svTransportadoras.length ? "Selecione…" : "Nenhuma transportadora cadastrada"}</option>` +
    svTransportadoras.map(t => `<option value="${escapeAttr(t.nome)}">${escapeHtml(t.nome)}</option>`).join("");
  if (svTransportadoras.some(t => t.nome === transpAnterior)) selTransp.value = transpAnterior;
  selTransp.disabled = svTransportadoras.length === 0;
  document.getElementById("svResTransportadoraAviso").style.display = svTransportadoras.length === 0 ? "" : "none";
  svAtualizarRetiraReserva();
}

// "Cliente retira" só aparece com Frete do cliente; marcado, a transportadora some e deixa de ser obrigatória
function svAtualizarRetiraReserva() {
  const tipo = document.getElementById("svResTipoTransporte").value;
  const caixa = document.getElementById("svResClienteRetira");
  document.getElementById("svResRetiraCampo").style.display = tipo === "CLIENTE" ? "" : "none";
  if (tipo !== "CLIENTE") caixa.checked = false;
  const retira = caixa.checked;
  document.getElementById("svResCampo_transportadora").style.display = retira ? "none" : "";
}

// Pedido da reserva: Total (cliente leva tudo de uma vez, o padrão) ou Parcial (leva em partes)
const SV_PEDIDO_NOTAS = {
  TOTAL: "Cliente leva tudo de uma vez.",
  PARCIAL: "Cliente leva em partes. Dá para confirmar a venda mais de uma vez."
};
function svTipoPedidoReserva() {
  const on = document.querySelector("#svResPedido [data-svpedido].on");
  return on ? on.dataset.svpedido : "TOTAL";
}
function svEscolherPedidoReserva(tipo) {
  document.querySelectorAll("#svResPedido [data-svpedido]").forEach(b => {
    const ligado = b.dataset.svpedido === tipo;
    b.classList.toggle("on", ligado);
    b.setAttribute("aria-pressed", String(ligado));
  });
  document.getElementById("svResPedidoNota").textContent = SV_PEDIDO_NOTAS[tipo];
}

function svAbrirNovaReserva() {
  document.getElementById("svFormReserva").reset();
  document.getElementById("svResExtras").innerHTML = "";
  svEscolherPedidoReserva("TOTAL");
  svPickerAberto = null;
  document.getElementById("svResData").value = todayISO();
  svLimparErrosReserva();
  svRenderReservaForm();
  svAdicionarItem(false);
  document.getElementById("svResOverlay").classList.add("show");
  const primeiro = document.querySelector("#svResExtras .sv-picker-botao");
  (primeiro.disabled ? document.getElementById("svResCliente") : primeiro).focus();
}

function svFecharNovaReserva() {
  svFecharPicker();
  document.getElementById("svResOverlay").classList.remove("show");
}

// limpa o erro do campo mexido e mantém o resumo do rodapé em dia
function svAoMudarFormReserva(e) {
  const campo = e.target.closest("[id^='svResCampo_']");
  if (campo) svLimparErroCampo(campo.id.replace("svResCampo_", ""));
  if (e.target.id === "svResCliente") svAtualizarResumoReserva();
}

function svRenderReservaKpis() {
  const ativas = svState.reservas.filter(r => r.situacao === "ATIVA");
  const aguardando = ativas.filter(r => svSituacaoReserva(r).chave === "AGUARDANDO").length;
  const pneus = ativas.reduce((soma, r) => soma + r.quantidade, 0);
  document.getElementById("svResKpis").innerHTML = `
    <div class="kpi"><div class="lbl">Reservas ativas</div><div class="val">${fmt(ativas.length)}</div></div>
    <div class="kpi accent"><div class="lbl">Pneus reservados</div><div class="val">${fmt(pneus)} un.</div></div>
    <div class="kpi"><div class="lbl">Aguardando chegada</div><div class="val">${fmt(aguardando)}</div></div>
  `;
}

function svRenderReservaChips() {
  document.getElementById("svResChips").innerHTML = SV_RES_FILTROS.map(f => {
    const ligado = f.chave === svResFiltroAtual;
    return `<button type="button" class="sv-chip${ligado ? " on" : ""}" data-svfiltro="${f.chave}" aria-pressed="${ligado}">${escapeHtml(f.rotulo)} <b>${fmt(svFiltrarPorSituacao(svState.reservas, f.chave).length)}</b></button>`;
  }).join("");
  document.getElementById("svResChipsUnidade").innerHTML = Object.entries(SV_UNIDADES).filter(([valor]) => valor !== "ENCOMENDA").map(([valor, rotulo]) => {
    const ligado = valor === svResUnidadeAtual;
    return `<button type="button" class="sv-chip sv-chip-un${ligado ? " on" : ""}" data-svunidade="${valor}" aria-pressed="${ligado}">${escapeHtml(rotulo)} <b>${fmt(svState.reservas.filter(r => r.unidadeNegocio === valor).length)}</b></button>`;
  }).join("");
}

// situação, detalhe da situação, dia e botões de uma reserva (usado na linha normal e dentro do pedido aberto)
// produtos de um pedido que ainda estão ativos (e que quem vê pode mexer: reserva mascarada não entra)
function svPedidoAtivas(r) {
  if (!r.pedidoId) return [];
  return svState.reservas.filter(x => x.pedidoId === r.pedidoId && x.situacao === "ATIVA" && !svReservaMascarada(x));
}

function svPartesReserva(r) {
  const sit = svSituacaoReserva(r);
  const vendido = r.situacao === "VENDIDA";
  const total = vendido && r.precoUnitario !== null ? Math.round(r.precoUnitario * r.quantidade * 100) / 100 : null;
  const sitExtra = sit.chave === "AGUARDANDO"
    ? `<div class="muted sv-sub">${escapeHtml(svChegadaReserva(r))}</div>`
    : vendido
      ? (total !== null
          ? `<div class="sv-valor mono">${escapeHtml(formatMoney(total))}</div><div class="muted sv-sub">${fmt(r.quantidade)} × ${escapeHtml(formatMoney(r.precoUnitario))}</div>`
          : `<div class="muted sv-sub">sem preço</div>`)
      : "";
  const dataExtra = r.situacao === "ATIVA" ? svDiasTexto(r.data)
    : (vendido && r.vendidoEm ? `vendido em ${formatDateBR(r.vendidoEm).slice(0, 5)}` : "");
  // produto de um pedido com 2 ou mais ativos: a venda é do pedido inteiro (botão na linha do pedido), então aqui só Cancelar
  const vendaDoPedido = svPedidoAtivas(r).length > 1;
  const acoes = r.situacao === "ATIVA" && !svReservaMascarada(r)
    ? `${vendaDoPedido ? "" : `<button type="button" class="btn small outline sv-write" data-svresedit="${escapeAttr(r.id)}">Editar</button>
       <button type="button" class="btn small outline sv-vender sv-write" data-svresvender="${escapeAttr(r.id)}">Confirmar venda</button>
       `}<button type="button" class="sv-link sv-cancelar sv-write" data-svrescancelar="${escapeAttr(r.id)}">Cancelar</button>`
    : vendido && !svReservaMascarada(r)
      ? `<button type="button" class="btn small outline" data-svpedpdf="${escapeAttr(r.id)}">Pedido (PDF)</button>`
      : `<span class="muted">—</span>`;
  return { sit, sitExtra, dataExtra, acoes };
}

function svProdutoCelula(r) {
  const p = svGetProduto(r.codigo);
  return `<span class="mono">${escapeHtml(r.codigo)}</span><div class="muted sv-sub">${escapeHtml(p ? p.medida : "(produto removido)")}</div><div class="muted sv-sub">${escapeHtml(svOrigemReserva(r))}</div>`;
}

// cliente, vendedor, representante, forma, transporte e unidade: iguais em todos os produtos do pedido
function svCelulasComunsReserva(r) {
  return `
        <td>${svReservaMascarada(r) ? `<span class="muted">${escapeHtml(r.cliente)}</span>` : escapeHtml(r.cliente)}${r.obs ? `<div class="sv-obs">${escapeHtml(r.obs)}</div>` : ""}</td>
        <td>${escapeHtml(r.vendedorInterno)}</td>
        <td>${r.representante ? escapeHtml(r.representante) : '<span class="sv-sem-rep">Sem representante</span>'}</td>
        <td>${svFormaCelula(r)}</td>
        <td>${r.clienteRetira ? '<span class="sv-tt cli">Cliente retira</span>' : r.tipoTransporte ? `<span class="sv-tt ${r.tipoTransporte === "NOSSO" ? "nosso" : "cli"}">${escapeHtml(SV_TIPOS_TRANSPORTE[r.tipoTransporte] || r.tipoTransporte)}</span>${r.transportadora ? `<div class="sv-transp">${escapeHtml(r.transportadora)}</div>` : ""}` : '<span class="muted">—</span><div class="muted sv-sub">reserva antiga</div>'}</td>
        <td>${r.unidadeNegocio ? `<span class="sv-un ${r.unidadeNegocio === "ATACADO" ? "atacado" : "encomenda"}">${escapeHtml(SV_UNIDADES[r.unidadeNegocio] || r.unidadeNegocio)}</span>` : '<span class="muted">—</span><div class="muted sv-sub">reserva antiga</div>'}</td>`;
}

function svLinhaReserva(r) {
  const { sit, sitExtra, dataExtra, acoes } = svPartesReserva(r);
  return `
      <tr>
        <td>${svProdutoCelula(r)}</td>${svCelulasComunsReserva(r)}
        <td class="mono">${fmt(r.quantidade)}</td>
        <td>${svPedidoCelula(r)}</td>
        <td><span class="status-pill ${sit.pill}">${escapeHtml(sit.rotulo)}</span>${sitExtra}</td>
        <td><span class="mono">${r.data ? formatDateBR(r.data) : "—"}</span>${dataExtra ? `<div class="muted sv-sub">${escapeHtml(dataExtra)}</div>` : ""}</td>
        <td class="sv-acoes">${acoes}</td>
      </tr>`;
}

// pedido com vários produtos: uma linha-resumo que abre e mostra cada produto com a sua situação e os seus botões
let svPedidosAbertos = new Set();

function svLinhaPedido(membros) {
  const r0 = membros[0];
  const id = r0.pedidoId;
  const aberto = svPedidosAbertos.has(id);
  const total = membros.reduce((s, r) => s + r.quantidade, 0);
  const sits = membros.map(r => svSituacaoReserva(r).chave);
  const ativas = sits.filter(c => c === "RESERVADO" || c === "AGUARDANDO").length;
  const vendidas = sits.filter(c => c === "VENDIDA").length;
  const fora = membros.length - ativas - vendidas;
  const partes = [];
  if (ativas) partes.push(`${ativas} ${ativas === 1 ? "ativa" : "ativas"}`);
  if (vendidas) partes.push(`${vendidas} ${vendidas === 1 ? "vendida" : "vendidas"}`);
  if (fora) partes.push(`${fora} ${fora === 1 ? "cancelada" : "canceladas"}`);
  const pill = ativas ? "pill-baixo" : vendidas && !fora ? "pill-normal" : "pill-neutro";
  const codigos = membros.map(r => r.codigo);
  const resumoCodigos = codigos.slice(0, 3).join(", ") + (codigos.length > 3 ? ` +${codigos.length - 3}` : "");
  const linha = `
      <tr class="sv-ped-linha${aberto ? " aberto" : ""}" data-svpedido="${escapeAttr(id)}" tabindex="0" role="button" aria-expanded="${aberto}" aria-label="Pedido de ${escapeAttr(r0.cliente)} com ${membros.length} produtos. ${aberto ? "Fechar" : "Abrir"} os produtos">
        <td><span class="sv-ped-car" aria-hidden="true">${aberto ? "▾" : "▸"}</span> <b>${membros.length} produtos</b><div class="muted sv-sub mono">${escapeHtml(resumoCodigos)}</div></td>${svCelulasComunsReserva(r0)}
        <td class="mono">${fmt(total)}</td>
        <td>${svPedidoCelula(r0)}</td>
        <td><span class="status-pill ${pill}">${escapeHtml(partes.join(" · "))}</span></td>
        <td><span class="mono">${r0.data ? formatDateBR(r0.data) : "—"}</span></td>
        <td class="sv-acoes">${svPedidoAtivas(r0).length > 1
          ? `<button type="button" class="btn small outline sv-write" data-svpededit="${escapeAttr(id)}">Editar pedido</button>
             <button type="button" class="btn small outline sv-vender sv-write" data-svpedvender="${escapeAttr(id)}">Confirmar venda do pedido</button>
             <button type="button" class="sv-link sv-cancelar sv-write" data-svpedcancelar="${escapeAttr(id)}">Cancelar pedido</button>`
          : svDocUnicoDoPedido(membros)
            ? `<button type="button" class="btn small outline" data-svpedpdf="${escapeAttr(svDocUnicoDoPedido(membros).id)}">Pedido (PDF)</button>`
            : `<span class="muted">abrir</span>`}</td>
      </tr>`;
  if (!aberto) return linha;
  const itens = membros.map(r => {
    const { sit, sitExtra, dataExtra, acoes } = svPartesReserva(r);
    return `<div class="sv-ped-item">
        <div>${svProdutoCelula(r)}</div>
        <div class="mono">${fmt(r.quantidade)} un.</div>
        <div><span class="status-pill ${sit.pill}">${escapeHtml(sit.rotulo)}</span>${sitExtra}${dataExtra ? `<div class="muted sv-sub">${escapeHtml(dataExtra)}</div>` : ""}</div>
        <div class="sv-acoes">${acoes}</div>
      </div>`;
  }).join("");
  return linha + `
      <tr class="sv-ped-det"><td colspan="12"><div class="sv-ped-itens">${itens}</div></td></tr>`;
}

function svRenderReservaTabela() {
  svRenderReservaChips();
  const busca = (document.getElementById("svResSearch").value || "").trim().toLowerCase();
  let rows = svFiltrarPorSituacao(svState.reservas.slice(), svResFiltroAtual);
  if (svResUnidadeAtual) rows = rows.filter(r => r.unidadeNegocio === svResUnidadeAtual);
  if (busca) {
    rows = rows.filter(r => {
      const p = svGetProduto(r.codigo);
      return [r.cliente, r.vendedorInterno, r.representante || "", r.codigo, p ? p.medida : "", r.formaPagamento, r.condicaoPagamento, r.transportadora, r.clienteRetira ? "cliente retira" : "", SV_UNIDADES[r.unidadeNegocio] || "", r.obs].join(" ").toLowerCase().includes(busca);
    });
  }
  rows.sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

  document.getElementById("svResCount").textContent = `${rows.length} de ${svState.reservas.length} reserva(s)`;
  const vazio = document.getElementById("svResEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.innerHTML = svState.reservas.length === 0
    ? `<div class="sv-vazio"><div class="sv-vazio-t">Nenhuma reserva ainda.</div>
        <div class="sv-vazio-d">Reserve um pneu em estoque ou a caminho para um cliente. A reserva trava o item para ninguém mais oferecer.</div>
        <button type="button" class="btn primary sv-write" id="svBtnNovaReservaVazio">Nova reserva</button></div>`
    : `<div class="sv-vazio"><div class="sv-vazio-t">Nenhuma reserva com esses filtros.</div>
        <button type="button" class="sv-link" id="svResLimpar">Limpar busca e filtros</button></div>`;

  const tbody = document.getElementById("svResTbody");
  // produtos do mesmo pedido (pedido_id) viram uma linha só que abre; pedido de 1 produto (ou 1 sobrando no filtro) é linha normal
  const emitidos = new Set();
  const blocos = [];
  rows.forEach(r => {
    if (r.pedidoId) {
      if (emitidos.has(r.pedidoId)) return;
      const membros = rows.filter(x => x.pedidoId === r.pedidoId);
      if (membros.length > 1) { emitidos.add(r.pedidoId); blocos.push(membros); return; }
    }
    blocos.push([r]);
  });
  tbody.innerHTML = blocos.map(b => b.length === 1 ? svLinhaReserva(b[0]) : svLinhaPedido(b)).join("");

  tbody.querySelectorAll(".sv-ped-linha").forEach(tr => {
    const alternar = () => {
      const id = tr.dataset.svpedido;
      if (svPedidosAbertos.has(id)) svPedidosAbertos.delete(id); else svPedidosAbertos.add(id);
      svRenderReservaTabela();
      const volta = [...document.querySelectorAll("#svResTbody .sv-ped-linha")].find(x => x.dataset.svpedido === id);
      if (volta) volta.focus();
    };
    tr.addEventListener("click", (e) => { if (!e.target.closest("button, a")) alternar(); });
    tr.addEventListener("keydown", (e) => {
      if (e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternar(); }
    });
  });
  tbody.querySelectorAll("[data-svresvender]").forEach(btn => {
    btn.addEventListener("click", () => svMudarSituacaoReserva(btn.dataset.svresvender, "VENDIDA"));
  });
  tbody.querySelectorAll("[data-svresedit]").forEach(btn => {
    btn.addEventListener("click", () => svAbrirEdicaoReserva(btn.dataset.svresedit));
  });
  tbody.querySelectorAll("[data-svpededit]").forEach(btn => {
    btn.addEventListener("click", () => { const ativas = svState.reservas.filter(x => x.pedidoId === btn.dataset.svpededit && x.situacao === "ATIVA" && !svReservaMascarada(x)); if (ativas.length) svAbrirEdicaoReserva(ativas[0].id); });
  });
  tbody.querySelectorAll("[data-svpedvender]").forEach(btn => {
    btn.addEventListener("click", () => svVenderPedido(btn.dataset.svpedvender));
  });
  tbody.querySelectorAll("[data-svpedpdf]").forEach(btn => {
    btn.addEventListener("click", () => svGerarPedido(btn.dataset.svpedpdf, btn));
  });
  tbody.querySelectorAll("[data-svpedcancelar]").forEach(btn => {
    btn.addEventListener("click", () => svCancelarPedido(btn.dataset.svpedcancelar));
  });
  tbody.querySelectorAll("[data-svrescancelar]").forEach(btn => {
    btn.addEventListener("click", () => svMudarSituacaoReserva(btn.dataset.svrescancelar, "CANCELADA"));
  });
}

function svRenderReserva() {
  svRenderReservaForm();
  svRenderReservaKpis();
  svRenderReservaTabela();
}

// Linha da tabela de Reservas: forma de pagamento (e o que ela traz: divisão, valor recebido, condição antiga)
function svFormaCelula(r) {
  const div = Array.isArray(r.divisaoPagamento) && r.divisaoPagamento.length ? r.divisaoPagamento : null;
  if (div) {
    const formas = [...new Set(div.map(p => p.forma_pagamento))];
    return `${escapeHtml(formas.join(" + "))}<div class="muted sv-sub">pago em ${div.length} ${div.length === 1 ? "forma" : "formas"}</div>`;
  }
  if (r.formaPagamento) {
    const extra = r.valorRecebido !== null ? `<div class="muted sv-sub">recebido ${escapeHtml(formatMoney(r.valorRecebido))}</div>` : "";
    return `${escapeHtml(r.formaPagamento)}${extra}`;
  }
  // reserva feita com a lista antiga de condições: o texto continua visível
  if (r.condicaoPagamento) return `<span class="muted">${escapeHtml(r.condicaoPagamento)}</span><div class="muted sv-sub">condição antiga</div>`;
  return '<span class="muted">—</span><div class="muted sv-sub">reserva antiga</div>';
}

function svOpcoesForma(selecionada) {
  return `<option value="">Selecione…</option>` +
    SV_FORMAS_PAGAMENTO.map(f => `<option value="${escapeAttr(f)}"${f === selecionada ? " selected" : ""}>${escapeHtml(f)}</option>`).join("");
}

// uma linha da divisão do pagamento (forma + valor), como no Varejo
function svCriarLinhaDivisao() {
  const row = document.createElement("div");
  row.className = "sv-div-linha";
  row.innerHTML = `
    <select class="sv-div-forma" aria-label="Forma de pagamento desta parte">${svOpcoesForma("")}</select>
    <input type="number" class="sv-div-valor" min="0" step="0.01" placeholder="Valor (R$)" aria-label="Valor desta parte">
    <button type="button" class="btn small danger sv-div-remover" title="Remover" aria-label="Remover esta forma">✕</button>`;
  return row;
}

// Janela do "Confirmar venda": pede o preço por unidade (já preenchido com o preço de proposta do produto), a forma
// de pagamento (já preenchida com a da reserva), o valor recebido (só Boleto Trademaster), a divisão do pagamento
// (opcional, como no Varejo) e o transporte, e mostra o total ao vivo. Devolve
// { preco, forma, valorRecebido, divisao, tipo, transportadora } ou null se a pessoa cancelou.
// `membros`: os produtos ativos de um pedido (2 ou mais). Com ele a janela vende o pedido inteiro, com um preço por produto;
// forma de pagamento, divisão e transporte são uma vez só (iguais em todos os produtos do pedido). `r` = o primeiro deles.
// Resultado do pedido: { precos: { [idDaReserva]: preço }, forma, valorRecebido, divisao, tipo, clienteRetira, transportadora }.
function svVendaModal(r, membros) {
  const pedido = Array.isArray(membros) && membros.length > 1;
  return new Promise(resolve => {
    const $ = (id) => document.getElementById(id);
    const overlay = $("svVendaOverlay");
    const input = $("svVendaPreco");
    const selForma = $("svVendaForma");
    const tmRow = $("svVendaTrademasterRow");
    const recebido = $("svVendaValorRecebido");
    const difEl = $("svVendaDiferenca");
    const chkDividir = $("svVendaDividir");
    const boxDiv = $("svVendaDivisaoBox");
    const listaDiv = $("svVendaDivisaoLista");
    const resumoDiv = $("svVendaDivisaoResumo");
    const btnAddDiv = $("svVendaAddDivisao");
    const selTipo = $("svVendaTipoTransp");
    const selTransp = $("svVendaTransportadora");
    const erro = $("svVendaErro");
    const totalEl = $("svVendaTotal");
    const contaEl = $("svVendaConta");
    const okBtn = $("svVendaOk");
    const cancelBtn = $("svVendaCancelar");
    const produto = svGetProduto(r.codigo);
    const temPreco = !!produto && produto.preco !== null;
    // venda total (todas as unidades da reserva) ou parcial (só uma parte, e a sobra continua reservada ou é liberada)
    const segModo = $("svVendaModo");
    const btnModoTotal = $("svVendaModoTotal");
    const btnModoParcial = $("svVendaModoParcial");
    const boxParcial = $("svVendaParcialBox");
    const qtdInput = $("svVendaQtd");
    const qtdNota = $("svVendaQtdNota");
    const restoEl = $("svVendaResto");
    const podeParcial = r.quantidade >= 2;
    let modo = !pedido && podeParcial && (r.tipoPedido === "PARCIAL" || r.pedidoTotal !== null) ? "PARCIAL" : "TOTAL";
    btnModoTotal.textContent = `Total · ${fmt(r.quantidade)} un.`;
    btnModoParcial.disabled = !podeParcial;
    btnModoParcial.title = podeParcial ? "" : "Só tem 1 unidade reservada: não dá pra dividir.";
    qtdInput.max = String(r.quantidade - 1);
    qtdInput.value = "";
    document.querySelector('input[name="svVendaSobra"][value="MANTER"]').checked = true;
    const qtdPedido = pedido ? membros.reduce((s, m) => s + m.quantidade, 0) : r.quantidade;
    $("svVendaTitulo").textContent = pedido ? "Confirmar venda do pedido?" : "Confirmar venda?";
    $("svVendaOk").textContent = pedido ? "Confirmar venda do pedido" : "Confirmar venda";
    $("svVendaTexto").textContent = pedido
      ? `Pedido de ${r.cliente}: ${membros.length} produtos, ${fmt(qtdPedido)} un. Informe o preço por unidade de cada produto.`
      : `Reserva de ${r.quantidade} un. de ${r.codigo} para ${r.cliente}.`;
    // pedido: sem Total/Parcial e sem o campo de preço único; entra uma linha de preço para cada produto
    $("svVendaModoCampo").style.display = pedido ? "none" : "";
    $("svVendaPrecoCampo").style.display = pedido ? "none" : "";
    $("svVendaPedidoBox").style.display = pedido ? "" : "none";
    const listaPrecos = $("svVendaPedidoLinhas");
    listaPrecos.innerHTML = pedido ? membros.map(m => {
      const prod = svGetProduto(m.codigo);
      const preco = prod && prod.preco !== null ? prod.preco : "";
      return `<div class="sv-ped-preco-linha">
          <div class="sv-ped-preco-prod"><span class="mono">${escapeHtml(m.codigo)}</span><span class="muted sv-sub">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span></div>
          <div class="mono sv-ped-preco-qtd">${fmt(m.quantidade)} un.</div>
          <input type="number" class="sv-ped-preco" data-svpedid="${escapeAttr(m.id)}" min="0" step="0.01" placeholder="0,00" value="${escapeAttr(String(preco))}" aria-label="Preço por unidade de ${escapeAttr(m.codigo)}">
        </div>`;
    }).join("") : "";
    $("svVendaDica").textContent = temPreco
      ? "Já vem com o preço registrado do produto. Mude se vendeu por outro valor."
      : "Digite o preço da venda.";
    input.value = temPreco ? produto.preco : "";
    erro.style.display = "none";

    // forma de pagamento: a da reserva; reserva feita com a lista antiga de condições precisa escolher
    selForma.innerHTML = svOpcoesForma(r.formaPagamento || "");
    $("svVendaFormaDica").textContent = r.formaPagamento
      ? "Veio da reserva. Mude se combinaram outra forma na hora de vender."
      : (r.condicaoPagamento
          ? `Essa reserva tem a condição antiga “${r.condicaoPagamento}”. Escolha a forma de pagamento para confirmar a venda.`
          : "Essa reserva é de antes do campo existir e veio sem forma de pagamento. Escolha uma para confirmar a venda.");
    recebido.value = "";
    chkDividir.checked = false;
    boxDiv.style.display = "none";
    listaDiv.innerHTML = "";
    resumoDiv.innerHTML = "";

    // tipo de transporte (duas opções fixas) e transportadora (lista do admin, mais a que a reserva já tem)
    selTipo.innerHTML = `<option value="">Selecione…</option>` +
      Object.entries(SV_TIPOS_TRANSPORTE).map(([valor, rotulo]) => `<option value="${valor}">${escapeHtml(rotulo)}</option>`).join("");
    selTipo.value = r.tipoTransporte || "";
    const nomesT = svTransportadoras.map(t => t.nome);
    if (r.transportadora && !nomesT.includes(r.transportadora)) nomesT.unshift(r.transportadora);
    selTransp.innerHTML = `<option value="">${nomesT.length ? "Selecione…" : "Nenhuma transportadora cadastrada"}</option>` +
      nomesT.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
    selTransp.value = r.transportadora || "";
    selTransp.disabled = nomesT.length === 0;
    const caixaRetira = $("svVendaClienteRetira");
    caixaRetira.checked = !!r.clienteRetira;
    const atualizarRetira = () => {
      $("svVendaRetiraCampo").style.display = selTipo.value === "CLIENTE" ? "" : "none";
      if (selTipo.value !== "CLIENTE") caixaRetira.checked = false;
      $("svVendaTranspCampo").style.display = caixaRetira.checked ? "none" : "";
    };
    selTipo.onchange = atualizarRetira;
    caixaRetira.onchange = atualizarRetira;
    atualizarRetira();
    $("svVendaTranspDica").textContent = r.tipoTransporte && (r.transportadora || r.clienteRetira)
      ? "O transporte veio da reserva. Mude se combinaram outra coisa na hora de vender."
      : "Essa reserva é de antes do campo existir e veio sem transporte. Escolha para confirmar a venda.";

    // vazio ou ilegível = NaN (o campo numérico devolve "" quando o texto digitado não é um número)
    const lerPreco = () => (input.value.trim() === "" ? NaN : Math.round(Number(input.value) * 100) / 100);
    // unidades desta venda: todas as da reserva, ou as digitadas na venda parcial (NaN enquanto estiver vazio ou fora de 1 a N-1)
    const lerQtd = () => {
      if (modo === "TOTAL") return r.quantidade;
      const n = parseInt(qtdInput.value, 10);
      return n >= 1 && n < r.quantidade ? n : NaN;
    };
    // venda do pedido: um preço por produto (cada campo traz o id da reserva dele)
    const linhasPreco = () => Array.from(listaPrecos.querySelectorAll(".sv-ped-preco"));
    const lerPrecoLinha = (el) => (el.value.trim() === "" ? NaN : Math.round(Number(el.value) * 100) / 100);
    const qtdDaLinha = (el) => (membros.find(m => m.id === el.dataset.svpedid) || { quantidade: 0 }).quantidade;
    const totalPedido = () => Math.round(linhasPreco().reduce((s, el) => { const p = lerPrecoLinha(el); return s + (p >= 0 ? p * qtdDaLinha(el) : 0); }, 0) * 100) / 100;
    const pedidoCompleto = () => linhasPreco().every(el => lerPrecoLinha(el) >= 0);
    const totalVenda = () => {
      if (pedido) return totalPedido();
      const p = lerPreco(); const q = lerQtd(); return p >= 0 && q > 0 ? Math.round(p * q * 100) / 100 : 0;
    };
    const atualizarTotal = () => {
      if (pedido) {
        const ok = pedidoCompleto();
        totalEl.textContent = ok ? formatMoney(totalPedido()) : "—";
        contaEl.textContent = ok ? `${membros.length} produtos · ${fmt(qtdPedido)} un.` : "Informe o preço de todos os produtos.";
        return;
      }
      const p = lerPreco();
      const q = lerQtd();
      const valido = p >= 0 && q > 0;
      totalEl.textContent = valido ? formatMoney(totalVenda()) : "—";
      contaEl.textContent = valido ? `${fmt(q)} un. × ${formatMoney(p)}` : "";
    };
    // Total x Parcial: a pergunta da sobra e a quantidade só aparecem em Parcial
    const atualizarModo = () => {
      btnModoTotal.classList.toggle("on", modo === "TOTAL");
      btnModoParcial.classList.toggle("on", modo === "PARCIAL");
      btnModoTotal.setAttribute("aria-pressed", String(modo === "TOTAL"));
      btnModoParcial.setAttribute("aria-pressed", String(modo === "PARCIAL"));
      boxParcial.style.display = modo === "PARCIAL" ? "" : "none";
      const q = parseInt(qtdInput.value, 10);
      restoEl.textContent = fmt(q >= 1 && q < r.quantidade ? r.quantidade - q : r.quantidade);
      qtdNota.textContent = `Reservadas: ${fmt(r.quantidade)} un. Digite de 1 a ${fmt(r.quantidade - 1)}. Para vender todas, escolha Total.`;
    };
    const onModo = (e) => {
      const b = e.target.closest("[data-svmodo]");
      if (!b || b.disabled) return;
      modo = b.dataset.svmodo;
      onInput();
      if (modo === "PARCIAL") qtdInput.focus();
    };
    // Boleto Trademaster: valor recebido e diferença para o total (o deságio da financeira)
    const atualizarTrademaster = () => {
      const ehTm = selForma.value === "BOLETO TRADEMASTER";
      tmRow.style.display = ehTm ? "" : "none";
      const total = totalVenda();
      const dif = total - (parseFloat(recebido.value) || 0);
      const pct = total > 0 ? (dif / total) * 100 : 0;
      difEl.value = `${formatMoney(dif)} (${pct.toFixed(2).replace(".", ",")}%)`;
    };
    const linhasDivisao = () => Array.from(listaDiv.querySelectorAll(".sv-div-linha"));
    const somaDivisao = () => linhasDivisao().reduce((acc, l) => acc + (parseFloat(l.querySelector(".sv-div-valor").value) || 0), 0);
    const atualizarDivisao = () => {
      if (!chkDividir.checked) { resumoDiv.innerHTML = ""; return; }
      const linhas = linhasDivisao();
      const soma = somaDivisao();
      const total = totalVenda();
      const dif = total - soma;
      const bate = linhas.length > 0 && soma > 0 && Math.abs(dif) < 0.01;
      resumoDiv.innerHTML = `
        <div class="sv-div-soma"><span>Somado nas formas acima</span><span class="mono">${escapeHtml(formatMoney(soma))}</span></div>
        <div class="sv-div-status ${bate ? "ok" : "erro"}">${linhas.length === 0 ? "Adicione ao menos uma forma."
          : bate ? "✓ Confere com o valor da venda"
          : dif > 0 ? `Falta ${escapeHtml(formatMoney(dif))} pra completar o valor da venda.`
          : `Passou ${escapeHtml(formatMoney(-dif))} do valor da venda.`}</div>`;
    };
    const atualizarTudo = () => { atualizarModo(); atualizarTotal(); atualizarTrademaster(); atualizarDivisao(); };
    const onInput = () => { erro.style.display = "none"; atualizarTudo(); };
    const onDividir = () => {
      boxDiv.style.display = chkDividir.checked ? "" : "none";
      if (chkDividir.checked && listaDiv.children.length === 0) {
        listaDiv.appendChild(svCriarLinhaDivisao());
        listaDiv.appendChild(svCriarLinhaDivisao());
      }
      onInput();
    };
    const onAddDivisao = () => { listaDiv.appendChild(svCriarLinhaDivisao()); onInput(); };
    const onListaClick = (e) => {
      const rem = e.target.closest(".sv-div-remover");
      if (!rem) return;
      rem.closest(".sv-div-linha").remove();
      onInput();
    };
    const cleanup = (resultado) => {
      overlay.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onTecla);
      listaPrecos.removeEventListener("input", onInput);
      listaPrecos.removeEventListener("keydown", onTecla);
      selForma.removeEventListener("change", onInput);
      recebido.removeEventListener("input", onInput);
      chkDividir.removeEventListener("change", onDividir);
      btnAddDiv.removeEventListener("click", onAddDivisao);
      listaDiv.removeEventListener("input", onInput);
      listaDiv.removeEventListener("change", onInput);
      listaDiv.removeEventListener("click", onListaClick);
      selTipo.removeEventListener("change", onInput);
      selTransp.removeEventListener("change", onInput);
      segModo.removeEventListener("click", onModo);
      qtdInput.removeEventListener("input", onInput);
      qtdInput.removeEventListener("keydown", onTecla);
      resolve(resultado);
    };
    const falha = (msg) => { erro.textContent = msg; erro.style.display = "block"; };
    const onOk = () => {
      let qtd = null, p = null, precos = null;
      if (pedido) {
        const semPreco = linhasPreco().filter(el => Number.isNaN(lerPrecoLinha(el)));
        if (semPreco.length) return falha(`Informe o preço por unidade de: ${semPreco.map(el => (membros.find(m => m.id === el.dataset.svpedid) || {}).codigo).join(", ")}.`);
        if (linhasPreco().some(el => lerPrecoLinha(el) < 0)) return falha("O preço não pode ser negativo.");
        precos = {};
        linhasPreco().forEach(el => { precos[el.dataset.svpedid] = lerPrecoLinha(el); });
      } else {
        qtd = lerQtd();
        if (Number.isNaN(qtd)) return falha(`Informe quantas unidades foram vendidas, de 1 a ${fmt(r.quantidade - 1)}. Para vender todas, escolha Total.`);
        p = lerPreco();
        if (Number.isNaN(p)) return falha("Informe o preço por unidade.");
        if (p < 0) return falha("O preço não pode ser negativo.");
      }
      if (!selForma.value) return falha("Escolha a forma de pagamento para confirmar a venda.");
      const ehTm = selForma.value === "BOLETO TRADEMASTER";
      if (ehTm && recebido.value.trim() === "") return falha("Informe o valor recebido para Boleto Trademaster.");
      if (ehTm && !(parseFloat(recebido.value) >= 0)) return falha("O valor recebido não pode ser negativo.");
      let divisao = null;
      if (chkDividir.checked) {
        const linhas = linhasDivisao();
        if (linhas.length === 0) return falha("Adicione ao menos uma forma de pagamento na divisão, ou desmarque a opção.");
        divisao = [];
        for (const l of linhas) {
          const forma = l.querySelector(".sv-div-forma").value;
          const valorRaw = l.querySelector(".sv-div-valor").value;
          if (!forma || valorRaw === "") return falha("Preencha forma e valor em todas as linhas da divisão.");
          divisao.push({ forma_pagamento: forma, valor: Math.round(parseFloat(valorRaw) * 100) / 100 });
        }
        const soma = divisao.reduce((a, d) => a + d.valor, 0);
        if (divisao.some(d => !(d.valor >= 0)) || Math.abs(soma - totalVenda()) > 0.01) {
          return falha(`A soma da divisão (${formatMoney(soma)}) precisa bater com o total da venda (${formatMoney(totalVenda())}).`);
        }
      }
      if (!selTipo.value) return falha("Escolha o tipo de transporte para confirmar a venda.");
      if (!selTransp.value && !caixaRetira.checked) {
        return falha(nomesT.length
          ? "Escolha a transportadora para confirmar a venda."
          : "Cadastre as transportadoras em Administração, Transportadoras, antes de confirmar a venda.");
      }
      cleanup({
        precos, preco: p, forma: selForma.value, valorRecebido: ehTm ? Math.round(parseFloat(recebido.value) * 100) / 100 : null,
        divisao, tipo: selTipo.value, clienteRetira: caixaRetira.checked, transportadora: caixaRetira.checked ? null : selTransp.value,
        parcial: !pedido && modo === "PARCIAL", quantidade: qtd,
        sobra: !pedido && modo === "PARCIAL" ? document.querySelector('input[name="svVendaSobra"]:checked').value : null
      });
    };
    const onCancel = () => cleanup(null);
    const onTecla = (e) => { if (e.key === "Enter") { e.preventDefault(); onOk(); } };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onTecla);
    listaPrecos.addEventListener("input", onInput);
    listaPrecos.addEventListener("keydown", onTecla);
    selForma.addEventListener("change", onInput);
    recebido.addEventListener("input", onInput);
    chkDividir.addEventListener("change", onDividir);
    btnAddDiv.addEventListener("click", onAddDivisao);
    listaDiv.addEventListener("input", onInput);
    listaDiv.addEventListener("change", onInput);
    listaDiv.addEventListener("click", onListaClick);
    selTipo.addEventListener("change", onInput);
    selTransp.addEventListener("change", onInput);
    segModo.addEventListener("click", onModo);
    qtdInput.addEventListener("input", onInput);
    qtdInput.addEventListener("keydown", onTecla);
    atualizarTudo();
    overlay.classList.add("show");
    const primeiroVazio = pedido ? (linhasPreco().find(el => el.value === "") || linhasPreco()[0]) : input;
    primeiroVazio.focus();
    primeiroVazio.select();
  });
}

// Rateia um valor em partes proporcionais aos pesos, em centavos, e a última parte fica com a diferença: a soma das partes
// é sempre exatamente o valor (sem sobrar nem faltar centavo).
function svRatear(valor, pesos) {
  const totalPeso = pesos.reduce((s, p) => s + p, 0);
  const centavos = Math.round(valor * 100);
  let acumulado = 0;
  return pesos.map((p, i) => {
    const parte = i === pesos.length - 1 ? centavos - acumulado : Math.round(centavos * (totalPeso > 0 ? p / totalPeso : 1 / pesos.length));
    acumulado += parte;
    return parte / 100;
  });
}

// Venda do pedido inteiro: todos os produtos ativos do pedido viram VENDIDA de uma vez, cada um com o seu preço. O valor recebido
// (Boleto Trademaster) e a divisão do pagamento são do pedido; cada produto guarda a sua parte, proporcional ao valor dele, de modo que
// somando os produtos dá o que foi digitado.
// Atualiza um produto por vez (como o resto da tela); se algum falhar, os que já tinham sido vendidos voltam a ATIVA.
async function svVenderPedido(pedidoId) {
  const membros = svState.reservas.filter(x => x.pedidoId === pedidoId && x.situacao === "ATIVA" && !svReservaMascarada(x));
  if (membros.length === 0) return;
  if (membros.length === 1) { await svMudarSituacaoReserva(membros[0].id, "VENDIDA"); return; }
  const venda = await svVendaModal(membros[0], membros);
  if (venda === null) return;

  const valores = membros.map(m => Math.round(venda.precos[m.id] * m.quantidade * 100) / 100);
  const recebidoPartes = venda.valorRecebido !== null ? svRatear(venda.valorRecebido, valores) : null;
  const divisaoPartes = venda.divisao ? venda.divisao.map(d => svRatear(d.valor, valores)) : null; // [forma][produto]
  const feitas = [];
  let falha = "";
  for (let i = 0; i < membros.length; i++) {
    const m = membros[i];
    const campos = {
      situacao: "VENDIDA", preco_unitario: venda.precos[m.id], forma_pagamento: venda.forma,
      valor_recebido: recebidoPartes ? recebidoPartes[i] : null,
      divisao_pagamento: venda.divisao ? venda.divisao.map((d, k) => ({ forma_pagamento: d.forma_pagamento, valor: divisaoPartes[k][i] })) : null,
      tipo_transporte: venda.tipo, transportadora: venda.transportadora, vendido_em: todayISO(),
      ...(venda.clienteRetira || m.clienteRetira ? { cliente_retira: !!venda.clienteRetira } : {})
    };
    const { data, error } = await sb.from("sv_reservas").update(campos).eq("id", m.id).eq("situacao", "ATIVA").select();
    if (error || !data || data.length === 0) {
      falha = error ? error.message : "uma das reservas já foi alterada por outra pessoa";
      break;
    }
    feitas.push({ antes: { ...m }, linha: data[0] });
  }

  if (falha) {
    // desfaz os que já tinham sido vendidos, para o pedido não ficar meio vendido
    let desfeitos = 0;
    for (const f of feitas) {
      const { error } = await sb.from("sv_reservas").update({
        situacao: "ATIVA", preco_unitario: null, vendido_em: null, valor_recebido: null, divisao_pagamento: null,
        forma_pagamento: f.antes.formaPagamento || null, tipo_transporte: f.antes.tipoTransporte || null, transportadora: f.antes.transportadora || null,
        cliente_retira: !!f.antes.clienteRetira
      }).eq("id", f.antes.id);
      if (!error) desfeitos++;
    }
    await svCarregarDados(true);
    svRenderReserva();
    toast(feitas.length === 0
      ? `Não foi possível confirmar a venda do pedido: ${falha}. Nada foi vendido.`
      : desfeitos === feitas.length
        ? `Não foi possível confirmar a venda do pedido: ${falha}. As vendas já feitas foram desfeitas; confira a lista e tente de novo.`
        : `A venda do pedido falhou no meio (${falha}) e ${feitas.length - desfeitos} produto(s) ficaram vendidos. Confira o pedido na lista.`);
    return;
  }

  feitas.forEach(f => {
    const r = svState.reservas.find(x => x.id === f.antes.id);
    if (r) Object.assign(r, svReservaFromRow(f.linha));
  });
  svRenderReserva();
  toast(`Venda confirmada: ${membros.length} produtos, ${formatMoney(valores.reduce((s, v) => s + v, 0))}.`);
}

// Cancelar o pedido: libera de uma vez todos os produtos que ainda estão ativos.
async function svCancelarPedido(pedidoId) {
  const membros = svState.reservas.filter(x => x.pedidoId === pedidoId && x.situacao === "ATIVA" && !svReservaMascarada(x));
  if (membros.length === 0) return;
  const un = membros.reduce((s, m) => s + m.quantidade, 0);
  if (!(await confirmModal("Cancelar o pedido?", `Libera as ${fmt(un)} un. dos ${membros.length} produtos reservados para ${membros[0].cliente}.`))) return;
  const { data, error } = await sb.from("sv_reservas").update({ situacao: "CANCELADA" }).in("id", membros.map(m => m.id)).eq("situacao", "ATIVA").select();
  if (error) { toast("Erro ao salvar: " + error.message); return; }
  if (!data || data.length !== membros.length) {
    toast("Alguma reserva do pedido já foi alterada por outra pessoa. Atualizando a lista.");
    await svCarregarDados(true);
    svRenderReserva();
    return;
  }
  data.forEach(l => { const r = svState.reservas.find(x => x.id === l.id); if (r) Object.assign(r, svReservaFromRow(l)); });
  svRenderReserva();
  toast("Pedido cancelado.");
}

/* ---------- Editar reserva ---------- */
/* Edita uma reserva ativa, ou o pedido inteiro quando ele tem 2 ou mais produtos ativos: cliente, unidade, vendedor,
   representante, pagamento, transporte, observação, a quantidade de cada produto, tirar produto (a linha vira CANCELADA e a
   quantidade volta ao estoque) e acrescentar produto. Venda confirmada ou cancelada não se edita; a data da reserva não muda.
   Mockup: https://claude.ai/artifact/5DHmBqxmJrzJ9DNEcPdBAm */

let svEdit = null; // { ids, pedidoId, data, tipoPedido, itens: [...], orig: {...}, salvando }

// identifica o lote de uma reserva do mesmo jeito que svChaveOpcao identifica uma opção da Nova reserva
function svChaveLoteReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (r.previsaoId && (!prev || !svStatusChegou(prev.status))) return ["P", r.codigo, "", r.previsaoId].join("|");
  return ["E", r.codigo, (prev ? prev.armazem : r.armazem) || "", ""].join("|");
}

// quanto está livre no lote da reserva (já contando o que ela mesma reserva: some a quantidade dela para saber o máximo)
function svLivreDoLote(r, calc) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (r.previsaoId && (!prev || !svStatusChegou(prev.status))) {
    const a = calc.aChegar.find(x => x.previsaoId === r.previsaoId && x.codigo === r.codigo);
    return a ? a.livres : 0;
  }
  const l = calc.linhas.find(x => x.codigo === r.codigo && x.armazem === ((prev ? prev.armazem : r.armazem) || ""));
  return l ? l.disp : 0;
}

function svAbrirEdicaoReserva(id) {
  const r0 = svState.reservas.find(x => x.id === id);
  if (!r0 || r0.situacao !== "ATIVA" || svReservaMascarada(r0)) return;
  const membros = r0.pedidoId ? svPedidoAtivas(r0) : [r0];
  const base = membros[0];
  const calc = svCalcularEstoque();
  svEdit = {
    ids: membros.map(m => m.id), pedidoId: r0.pedidoId || null, data: base.data, tipoPedido: base.tipoPedido, salvando: false,
    itens: membros.map(m => ({
      id: m.id, codigo: m.codigo, previsaoId: m.previsaoId, armazem: m.armazem, novo: false, qOrig: m.quantidade, q: m.quantidade,
      max: svLivreDoLote(m, calc) + m.quantidade, chave: svChaveLoteReserva(m), origem: svOrigemReserva(m)
    })),
    orig: {
      cliente: base.cliente, unidade: base.unidadeNegocio, vendedor: base.vendedorInterno,
      representante: base.representante || SV_SEM_REPRESENTANTE, forma: base.formaPagamento, tipo: base.tipoTransporte,
      transp: base.transportadora, retira: !!base.clienteRetira, obs: base.obs
    }
  };
  const $ = (i) => document.getElementById(i);
  $("svEditResTitulo").textContent = membros.length > 1 ? "Editar pedido" : "Editar reserva";
  $("svEditResSub").textContent = `Reserva de ${formatDateBR(base.data)}. Mude o que precisar; a data da reserva não muda.`;
  $("svEditResListaClientes").innerHTML = svClientes.map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");

  const o = svEdit.orig;
  const comAtual = (lista, atual, rotulo) => (atual && !lista.some(([v]) => v === atual) ? [[atual, rotulo ? rotulo(atual) : atual], ...lista] : lista);
  const opcoes = (sel, lista, atual) => {
    sel.innerHTML = lista.map(([v, t]) => `<option value="${escapeAttr(v)}">${escapeHtml(t)}</option>`).join("");
    sel.value = atual;
  };
  opcoes($("svEditResUnidade"), [["", "Selecione…"], ...comAtual(Object.entries(SV_UNIDADES), o.unidade)], o.unidade);
  opcoes($("svEditResVendedor"), [["", "Selecione…"], ...comAtual(svVendedores.map(v => [v.nome, rotuloVendedor(v.nome)]), o.vendedor, rotuloVendedor)], o.vendedor);
  const reps = nomesSemDuplicados([...(state.representantes || []), ...svRepresentantes.map(r => r.nome)].filter(Boolean), state.representantes || []);
  opcoes($("svEditResRepresentante"), [[SV_SEM_REPRESENTANTE, "Sem representante"], ...comAtual(reps.map(n => [n, rotuloVendedor(n)]), o.representante === SV_SEM_REPRESENTANTE ? "" : o.representante, rotuloVendedor)], o.representante);
  opcoes($("svEditResForma"), [["", "Selecione…"], ...comAtual(SV_FORMAS_PAGAMENTO.map(f => [f, f]), o.forma)], o.forma);
  opcoes($("svEditResTipo"), [["", "Selecione…"], ...Object.entries(SV_TIPOS_TRANSPORTE)], o.tipo);
  opcoes($("svEditResTransp"), [["", "Selecione…"], ...comAtual(svTransportadoras.map(t => [t.nome, t.nome]), o.transp)], o.transp);
  $("svEditResCliente").value = o.cliente;
  $("svEditResRetira").checked = o.retira;
  $("svEditResObs").value = o.obs;
  $("svEditResErro").style.display = "none";
  svDesenharEdicaoProdutos();
  svAtualizarRetiraEdicao();
  document.getElementById("svEditResOverlay").classList.add("show");
  svAtualizarEdicao();
  const primeiro = document.querySelector("#svEditResProds .sv-edit-qtd");
  if (primeiro) primeiro.focus();
}

function svFecharEdicaoReserva() {
  document.getElementById("svEditResOverlay").classList.remove("show");
  svEdit = null;
}

function svAtualizarRetiraEdicao() {
  const cliente = document.getElementById("svEditResTipo").value === "CLIENTE";
  document.getElementById("svEditResRetiraCampo").style.display = cliente ? "" : "none";
  if (!cliente) document.getElementById("svEditResRetira").checked = false;
  document.getElementById("svEditResTranspCampo").style.display = document.getElementById("svEditResRetira").checked ? "none" : "";
}

function svDesenharEdicaoProdutos() {
  const itens = svEdit.itens;
  document.getElementById("svEditResProds").innerHTML = itens.map((it, n) => {
    const prod = svGetProduto(it.codigo);
    return `<div class="sv-edit-linha${it.novo ? " novo" : ""}">
        <div class="sv-edit-prod"><b class="mono">${escapeHtml(it.codigo)}</b> ${escapeHtml(prod ? prod.medida : "(produto removido)")}${it.novo ? ' <span class="sv-edit-novo">novo</span>' : ""}<span class="muted sv-sub">${escapeHtml(it.origem)}</span></div>
        <div class="sv-edit-qtdbox"><input type="number" class="sv-edit-qtd" min="1" step="1" value="${Number.isFinite(it.q) ? it.q : ""}" data-svedn="${n}" aria-label="Quantidade de ${escapeAttr(it.codigo)}"><span class="sv-edit-max" id="svEditMax${n}"></span></div>
        <button type="button" class="sv-edit-rm" data-svedrm="${n}" aria-label="Tirar ${escapeAttr(it.codigo)} do pedido"${itens.length < 2 ? ' disabled title="Para liberar tudo, use Cancelar."' : ""}>×</button>
      </div>`;
  }).join("");
  // produtos que ainda dá para acrescentar: lotes com saldo e que ainda não estão no pedido
  const usados = itens.map(i => i.chave);
  svEdit.opcoes = svMontarOpcoesReserva().filter(op => !usados.includes(svChaveOpcao(op)));
  const sel = document.getElementById("svEditResNovoProd");
  sel.innerHTML = svEdit.opcoes.length
    ? svEdit.opcoes.map((op, i) => `<option value="${i}">${escapeHtml(`${op.codigo} — ${op.medida} (${op.chip} · ${op.origem})`)}</option>`).join("")
    : `<option value="">Nada mais disponível para acrescentar</option>`;
  document.getElementById("svEditResAdd").disabled = !svEdit.opcoes.length;
}

function svLerEdicaoQtds() {
  document.querySelectorAll("#svEditResProds .sv-edit-qtd").forEach(el => {
    svEdit.itens[Number(el.dataset.svedn)].q = el.value.trim() === "" ? NaN : Number(el.value);
  });
}

// quantidade válida: de 1 ao máximo do lote (quem já passava do máximo pode manter o que tinha)
const svQtdEdicaoOk = (it) => Number.isInteger(it.q) && it.q >= 1 && (it.q <= it.max || it.q === it.qOrig);

// monta o que a pessoa digitou; { erros: [...], c: campos comuns } (o erro é uma frase pronta para a tela)
function svLerEdicaoCampos() {
  const $ = (i) => document.getElementById(i);
  const o = svEdit.orig;
  const nomeCliente = $("svEditResCliente").value.trim();
  const cliente = svClientes.find(c => c.nome.toLowerCase() === nomeCliente.toLowerCase());
  const tipo = $("svEditResTipo").value;
  const retira = tipo === "CLIENTE" && $("svEditResRetira").checked;
  const c = {
    cliente: cliente ? cliente.nome : nomeCliente, unidade: $("svEditResUnidade").value, vendedor: $("svEditResVendedor").value,
    representante: $("svEditResRepresentante").value, forma: $("svEditResForma").value, tipo, retira,
    transp: retira ? "" : $("svEditResTransp").value, obs: $("svEditResObs").value.trim()
  };
  const erros = [];
  if (!nomeCliente) erros.push("escolher o cliente");
  else if (!cliente && nomeCliente !== o.cliente) erros.push("escolher um cliente da lista (ou cadastrar no CRM)");
  if (!c.vendedor) erros.push("escolher o vendedor interno");
  // o que a reserva já tinha preenchido não pode ficar em branco; reserva antiga que veio sem o campo pode continuar sem ele
  if (o.unidade && !c.unidade) erros.push("escolher a unidade");
  if (o.forma && !c.forma) erros.push("escolher a forma de pagamento");
  if (o.tipo && !c.tipo) erros.push("escolher o tipo de transporte");
  if (c.tipo && !c.retira && !c.transp) erros.push("escolher a transportadora");
  return { erros, c };
}

// confere tudo e mostra o que vai mudar; liga ou desliga o Salvar
function svAtualizarEdicao() {
  if (!svEdit) return;
  svLerEdicaoQtds();
  const o = svEdit.orig;
  const { erros, c } = svLerEdicaoCampos();
  let qtdRuim = false;
  svEdit.itens.forEach((it, n) => {
    const ok = svQtdEdicaoOk(it);
    qtdRuim = qtdRuim || !ok;
    const max = document.getElementById("svEditMax" + n);
    if (max) {
      max.className = "sv-edit-max" + (ok ? "" : " ruim");
      max.textContent = ok ? `máx. ${fmt(it.max)}` : (it.q > it.max ? `passou: máx. ${fmt(it.max)}` : `informe de 1 a ${fmt(it.max)}`);
    }
    const campo = document.querySelector(`#svEditResProds .sv-edit-qtd[data-svedn="${n}"]`);
    if (campo) campo.classList.toggle("ruim", !ok);
  });

  const mud = [];
  const dif = (rotulo, de, para) => { if ((de || "") !== (para || "")) mud.push(`${rotulo}: ${escapeHtml(de || "—")} → <b>${escapeHtml(para || "—")}</b>`); };
  dif("Cliente", o.cliente, c.cliente);
  dif("Unidade", SV_UNIDADES[o.unidade] || o.unidade, SV_UNIDADES[c.unidade] || c.unidade);
  dif("Vendedor", o.vendedor, c.vendedor);
  dif("Representante", o.representante === SV_SEM_REPRESENTANTE ? "Sem representante" : o.representante, c.representante === SV_SEM_REPRESENTANTE ? "Sem representante" : c.representante);
  dif("Pagamento", o.forma, c.forma);
  dif("Transporte", SV_TIPOS_TRANSPORTE[o.tipo] || o.tipo, SV_TIPOS_TRANSPORTE[c.tipo] || c.tipo);
  if (!c.retira) dif("Transportadora", o.transp, c.transp);
  if (c.retira !== o.retira) mud.push(c.retira ? "Cliente <b>retira</b>" : "Cliente <b>não retira</b> mais");
  if (c.obs !== (o.obs || "")) mud.push("Observação alterada");
  svEdit.itens.forEach(it => {
    if (it.novo) mud.push(`<b>+ ${escapeHtml(it.codigo)}</b> ${Number.isFinite(it.q) ? fmt(it.q) : "?"} un.`);
    else if (Number.isFinite(it.q) && it.q !== it.qOrig && it.q >= 1) mud.push(`${escapeHtml(it.codigo)}: ${fmt(it.qOrig)} → <b>${fmt(it.q)}</b> un.`);
  });
  svEdit.ids.forEach(idOrig => {
    if (!svEdit.itens.some(i => i.id === idOrig)) {
      const r = svState.reservas.find(x => x.id === idOrig);
      if (r) mud.push(`<b>− ${escapeHtml(r.codigo)}</b> sai do pedido (${fmt(r.quantidade)} un. voltam ao estoque)`);
    }
  });
  const falta = [...erros, ...(qtdRuim ? ["corrigir a quantidade em vermelho"] : [])];
  document.getElementById("svEditResMud").innerHTML = falta.length
    ? `Falta ${falta.join(", ")}.${mud.length ? "<br>" : ""}${mud.length ? "<b>Vai mudar:</b> " + mud.join(" · ") : ""}`
    : (mud.length ? "<b>Vai mudar:</b> " + mud.join(" · ") : "Nenhuma alteração ainda.");
  document.getElementById("svEditResSalvar").disabled = !mud.length || falta.length > 0 || svEdit.salvando;
}

async function svSalvarEdicaoReserva() {
  if (!svEdit || svEdit.salvando) return;
  svLerEdicaoQtds();
  const { erros, c } = svLerEdicaoCampos();
  if (erros.length || svEdit.itens.some(it => !svQtdEdicaoOk(it))) return;
  const erro = (msg) => { const e = document.getElementById("svEditResErro"); e.textContent = msg; e.style.display = "block"; };
  document.getElementById("svEditResErro").style.display = "none";
  svEdit.salvando = true;
  document.getElementById("svEditResSalvar").disabled = true;
  const sair = () => { if (svEdit) svEdit.salvando = false; svAtualizarEdicao(); };

  // reconfere com os dados de agora: outra pessoa pode ter vendido, cancelado ou reservado o mesmo lote há pouco
  if (!(await svCarregarDados(true))) return sair();
  const calc = svCalcularEstoque();
  const opcoes = svMontarOpcoesReserva();
  const mantidos = svEdit.itens.filter(i => !i.novo);
  const removidosIds = svEdit.ids.filter(idOrig => !svEdit.itens.some(i => i.id === idOrig));
  for (const idOrig of svEdit.ids) {
    const r = svState.reservas.find(x => x.id === idOrig);
    if (!r || r.situacao !== "ATIVA") {
      toast("Essa reserva já foi alterada por outra pessoa. Atualizando a lista.");
      svFecharEdicaoReserva();
      svRenderReserva();
      return;
    }
  }
  for (const it of mantidos) {
    const r = svState.reservas.find(x => x.id === it.id);
    const maxAgora = svLivreDoLote(r, calc) + r.quantidade;
    if (it.q !== r.quantidade && it.q > maxAgora) { erro(`${it.codigo}: agora só dá para ter até ${fmt(maxAgora)} un. (o estoque mudou). Ajuste a quantidade.`); it.max = maxAgora; svEdit.salvando = false; svDesenharEdicaoProdutos(); svAtualizarEdicao(); return; }
  }
  const novos = svEdit.itens.filter(i => i.novo);
  const opcoesNovos = [];
  for (const it of novos) {
    const op = opcoes.find(x => svChaveOpcao(x) === it.chave);
    if (!op || it.q > op.disp) { erro(`${it.codigo}: ${op ? `agora só há ${fmt(op.disp)} un. livres` : "não há mais saldo livre"} neste produto. Ajuste ou tire o produto.`); svEdit.salvando = false; svAtualizarEdicao(); return; }
    opcoesNovos.push(op);
  }

  const pedidoId = svEdit.pedidoId || (novos.length ? uid("svped") : null);
  const comuns = {
    cliente: c.cliente, unidade_negocio: c.unidade || null, vendedor_interno: c.vendedor,
    representante: c.representante === SV_SEM_REPRESENTANTE ? null : c.representante,
    forma_pagamento: c.forma || null, tipo_transporte: c.tipo || null, transportadora: c.retira ? null : (c.transp || null), obs: c.obs || null,
    ...(c.retira || svEdit.orig.retira ? { cliente_retira: c.retira } : {}) // só vai quando preciso: reserva comum não depende do SQL novo
  };
  const atualizar = async (id, campos) => {
    const { data, error } = await sb.from("sv_reservas").update(campos).eq("id", id).eq("situacao", "ATIVA").select();
    if (error) return error.message;
    if (!data || data.length === 0) return "essa reserva já foi alterada por outra pessoa";
    return "";
  };
  // ordem que não trava no saldo: primeiro o que libera estoque (tirar produto, diminuir quantidade), depois o que consome
  let falha = "";
  const feitas = [];
  for (const id of removidosIds) {
    falha = await atualizar(id, { situacao: "CANCELADA" });
    if (falha) break;
    feitas.push("tirar produto");
  }
  const reducoes = mantidos.filter(it => it.q <= it.qOrig), aumentos = mantidos.filter(it => it.q > it.qOrig);
  for (const it of [...reducoes, ...aumentos]) {
    if (falha) break;
    falha = await atualizar(it.id, { ...comuns, quantidade: it.q, ...(!svEdit.pedidoId && novos.length ? { pedido_id: pedidoId } : {}) });
    if (!falha) feitas.push(it.codigo);
  }
  if (!falha && novos.length) {
    const linhas = novos.map((it, i) => ({
      id: uid("svres"), codigo: it.codigo, quantidade: it.q, cliente: c.cliente, vendedorInterno: c.vendedor,
      representante: c.representante === SV_SEM_REPRESENTANTE ? null : c.representante,
      armazem: opcoesNovos[i].tipo === "E" ? opcoesNovos[i].armazem : null, previsaoId: opcoesNovos[i].tipo === "P" ? opcoesNovos[i].previsaoId : null,
      formaPagamento: c.forma, unidadeNegocio: c.unidade, tipoTransporte: c.tipo, transportadora: c.retira ? "" : c.transp, clienteRetira: c.retira,
      tipoPedido: svEdit.tipoPedido, pedidoId, situacao: "ATIVA", data: svEdit.data, obs: c.obs
    }));
    const { data, error } = await sb.from("sv_reservas").insert(linhas.map(n => ({ ...svReservaToRow(n), created_by: currentUser ? currentUser.id : null }))).select();
    if (error) falha = error.message;
    else if (!data || data.length !== linhas.length) falha = "sem permissão para acrescentar o produto";
  }

  await svCarregarDados(true);
  svFecharEdicaoReserva();
  svRenderReserva();
  if (falha) {
    toast(/Sem saldo dispon/.test(falha)
      ? "O estoque mudou e não deu para salvar tudo. Confira o pedido na lista e edite de novo."
      : `Não foi possível salvar tudo: ${falha}.${feitas.length ? " Parte das alterações já foi salva; confira o pedido na lista." : " Nada foi alterado."}`);
    return;
  }
  toast(mantidos.length + novos.length > 1 ? "Pedido atualizado." : "Reserva atualizada.");
}

function svLigarEdicaoReserva() {
  const $ = (i) => document.getElementById(i);
  $("svEditResFechar").addEventListener("click", svFecharEdicaoReserva);
  $("svEditResCancelar").addEventListener("click", svFecharEdicaoReserva);
  $("svEditResSalvar").addEventListener("click", svSalvarEdicaoReserva);
  const aoMudar = (e) => {
    if (e.target.id === "svEditResTipo" || e.target.id === "svEditResRetira") svAtualizarRetiraEdicao();
    $("svEditResErro").style.display = "none";
    svAtualizarEdicao();
  };
  $("svEditResOverlay").addEventListener("input", aoMudar);
  $("svEditResOverlay").addEventListener("change", aoMudar);
  $("svEditResOverlay").addEventListener("click", (e) => {
    if (!svEdit) return;
    const rm = e.target.closest("[data-svedrm]");
    if (rm && !rm.disabled) {
      svLerEdicaoQtds();
      svEdit.itens.splice(Number(rm.dataset.svedrm), 1);
      svDesenharEdicaoProdutos();
      svAtualizarEdicao();
      return;
    }
    if (e.target.closest("#svEditResAdd")) {
      const op = svEdit.opcoes[Number($("svEditResNovoProd").value)];
      if (!op) return;
      svLerEdicaoQtds();
      svEdit.itens.push({ id: null, codigo: op.codigo, previsaoId: op.previsaoId || null, armazem: op.armazem || null, novo: true,
        qOrig: 0, q: 1, max: op.disp, chave: svChaveOpcao(op), origem: op.origem });
      svDesenharEdicaoProdutos();
      svAtualizarEdicao();
      const campos = document.querySelectorAll("#svEditResProds .sv-edit-qtd");
      campos[campos.length - 1].focus();
      campos[campos.length - 1].select();
    }
  });
}

// Venda parcial: a função sv_vender_parcial divide a reserva de uma vez só (a parte vendida vira uma linha VENDIDA nova e
// a reserva fica com o restante, ou é liberada). Sem o SQL rodado a função não existe e a tela avisa.
async function svVenderParcial(r, venda) {
  const { data, error } = await sb.rpc("sv_vender_parcial", {
    p_id: r.id, p_novo_id: uid("svres"), p_quantidade: venda.quantidade, p_sobra: venda.sobra, p_preco: venda.preco,
    p_forma: venda.forma, p_valor_recebido: venda.valorRecebido, p_divisao: venda.divisao,
    p_tipo_transporte: venda.tipo, p_transportadora: venda.transportadora, p_vendido_em: todayISO(),
    ...(venda.clienteRetira ? { p_cliente_retira: true } : {})
  });
  if (error) {
    if (/já foi alterada|não encontrada/i.test(error.message)) {
      toast("Essa reserva já foi alterada por outra pessoa. Atualizando a lista.");
      await svCarregarDados(true);
      svRenderReserva();
    } else {
      toast("Não foi possível confirmar a venda parcial: " + error.message);
    }
    return;
  }
  // a linha vendida criada pela função do banco não traz o pedido: liga ela ao mesmo pedido da reserva
  if (r.pedidoId) {
    const vendida = (data || []).find(x => x.id !== r.id);
    if (vendida) {
      const { error: errPed } = await sb.from("sv_reservas").update({ pedido_id: r.pedidoId }).eq("id", vendida.id);
      if (!errPed) vendida.pedido_id = r.pedidoId;
    }
  }
  (data || []).map(svReservaFromRow).forEach(nova => {
    const i = svState.reservas.findIndex(x => x.id === nova.id);
    if (i >= 0) svState.reservas[i] = nova; else svState.reservas.unshift(nova);
  });
  svRenderReserva();
  const resto = r.quantidade - venda.quantidade;
  toast(`Venda confirmada: ${fmt(venda.quantidade)} un. ${venda.sobra === "LIBERAR" ? `vendidas e ${fmt(resto)} un. liberadas.` : `vendidas, ${fmt(resto)} un. continuam reservadas.`}`);
}

async function svMudarSituacaoReserva(id, nova) {
  const r = svState.reservas.find(x => x.id === id);
  if (!r) return;
  let campos = { situacao: nova };
  if (nova === "VENDIDA") {
    // a venda grava o preço por unidade, a condição de pagamento e o dia: é daí que o Dashboard tira o "Valor vendido" e o mês
    const venda = await svVendaModal(r);
    if (venda === null) return;
    if (venda.parcial) { await svVenderParcial(r, venda); return; }
    campos = {
      situacao: nova, preco_unitario: venda.preco, forma_pagamento: venda.forma,
      valor_recebido: venda.valorRecebido, divisao_pagamento: venda.divisao,
      tipo_transporte: venda.tipo, transportadora: venda.transportadora, vendido_em: todayISO(),
      ...(venda.clienteRetira || r.clienteRetira ? { cliente_retira: !!venda.clienteRetira } : {})
    };
  } else if (!(await confirmModal("Cancelar reserva?", `Libera as ${r.quantidade} un. de ${r.codigo} reservadas para ${r.cliente}.`))) {
    return;
  }
  // só muda se ainda estiver ativa: se outra pessoa já vendeu ou cancelou, não sobrescreve
  const { data, error } = await sb.from("sv_reservas").update(campos).eq("id", id).eq("situacao", "ATIVA").select();
  if (error) { toast("Erro ao salvar: " + error.message); return; }
  if (!data || data.length === 0) {
    toast("Essa reserva já foi alterada por outra pessoa. Atualizando a lista.");
    await svCarregarDados(true);
    svRenderReserva();
    return;
  }
  Object.assign(r, svReservaFromRow(data[0]));
  svRenderReserva();
  toast(nova === "VENDIDA" ? "Venda confirmada." : "Reserva cancelada.");
}

function svLigarReserva() {
  const $ = (id) => document.getElementById(id);
  $("svFormReserva").addEventListener("submit", svSalvarReserva);
  svLigarItens();
  $("svResSearch").addEventListener("input", svRenderReservaTabela);
  $("svResChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-svfiltro]");
    if (!b) return;
    svResFiltroAtual = b.dataset.svfiltro;
    svRenderReservaTabela();
  });
  $("svResChipsUnidade").addEventListener("click", (e) => {
    const b = e.target.closest("[data-svunidade]");
    if (!b) return;
    svResUnidadeAtual = svResUnidadeAtual === b.dataset.svunidade ? "" : b.dataset.svunidade; // clicar de novo desliga
    svRenderReservaTabela();
  });
  $("svResEmpty").addEventListener("click", (e) => {
    if (e.target.closest("#svBtnNovaReservaVazio")) svAbrirNovaReserva();
    else if (e.target.closest("#svResLimpar")) {
      $("svResSearch").value = "";
      svResFiltroAtual = "ativas_vendidas";
      svResUnidadeAtual = "";
      svRenderReservaTabela();
    }
  });
  $("svBtnNovaReserva").addEventListener("click", svAbrirNovaReserva);
  $("svResPedido").addEventListener("click", (e) => {
    const b = e.target.closest("[data-svpedido]");
    if (b) svEscolherPedidoReserva(b.dataset.svpedido);
  });
  $("svResFechar").addEventListener("click", svFecharNovaReserva);
  $("svResCancelar").addEventListener("click", svFecharNovaReserva);
  $("svResOverlay").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (svPickerAberto) svFecharPicker(true); else svFecharNovaReserva();
  });
  document.addEventListener("click", (e) => {
    if (svPickerAberto && !e.target.closest(".sv-picker")) svFecharPicker();
  });
  $("svFormReserva").addEventListener("input", svAoMudarFormReserva);
  $("svFormReserva").addEventListener("change", svAoMudarFormReserva);
  $("svFormReserva").addEventListener("change", e => { if (e.target.id === "svResTipoTransporte" || e.target.id === "svResClienteRetira") svAtualizarRetiraReserva(); });
  $("svFormReserva").addEventListener("reset", () => setTimeout(svAtualizarRetiraReserva, 0));
}

async function svSalvarReserva(e) {
  e.preventDefault();
  if (svSalvandoReserva) return;
  svSalvandoReserva = true;
  svAtualizarResumoReserva();
  try { await svSalvarReservaDados(); } finally {
    svSalvandoReserva = false;
    svAtualizarResumoReserva();
  }
}

async function svSalvarReservaDados() {
  svLimparErrosReserva();
  const clienteDigitado = document.getElementById("svResCliente").value.trim();
  const vendedorInterno = document.getElementById("svResVendedor").value;
  const escolhaRepresentante = document.getElementById("svResRepresentante").value;
  const forma = document.getElementById("svResForma").value;
  const unidade = document.getElementById("svResUnidade").value;
  const tipoTransporte = document.getElementById("svResTipoTransporte").value;
  const clienteRetira = tipoTransporte === "CLIENTE" && document.getElementById("svResClienteRetira").checked;
  const transportadora = clienteRetira ? "" : document.getElementById("svResTransportadora").value;
  const data = document.getElementById("svResData").value;
  const obs = document.getElementById("svResObs").value.trim();
  const cliente = svClientes.find(c => c.nome.toLowerCase() === clienteDigitado.toLowerCase());

  // confere tudo de uma vez e marca cada campo com problema (em vez de avisar um por vez)
  const erros = [];
  if (!clienteDigitado) erros.push(["cliente", "Escolha um cliente da lista. Se ele ainda não existe, cadastre em Clientes."]);
  else if (!cliente) erros.push(["cliente", "Cliente não encontrado no cadastro do Sem Venda. Use \"Cadastrar cliente\" antes de reservar."]);
  if (!vendedorInterno) erros.push(["vendedor", svVendedores.length ? "Escolha o vendedor interno." : "Cadastre os vendedores em Administração antes de reservar."]);
  if (!escolhaRepresentante) erros.push(["representante", 'Escolha o representante ou marque "Sem representante".']);
  if (!unidade) erros.push(["unidade", "Escolha a unidade de negócio."]);
  if (!forma) erros.push(["forma", "Escolha a forma de pagamento."]);
  if (!tipoTransporte) erros.push(["tipotransp", "Escolha o tipo de transporte."]);
  if (!transportadora && !clienteRetira) erros.push(["transportadora", svTransportadoras.length ? "Escolha a transportadora." : "Cadastre as transportadoras em Administração antes de reservar."]);
  if (!data) erros.push(["data", "Informe a data."]);
  // produtos do pedido: cada linha com produto e quantidade; o mesmo lote repetido soma contra o disponível
  const itensTela = svLerItens();
  let erroItem = false;
  const usado = new Map();
  itensTela.forEach(x => {
    let msg = "";
    if (!x.opcao) msg = "Escolha o produto" + (itensTela.length > 1 ? " ou remova esta linha." : ".");
    else if (!(x.quantidade > 0)) msg = "Informe a quantidade.";
    else {
      const k = svChaveOpcao(x.opcao);
      const soma = (usado.get(k) || 0) + x.quantidade;
      usado.set(k, soma);
      if (soma > x.opcao.disp) msg = `Só há ${fmt(x.opcao.disp)} un. disponíveis neste produto${soma > x.quantidade ? " (somando as outras linhas dele)" : ""}.`;
    }
    x.linha.querySelector(".sv-item-erro").textContent = msg;
    if (msg) erroItem = true;
  });
  if (erros.length || erroItem) {
    erros.forEach(([campo, msg]) => svErroCampo(campo, msg));
    const linhaErro = itensTela.find(x => x.linha.querySelector(".sv-item-erro").textContent);
    if (linhaErro) linhaErro.linha.querySelector(".sv-picker-botao, input").focus();
    else svFocarPrimeiroErro();
    return;
  }
  const representante = escolhaRepresentante === SV_SEM_REPRESENTANTE ? null : escolhaRepresentante;

  // confere o saldo com dados atualizados: outra pessoa pode ter reservado o mesmo lote agora há pouco
  if (!(await svCarregarDados(true))) return;
  const { linhas, aChegar } = svCalcularEstoque();
  // saldo de uma opção com os dados recém-carregados; null quando o processo já chegou
  const saldoDe = (op) => {
    if (op.tipo === "E") {
      const l = linhas.find(x => x.codigo === op.codigo && x.armazem === op.armazem);
      return l ? l.disp : 0;
    }
    const prev = svState.previsoes.find(x => x.id === op.previsaoId);
    if (!prev || svStatusChegou(prev.status)) return null;
    const a = aChegar.find(x => x.previsaoId === op.previsaoId && x.codigo === op.codigo);
    return a ? a.livres : 0;
  };
  // todos os produtos do pedido, somando os que repetem o mesmo lote
  const itens = itensTela;
  const somaPorLote = new Map();
  for (const it of itens) {
    const k = svChaveOpcao(it.opcao);
    somaPorLote.set(k, (somaPorLote.get(k) || 0) + it.quantidade);
    const disponivel = saldoDe(it.opcao);
    const msg = disponivel === null
      ? "Esse processo já chegou. As opções foram atualizadas, escolha o produto em estoque."
      : somaPorLote.get(k) > disponivel ? `Só há ${fmt(disponivel)} un. disponíveis nessa opção.` : "";
    if (msg) {
      svRenderReserva();
      it.linha.querySelector(".sv-item-erro").textContent = msg;
      toast("Nada foi reservado. Confira o aviso no produto.");
      return;
    }
  }

  // um pedido com 2+ produtos: as linhas levam o mesmo pedido_id (1 produto só fica sem, como sempre foi)
  const pedidoId = itens.length > 1 ? uid("svped") : null;
  const novas = itens.map(it => ({
    id: uid("svres"), codigo: it.opcao.codigo, quantidade: it.quantidade, cliente: cliente.nome, vendedorInterno, representante,
    armazem: it.opcao.tipo === "E" ? it.opcao.armazem : null,
    previsaoId: it.opcao.tipo === "P" ? it.opcao.previsaoId : null,
    formaPagamento: forma, unidadeNegocio: unidade, tipoTransporte, transportadora, clienteRetira,
    tipoPedido: svTipoPedidoReserva(), pedidoId,
    situacao: "ATIVA", data, obs
  }));
  // um insert só: ou entram todos os produtos ou nenhum
  const { data: inseridas, error } = await sb.from("sv_reservas")
    .insert(novas.map(n => ({ ...svReservaToRow(n), created_by: currentUser ? currentUser.id : null }))).select();
  if (error) {
    toast("Erro ao reservar: " + error.message);
    // o banco recusou por falta de saldo (alguém reservou antes): atualiza a tela para mostrar o saldo de agora
    if (/Sem saldo dispon/.test(error.message)) { await svCarregarDados(true); svRenderReserva(); }
    return;
  }
  if (!inseridas || inseridas.length !== novas.length) { toast("Não foi possível reservar (sem permissão)."); return; }
  inseridas.map(svReservaFromRow).reverse().forEach(n => svState.reservas.unshift(n));
  svFecharNovaReserva();
  svRenderReserva();
  toast(novas.length > 1 ? `Pedido reservado: ${novas.length} produtos.` : "Reserva criada.");
}

/* ---------- Estoque físico (Dashboard e Armazenagem) ---------- */

// dias corridos entre uma data ISO e hoje; null quando não há data
function svDiasDesde(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje - new Date(a, m - 1, d)) / 86400000));
}

// O que está parado em cada armazém: chegou menos o que já foi vendido (o reservado continua lá, parado).
// dias = tempo desde a chegada mais antiga daquele produto naquele armazém.
function svEstoqueFisico() {
  return svCalcularEstoque().linhas
    .map(l => ({ ...l, qtd: l.chegou - l.vendido, produto: svGetProduto(l.codigo) }))
    .filter(l => l.qtd > 0)
    .map(l => ({
      ...l,
      dias: svDiasDesde(l.desde)
    }));
}

// armazéns na ordem fixa do cadastro, depois os que aparecem só nos dados, e "sem armazém" por último
function svArmazensDoEstoque(est) {
  const extras = [...new Set(est.map(l => l.armazem))].filter(a => a && !SV_ARMAZENS.includes(a)).sort();
  return [...SV_ARMAZENS, ...extras, ...(est.some(l => !l.armazem) ? [""] : [])];
}

// Valor investido: soma do custo total dos processos que já chegaram (FINALIZADO). Sem argumento soma todos;
// com um armazém ("" = sem armazém), só os processos dele. Não desconta o que já foi vendido.
// semCusto = processos que chegaram com algum item (ou todos) sem custo informado: o que não foi informado fica fora da soma.
// Custo do processo: quantidade x custo unitário dos itens que têm custo. Processo antigo, que só tem o custo total e nenhum
// custo unitário, segue valendo pelo total antigo até alguém informar o custo unitário dos itens.
// itensSemCusto = itens sem custo unitário (só conta quando o processo já usa custo unitário).
function svCustoDoProcesso(p) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const comCusto = itens.filter(it => it.custoUnitario !== null && it.custoUnitario !== undefined && Number.isFinite(Number(it.custoUnitario)));
  if (comCusto.length) {
    return { total: comCusto.reduce((s, it) => s + (Number(it.quantidade) || 0) * Number(it.custoUnitario), 0), temCusto: true, itensSemCusto: itens.length - comCusto.length, antigo: false };
  }
  if (p.custoTotal !== null && p.custoTotal !== undefined) return { total: p.custoTotal, temCusto: true, itensSemCusto: 0, antigo: true };
  return { total: 0, temCusto: false, itensSemCusto: itens.length, antigo: false };
}

// lê o custo unitário digitado: vazio = sem custo (null); texto que não é número de zero em diante = NaN
function svLerCustoUnitario(texto) {
  const t = String(texto || "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

// subtotal de cada linha e custo do processo, ao vivo, no formulário do processo
function svAtualizarCustoForm() {
  let total = 0, temCusto = false;
  document.querySelectorAll("#svPrevItens .item-row").forEach(row => {
    const qtd = parseInt(row.querySelector(".item-qtd").value, 10) || 0;
    const custo = svLerCustoUnitario(row.querySelector(".item-custo").value);
    const sub = row.querySelector(".item-subtotal");
    if (custo !== null && !Number.isNaN(custo)) { total += qtd * custo; temCusto = true; sub.textContent = formatMoney(qtd * custo); }
    else sub.textContent = "—";
    row.querySelector(".item-custo").classList.toggle("invalido", Number.isNaN(custo));
  });
  const alvo = document.getElementById("svPrevCustoTotal");
  if (alvo) alvo.textContent = temCusto ? formatMoney(total) : "—";
  const antigo = document.getElementById("svPrevCustoAntigo");
  if (antigo) {
    const p = svEditandoPrevistoId ? svState.previsoes.find(x => x.id === svEditandoPrevistoId) : null;
    const tem = !!p && p.custoTotal !== null && p.custoTotal !== undefined;
    antigo.style.display = tem ? "" : "none";
    if (tem) antigo.textContent = temCusto
      ? `Este processo tinha o custo total de ${formatMoney(p.custoTotal)}. Com o custo unitário dos itens, o unitário passa a valer no lugar dele.`
      : `Este processo foi lançado com o custo total de ${formatMoney(p.custoTotal)}. Ele segue contando no valor investido até você informar o custo unitário dos itens.`;
  }
}

function svResumoValor(armazem) {
  const chegados = svState.previsoes.filter(p => svStatusChegou(p.status) && !p.custoForaDoInvestido && (armazem === undefined || (p.armazem || "") === armazem));
  const custos = chegados.map(svCustoDoProcesso);
  return {
    total: custos.reduce((s, c) => s + (c.temCusto ? c.total : 0), 0),
    temCusto: custos.some(c => c.temCusto),
    // processos com algum item sem custo unitário (ou sem custo nenhum): a soma só tem o que foi informado
    semCusto: custos.filter(c => !c.temCusto || c.itensSemCusto > 0).length
  };
}

function svNotaSemCusto(resumo) {
  if (resumo.semCusto === 0) return "";
  return resumo.temCusto
    ? `${resumo.semCusto} ${resumo.semCusto === 1 ? "processo com item sem custo informado" : "processos com item sem custo informado"}`
    : "Informe o custo nos processos (Estoque Previsto)";
}

/* ---------- Dashboard ---------- */

// blocos que o botão "Dashboards" liga e desliga (data-dashcard no index.html)
const SV_DASH_CARDS = [
  { key: "vendas", label: "Vendas (meta, vendedores e valor vendido)" },
  { key: "estoqueParado", label: "Estoque parado" },
  { key: "armazenagem", label: "Estoque por armazenagem" },
  { key: "parados", label: "Parados há mais tempo" }
];
let svDashEscolher = null;

function svAplicarVisibilidadeDash() {
  SV_DASH_CARDS.forEach(({ key }) => {
    const mostrar = !svDashEscolher || svDashEscolher.visivel(key);
    document.querySelectorAll(`#view-sv-dashboard [data-dashcard="${key}"]`).forEach(el => { el.style.display = mostrar ? "" : "none"; });
  });
}

function svRenderDashboard() {
  svAplicarVisibilidadeDash();
  const est = svEstoqueFisico();
  const total = est.reduce((s, l) => s + l.qtd, 0);
  const valor = svResumoValor();
  const comData = est.filter(l => l.dias !== null);
  const pesoTotal = comData.reduce((s, l) => s + l.qtd, 0);
  const mediaDias = pesoTotal > 0 ? Math.round(comData.reduce((s, l) => s + l.qtd * l.dias, 0) / pesoTotal) : null;
  const semData = new Set(est.filter(l => l.dias === null).map(l => l.codigo)).size;
  const armazensComEstoque = new Set(est.map(l => l.armazem).filter(Boolean)).size; // "sem armazém" não é um armazém

  document.getElementById("svDashKpis").innerHTML = `
    <div class="kpi"><div class="lbl">Pneus em estoque</div><div class="val">${fmt(total)} un.</div></div>
    <div class="kpi accent"><div class="lbl">Valor investido parado</div><div class="val">${valor.temCusto ? formatMoney(valor.total) : "—"}</div>${svNotaSemCusto(valor) ? `<div class="muted sv-sub sv-kpi-nota">${escapeHtml(svNotaSemCusto(valor))}</div>` : ""}</div>
    <div class="kpi"><div class="lbl">Tempo médio parado</div><div class="val">${mediaDias === null ? "—" : fmt(mediaDias) + " dias"}</div>${semData > 0 && mediaDias !== null ? `<div class="muted sv-sub sv-kpi-nota">${semData} código(s) sem data de chegada</div>` : ""}</div>
    <div class="kpi"><div class="lbl">Armazéns com estoque</div><div class="val">${fmt(armazensComEstoque)}</div></div>
  `;

  const porArmazem = svArmazensDoEstoque(est)
    .map(a => ({ nome: svNomeArmazem(a), qtd: est.filter(l => l.armazem === a).reduce((s, l) => s + l.qtd, 0) }))
    .filter(a => a.qtd > 0);
  const maior = Math.max(1, ...porArmazem.map(a => a.qtd));
  document.getElementById("svDashArmazens").innerHTML = porArmazem.length === 0
    ? `<div class="empty-state">Nenhum pneu em estoque ainda. Quando um processo do Estoque Previsto for marcado como FINALIZADO (com o armazém), os pneus aparecem aqui.</div>`
    : `<div class="sv-bar-lista">${porArmazem.map(a => `
        <div>
          <div class="sv-bar-linha"><b>${escapeHtml(a.nome)}</b><span class="mono">${fmt(a.qtd)} un.</span></div>
          <div class="sv-bar-trilho"><div style="width:${Math.max(2, Math.round(a.qtd / maior * 100))}%;"></div></div>
        </div>`).join("")}</div>`;

  const parados = comData.slice().sort((a, b) => b.dias - a.dias || b.qtd - a.qtd).slice(0, 5);
  document.getElementById("svDashParados").innerHTML = parados.map(l => `
    <tr>
      <td class="mono">${escapeHtml(l.codigo)}</td>
      <td>${escapeHtml(l.produto ? l.produto.medida : "(produto removido)")}</td>
      <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
      <td class="sv-num"><span class="sv-dias ${l.dias >= 120 ? "alto" : l.dias >= 75 ? "medio" : "baixo"}">${fmt(l.dias)} d.</span></td>
    </tr>`).join("");
  const vazio = document.getElementById("svDashEmpty");
  vazio.style.display = parados.length === 0 ? "block" : "none";
  vazio.textContent = est.length === 0 ? "Nenhum pneu em estoque ainda." : "Nenhum item com data de chegada nos processos.";

  svRenderDashboardVendas();
}

/* ---------- Dashboard: vendas do mês (Vendedores e Valor vendido) ---------- */

// Meta fixa do Dashboard: não vem do banco, é só este valor
const SV_META_VALOR = 1500000;

const SV_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Meses que o seletor de período oferece (o atual e cada mês com venda) e o seletor em si (seletores-dash.js).
// Abre no mês atual; o painel deixa escolher vários meses.
let svMesesDisponiveis = [];
const svDashPeriodo = {
  _s: null,
  criar() {
    this._s = sdCriarSeletorPeriodo(document.getElementById("svDashPeriodoMount"), {
      disponiveis: () => svMesesDisponiveis, aoMudar: () => svRenderDashboardVendas()
    });
  },
  meses() { return this._s ? this._s.meses() : []; },
  atualizar() { if (this._s) this._s.atualizar(); }
};

// Dia (AAAA-MM-DD, no fuso do navegador) em que a venda foi confirmada. Venda confirmada antes de existir
// a coluna vendido_em usa o dia da última alteração da reserva, que foi justamente a confirmação.
function svDiaDaVenda(r) {
  if (r.vendidoEm) return r.vendidoEm;
  const d = r.updatedAt ? new Date(r.updatedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Preço gravado na venda; sem ele (venda antiga), o preço de proposta do produto; sem nenhum dos dois, null
function svPrecoDaVenda(r) {
  if (r.precoUnitario !== null) return r.precoUnitario;
  const p = svGetProduto(r.codigo);
  return p && p.preco !== null ? p.preco : null;
}

function svRenderDashboardVendas() {
  const vendas = svState.reservas.filter(r => r.situacao === "VENDIDA").map(r => ({ r, dia: svDiaDaVenda(r) }));
  const atual = todayISO().slice(0, 7);
  // meses da lista: o atual e cada mês em que houve venda, do mais novo pro mais antigo
  const meses = [...new Set([atual, ...vendas.map(v => v.dia.slice(0, 7)).filter(Boolean)])].sort().reverse();
  svMesesDisponiveis = meses.slice().sort();
  svDashPeriodo.atualizar();
  const mesesEscolhidos = new Set(svDashPeriodo.meses());
  const doPeriodo = vendas.filter(v => mesesEscolhidos.has(v.dia.slice(0, 7)));
  const quando = mesesEscolhidos.size > 1 ? "no período" : "no mês";
  const vendedores = new Set(doPeriodo.map(v => v.r.vendedorInterno).filter(Boolean)).size;
  let total = 0, semPreco = 0;
  doPeriodo.forEach(v => {
    const preco = svPrecoDaVenda(v.r);
    if (preco === null) semPreco++;
    else total += Math.round(preco * v.r.quantidade * 100) / 100;
  });
  const n = doPeriodo.length;
  const notaVendas = n === 0 ? `nenhuma venda confirmada ${quando}` : `${fmt(n)} ${n === 1 ? "venda confirmada" : "vendas confirmadas"} ${quando}`;
  const aviso = semPreco > 0
    ? `<div class="sv-kpi-aviso">${fmt(semPreco)} ${semPreco === 1 ? "venda sem preço ficou" : "vendas sem preço ficaram"} fora da soma</div>`
    : "";
  document.getElementById("svDashVendas").innerHTML = `
    <div class="kpi sv-kpi-meta"><div class="lbl">Meta</div><div class="val">${escapeHtml(formatMoney(SV_META_VALOR))}</div><div class="muted sv-sub sv-kpi-nota">valor fixo</div></div>
    <div class="kpi"><div class="lbl">Vendedores</div><div class="val">${fmt(vendedores)}</div><div class="muted sv-sub sv-kpi-nota">com venda confirmada ${quando}</div></div>
    <div class="kpi accent"><div class="lbl">Valor vendido</div><div class="val">${escapeHtml(formatMoney(total))}</div><div class="muted sv-sub sv-kpi-nota">${notaVendas}</div>${aviso}</div>
  `;
}

/* ---------- Armazenagem ---------- */

// "" = todos os armazéns; "__sem" = itens sem armazém; senão o nome do armazém
let svArmSelecionado = "";

function svRenderArmazenagem() {
  const est = svEstoqueFisico();
  const nomes = svArmazensDoEstoque(est);
  const chaveDe = a => a === "" ? "__sem" : a;
  if (svArmSelecionado && !nomes.some(a => chaveDe(a) === svArmSelecionado)) svArmSelecionado = "";

  const valorTodos = svResumoValor();
  const textoValor = (v) => v.temCusto
    ? escapeHtml(formatMoney(v.total)) + " investidos" + (v.semCusto > 0 ? ` · ${v.semCusto} sem custo` : "")
    : v.semCusto > 0 ? "custo não informado" : "nenhum processo chegou";
  const cartoes = [`
    <button type="button" class="sv-arm-card${svArmSelecionado === "" ? " sel" : ""}" data-svarm="" aria-pressed="${svArmSelecionado === ""}">
      <span class="sv-arm-nome">Todos</span>
      <span class="sv-arm-qtd">${fmt(est.reduce((s, l) => s + l.qtd, 0))} un.</span>
      <span class="sv-arm-sub">${textoValor(valorTodos)}</span>
    </button>`];
  nomes.forEach(a => {
    const linhas = est.filter(l => l.armazem === a);
    const codigos = new Set(linhas.map(l => l.codigo)).size;
    cartoes.push(`
    <button type="button" class="sv-arm-card${svArmSelecionado === chaveDe(a) ? " sel" : ""}" data-svarm="${escapeAttr(chaveDe(a))}" aria-pressed="${svArmSelecionado === chaveDe(a)}">
      <span class="sv-arm-nome">${escapeHtml(svNomeArmazem(a))}</span>
      <span class="sv-arm-qtd">${fmt(linhas.reduce((s, l) => s + l.qtd, 0))} un.</span>
      <span class="sv-arm-sub">${fmt(codigos)} ${codigos === 1 ? "código" : "códigos diferentes"}</span>
      <span class="sv-arm-sub">${textoValor(svResumoValor(a))}</span>
    </button>`);
  });
  const caixa = document.getElementById("svArmCards");
  caixa.innerHTML = cartoes.join("");
  caixa.querySelectorAll("[data-svarm]").forEach(btn => {
    btn.addEventListener("click", () => {
      svArmSelecionado = btn.dataset.svarm;
      svRenderArmazenagem();
      // os botões são recriados a cada clique: devolve o foco ao cartão escolhido (teclado)
      const escolhido = document.querySelector("#svArmCards .sv-arm-card.sel");
      if (escolhido) escolhido.focus();
    });
  });

  const sel = document.getElementById("svArmFiltro");
  sel.innerHTML = `<option value="">Todos os armazéns</option>` +
    nomes.map(a => `<option value="${escapeAttr(chaveDe(a))}">${escapeHtml(svNomeArmazem(a))}</option>`).join("");
  sel.value = svArmSelecionado;

  const rows = est
    .filter(l => svArmSelecionado === "" || chaveDe(l.armazem) === svArmSelecionado)
    .sort((a, b) => b.qtd - a.qtd || a.codigo.localeCompare(b.codigo));
  document.getElementById("svArmTitulo").textContent = "Itens — " + (svArmSelecionado === "" ? "todos os armazéns" : svNomeArmazem(svArmSelecionado === "__sem" ? "" : svArmSelecionado));
  document.getElementById("svArmCount").textContent = `${rows.length} item(ns)`;
  document.getElementById("svArmTbody").innerHTML = rows.map(l => `
    <tr>
      <td class="mono">${escapeHtml(l.codigo)}</td>
      <td>${escapeHtml(l.produto ? l.produto.medida : "(produto removido)")}</td>
      <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
      <td class="sv-num">${fmt(l.qtd)}</td>
    </tr>`).join("");
  const vazio = document.getElementById("svArmEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = est.length === 0
    ? "Nenhum pneu em estoque ainda. Quando um processo do Estoque Previsto for marcado como FINALIZADO (com o armazém), os pneus aparecem aqui."
    : "Nenhum pneu nesse armazém.";
}

/* ---------- Controle de Estoque (saldo por produto, com alerta de estoque baixo) ---------- */

// Mesma tela do Estoque do Varejo. Estoque baixo = menos de 300 un. por produto (soma dos armazéns).
// Esgotado: 0 ou menos. Atenção: de 300 a 399 (perto de ficar baixo). Normal: 400 ou mais.
const SV_ESTOQUE_BAIXO_LIMITE = 300;
const SV_ESTOQUE_ATENCAO_ATE = 400;

function svStatusEstoque(saldo) {
  if (saldo <= 0) return "esgotado";
  if (saldo < SV_ESTOQUE_BAIXO_LIMITE) return "baixo";
  if (saldo < SV_ESTOQUE_ATENCAO_ATE) return "atencao";
  return "normal";
}

// uma linha por produto cadastrado. chegou = processos FINALIZADO/FATURADO; saidas = reservado + vendido;
// saldo = chegou - saidas (soma de todos os armazéns); aCaminho = quantidade dos processos que ainda não chegaram.
// Produto que nunca recebeu nada (chegou = 0) não conta como "baixo/esgotado": só tem status quando já teve entrada.
function svListaEstoque() {
  const { linhas, aChegar } = svCalcularEstoque();
  const porCodigo = new Map();
  const novo = () => ({ chegou: 0, reservado: 0, vendido: 0, aCaminho: 0, aCaminhoLivre: 0, armazens: new Set(), processos: new Set() });
  const dado = (codigo) => {
    if (!porCodigo.has(codigo)) porCodigo.set(codigo, novo());
    return porCodigo.get(codigo);
  };
  linhas.forEach(l => {
    const d = dado(l.codigo);
    d.chegou += l.chegou; d.reservado += l.reservado; d.vendido += l.vendido;
    if (l.chegou > 0 && l.armazem) d.armazens.add(l.armazem);
  });
  aChegar.forEach(a => { const d = dado(a.codigo); d.aCaminho += a.total; d.aCaminhoLivre += Math.max(0, a.livres); });
  svState.previsoes.forEach(p => p.itens.forEach(it => { if (it.codigo) dado(it.codigo).processos.add(p.numeroProcesso); }));
  return svState.produtos.map(p => {
    const d = porCodigo.get(p.codigo) || novo();
    const saidas = d.reservado + d.vendido;
    const saldo = d.chegou - saidas;
    return { ...p, chegou: d.chegou, saidas, saldo, aCaminho: d.aCaminho, aCaminhoLivre: d.aCaminhoLivre, armazens: [...d.armazens].sort(), processos: [...d.processos],
      status: d.chegou > 0 ? svStatusEstoque(saldo) : "sementrada" };
  });
}

function svEstoqueBaixos(rows) {
  return rows.filter(r => r.chegou > 0 && r.saldo < SV_ESTOQUE_BAIXO_LIMITE).sort((a, b) => a.saldo - b.saldo || a.codigo.localeCompare(b.codigo));
}

function svRenderEstoque() {
  const todos = svListaEstoque();
  const comEntrada = todos.filter(r => r.chegou > 0);
  const baixos = svEstoqueBaixos(todos);

  // filtros de marca, tipo e armazém: montados a cada abertura (pega cadastro e dados novos), mantendo a escolha
  const preencher = (id, primeira, opcoes) => {
    const sel = document.getElementById(id);
    const atual = sel.value;
    sel.innerHTML = `<option value="">${primeira}</option>` + opcoes.map(([v, t]) => `<option value="${escapeAttr(v)}">${escapeHtml(t)}</option>`).join("");
    if (opcoes.some(([v]) => v === atual)) sel.value = atual;
  };
  preencher("svEstFiltroMarca", "Todas", [...new Set(svState.produtos.map(p => p.marca).filter(Boolean))].sort().map(m => [m, m]));
  preencher("svEstFiltroTipo", "Todos", [...Object.entries(CATEGORIA_LABEL), ["__sem", "Sem categoria"]]);
  preencher("svEstFiltroArmazem", "Todos", svArmazensDoEstoque(svEstoqueFisico()).filter(a => a).map(a => [a, a]));

  const soma = (arr, campo) => arr.reduce((s, r) => s + r[campo], 0);
  const kpis = [
    { lbl: "Pneus em estoque (saldo)", val: fmt(soma(comEntrada, "saldo")), accent: true },
    { lbl: "Total que chegou", val: fmt(soma(comEntrada, "chegou")) },
    { lbl: "Reservado e vendido", val: fmt(soma(comEntrada, "saidas")) },
    { lbl: "Produtos com saldo zerado", val: fmt(comEntrada.filter(r => r.saldo <= 0).length) },
    { lbl: "Produtos com saldo baixo", val: fmt(baixos.filter(r => r.saldo > 0).length) },
    { lbl: "A caminho (livre)", val: fmt(soma(todos, "aCaminhoLivre")), sub: `de ${fmt(soma(todos, "aCaminho"))} previstos` }
  ];
  document.getElementById("svEstKpis").innerHTML = kpis.map(k =>
    `<div class="kpi ${k.accent ? "accent" : ""}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div>${k.sub ? `<div class="note kpi-sub">${k.sub}</div>` : ""}</div>`).join("");

  // rosca por medida (só o que tem saldo)
  const porMedida = {};
  comEntrada.filter(r => r.saldo > 0).forEach(r => {
    const base = extractMedidaBase(r.medida);
    porMedida[base] = (porMedida[base] || 0) + r.saldo;
  });
  const entradas = Object.entries(porMedida).sort((a, b) => b[1] - a[1]);
  const vazioRosca = document.getElementById("svEstDonutEmpty");
  if (entradas.length === 0) {
    if (dashCharts["svChartEstoqueMedida"]) { dashCharts["svChartEstoqueMedida"].destroy(); delete dashCharts["svChartEstoqueMedida"]; }
    vazioRosca.style.display = "block";
  } else {
    vazioRosca.style.display = "none";
    const dobrado = foldTopN(entradas.map(([m]) => m), entradas.map(([, q]) => q), 6);
    dashChart("svChartEstoqueMedida",
      dashDonutConfig(dobrado.labels, dobrado.data, { valueIsMoney: false }),
      { type: "donut", title: "Estoque por Medida", labels: dobrado.labels, data: dobrado.data, opts: { valueIsMoney: false } });
  }

  // cartão "Saldo baixo"
  document.getElementById("svEstBaixoCount").textContent = baixos.length;
  document.getElementById("svEstBaixoLista").innerHTML = baixos.length === 0
    ? `<div class="empty-state">Nenhum produto com saldo baixo.</div>`
    : baixos.map(p => `
      <div class="alerta-item">
        <span class="codigo">${escapeHtml(p.codigo)}</span>
        <span class="medida">${escapeHtml(p.medida)}</span>
        <span class="saldo ${p.saldo <= 0 ? "saldo-zero" : "saldo-baixo"}">${fmt(p.saldo)} un.</span>
      </div>`).join("");

  // lista
  const search = (document.getElementById("svEstSearch").value || "").trim().toLowerCase();
  const fSaldo = document.getElementById("svEstFiltro").value;
  const fArm = document.getElementById("svEstFiltroArmazem").value;
  const fTipo = document.getElementById("svEstFiltroTipo").value;
  const fMarca = document.getElementById("svEstFiltroMarca").value;
  let rows = todos;
  if (search) rows = rows.filter(r => r.codigo.toLowerCase().includes(search) || r.medida.toLowerCase().includes(search) || r.processos.some(p => String(p).toLowerCase().includes(search)));
  if (fSaldo === "disponivel") rows = rows.filter(r => r.saldo > 0);
  if (fSaldo === "baixo") rows = rows.filter(r => r.chegou > 0 && r.saldo < SV_ESTOQUE_BAIXO_LIMITE);
  if (fArm) rows = rows.filter(r => r.armazens.includes(fArm));
  if (fTipo === "__sem") rows = rows.filter(r => !r.categoria);
  else if (fTipo) rows = rows.filter(r => normalizarCategoria(r.categoria || "") === normalizarCategoria(fTipo));
  if (fMarca) rows = rows.filter(r => r.marca === fMarca);
  rows = rows.slice().sort((a, b) => a.codigo.localeCompare(b.codigo));

  document.getElementById("svEstCount").textContent = `${rows.length} de ${todos.length} produto(s)`;
  const vazio = document.getElementById("svEstEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = todos.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado.";
  const rotulo = { esgotado: "Esgotado", baixo: "Baixo", atencao: "Atenção", normal: "Normal", sementrada: "Sem entrada" };
  document.getElementById("svEstTbody").innerHTML = rows.map(r => {
    const pct = r.chegou > 0 ? Math.max(0, Math.min(100, (r.saldo / r.chegou) * 100)) : 0;
    const semEntrada = r.status === "sementrada";
    return `
      <tr>
        <td class="mono">${escapeHtml(r.codigo)}</td>
        <td>${escapeHtml(r.medida)}</td>
        <td class="muted">${r.armazens.length ? escapeHtml(r.armazens.join(", ")) : "—"}</td>
        <td class="num">${fmt(r.chegou)}</td>
        <td class="num">${fmt(r.saidas)}</td>
        <td class="num">
          <div class="saldo-cell">
            <span class="saldo-bar"><span class="saldo-bar-fill fill-${semEntrada ? "normal" : r.status}" style="width:${pct}%"></span></span>
            <span class="saldo-val">${fmt(r.saldo)}</span>
            <span class="status-pill pill-${semEntrada ? "neutro" : r.status}">${rotulo[r.status]}</span>
          </div>
        </td>
        <td class="num">${r.aCaminho > 0 ? `<span class="sv-est-caminho${r.aCaminhoLivre <= 0 ? " zero" : ""}"><b>${fmt(r.aCaminhoLivre)}</b><small>de ${fmt(r.aCaminho)}</small></span>` : "—"}</td>
        <td><button type="button" class="btn small outline" data-svest-res="${escapeAttr(r.codigo)}">Reservas</button></td>
      </tr>`;
  }).join("");
}

/* ---------- Vendedores internos (lista que a Reserva usa; cadastro na Administração) ---------- */

// carga própria (fora do svState): a tabela sv_vendedores é da etapa de vendedor/representante
// e só a Reserva e o quadro da Administração dependem dela
let svVendedores = [];
let svVendedoresEmAndamento = null;

function svCarregarVendedores() {
  if (svVendedoresEmAndamento) return svVendedoresEmAndamento;
  svVendedoresEmAndamento = (async () => {
    const { data, error } = await sb.from("sv_vendedores").select("*").order("nome");
    if (error) {
      toast("Erro ao carregar os vendedores: " + error.message);
      return false;
    }
    svVendedores = (data || []).map(v => ({ id: v.id, nome: v.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
    return true;
  })().finally(() => { svVendedoresEmAndamento = null; });
  return svVendedoresEmAndamento;
}

// chamado pelo setView() do app.js quando a tela Administração abre (só admin chega lá)
async function svAoAbrirAdministracao() {
  const tarefas = [];
  if (document.getElementById("svVendedoresCard")) tarefas.push(svCarregarVendedores().then(ok => { if (ok) svRenderVendedoresAdmin(); }));
  if (document.getElementById("svRepresentantesCard")) tarefas.push(svCarregarRepresentantes().then(() => svRenderRepresentantesAdmin()));
  if (document.getElementById("svTransportadorasCard")) tarefas.push(svCarregarTransportadoras().then(ok => { if (ok) svRenderTransportadorasAdmin(); }));
  await Promise.all(tarefas);
}

function svRenderVendedoresAdmin() {
  const n = svVendedores.length;
  document.getElementById("svVendCount").textContent = n === 0 ? "" : `${n} ${n === 1 ? "vendedor cadastrado" : "vendedores cadastrados"}`;
  document.getElementById("svVendEmpty").style.display = n === 0 ? "block" : "none";
  const tbody = document.getElementById("svVendTbody");
  tbody.innerHTML = svVendedores.map(v => `
    <tr>
      <td>${escapeHtml(v.nome)}</td>
      <td class="sv-acoes"><button type="button" class="sv-link" data-svvenddel="${escapeAttr(v.id)}">Excluir</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-svvenddel]").forEach(btn => {
    btn.addEventListener("click", () => svExcluirVendedor(btn.dataset.svvenddel));
  });
}

async function svAdicionarVendedor(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnAddVendedor");
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    const campo = document.getElementById("svVendNome");
    const nome = campo.value.replace(/\s+/g, " ").trim();
    if (!nome) { toast("Informe o nome do vendedor."); return; }
    if (svVendedores.some(v => v.nome.toLowerCase() === nome.toLowerCase())) { toast("Esse vendedor já está na lista."); return; }
    const { data, error } = await sb.from("sv_vendedores").insert({ id: uid("svven"), nome, created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao adicionar vendedor: " + error.message); return; }
    if (!data || data.length === 0) { toast("Não foi possível adicionar (sem permissão)."); return; }
    svVendedores.push({ id: data[0].id, nome: data[0].nome });
    svVendedores.sort((a, b) => a.nome.localeCompare(b.nome));
    campo.value = "";
    svRenderVendedoresAdmin();
    toast("Vendedor adicionado.");
  } finally { botao.disabled = false; }
}

async function svExcluirVendedor(id) {
  const v = svVendedores.find(x => x.id === id);
  if (!v) return;
  const ok = await confirmModal("Excluir vendedor?", `Remove "${v.nome}" da lista de vendedores internos. As reservas que já foram feitas com esse nome continuam como estão.`);
  if (!ok) return;
  const { data, error } = await sb.from("sv_vendedores").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir vendedor: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou já removido)."); return; }
  svVendedores = svVendedores.filter(x => x.id !== id);
  svRenderVendedoresAdmin();
  toast("Vendedor removido.");
}

/* ---------- Representantes sem login (lista que a Reserva usa junto com os de login; cadastro na Administração) ---------- */

// mesma ideia dos vendedores: carga própria, para a falta da tabela (sql/sem_venda_representantes_extras.sql) não derrubar o resto
let svRepresentantes = [];
let svRepresentantesEmAndamento = null;

function svCarregarRepresentantes() {
  if (svRepresentantesEmAndamento) return svRepresentantesEmAndamento;
  svRepresentantesEmAndamento = (async () => {
    const { data, error } = await sb.from("sv_representantes").select("*").order("nome");
    if (error) {
      svRepresentantes = [];
      return false; // sem a tabela a Reserva só mostra os representantes com login, como antes
    }
    svRepresentantes = (data || []).map(r => ({ id: r.id, nome: r.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return true;
  })().finally(() => { svRepresentantesEmAndamento = null; });
  return svRepresentantesEmAndamento;
}

function svRenderRepresentantesAdmin() {
  const n = svRepresentantes.length;
  document.getElementById("svRepCount").textContent = n === 0 ? "" : `${n} ${n === 1 ? "representante cadastrado" : "representantes cadastrados"}`;
  document.getElementById("svRepEmpty").style.display = n === 0 ? "block" : "none";
  const tbody = document.getElementById("svRepTbody");
  tbody.innerHTML = svRepresentantes.map(r => `
    <tr>
      <td>${escapeHtml(r.nome)}</td>
      <td class="sv-acoes"><button type="button" class="sv-link" data-svrepdel="${escapeAttr(r.id)}">Excluir</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-svrepdel]").forEach(btn => {
    btn.addEventListener("click", () => svExcluirRepresentante(btn.dataset.svrepdel));
  });
}

async function svAdicionarRepresentante(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnAddRepresentante");
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    const campo = document.getElementById("svRepNome");
    const nome = campo.value.replace(/\s+/g, " ").trim();
    if (!nome) { toast("Informe o nome do representante."); return; }
    if (svRepresentantes.some(r => r.nome.toLowerCase() === nome.toLowerCase()) || (state.representantes || []).some(n => n.toLowerCase() === nome.toLowerCase())) { toast("Esse representante já está na lista."); return; }
    const { data, error } = await sb.from("sv_representantes").insert({ id: uid("svrep"), nome, created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao adicionar o representante: " + error.message); return; }
    if (!data || data.length === 0) { toast("Não foi possível adicionar (sem permissão)."); return; }
    svRepresentantes.push({ id: data[0].id, nome: data[0].nome });
    svRepresentantes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    campo.value = "";
    svRenderRepresentantesAdmin();
    toast("Representante adicionado.");
  } finally { botao.disabled = false; }
}

async function svExcluirRepresentante(id) {
  const r = svRepresentantes.find(x => x.id === id);
  if (!r) return;
  const ok = await confirmModal("Excluir representante?", `Remove "${r.nome}" da lista de representantes do Sem Venda. As reservas que já foram feitas com esse nome continuam como estão.`);
  if (!ok) return;
  const { data, error } = await sb.from("sv_representantes").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir o representante: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou já removido)."); return; }
  svRepresentantes = svRepresentantes.filter(x => x.id !== id);
  svRenderRepresentantesAdmin();
  toast("Representante removido.");
}

/* ---------- Transportadoras (lista que a Reserva usa; cadastro na Administração) ---------- */

// mesma ideia dos vendedores e das condições: carga própria, para a falta da tabela não derrubar o resto do Sem Venda
let svTransportadoras = [];
let svTransportadorasEmAndamento = null;

function svCarregarTransportadoras() {
  if (svTransportadorasEmAndamento) return svTransportadorasEmAndamento;
  svTransportadorasEmAndamento = (async () => {
    const { data, error } = await sb.from("sv_transportadoras").select("*").order("nome");
    if (error) {
      toast("Erro ao carregar as transportadoras: " + error.message);
      return false;
    }
    svTransportadoras = (data || []).map(t => ({ id: t.id, nome: t.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return true;
  })().finally(() => { svTransportadorasEmAndamento = null; });
  return svTransportadorasEmAndamento;
}

function svRenderTransportadorasAdmin() {
  const n = svTransportadoras.length;
  document.getElementById("svTranspCount").textContent = n === 0 ? "" : `${n} ${n === 1 ? "transportadora cadastrada" : "transportadoras cadastradas"}`;
  document.getElementById("svTranspEmpty").style.display = n === 0 ? "block" : "none";
  const tbody = document.getElementById("svTranspTbody");
  tbody.innerHTML = svTransportadoras.map(t => `
    <tr>
      <td>${escapeHtml(t.nome)}</td>
      <td class="sv-acoes"><button type="button" class="sv-link" data-svtranspdel="${escapeAttr(t.id)}">Excluir</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-svtranspdel]").forEach(btn => {
    btn.addEventListener("click", () => svExcluirTransportadora(btn.dataset.svtranspdel));
  });
}

async function svAdicionarTransportadora(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnAddTransportadora");
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    const campo = document.getElementById("svTranspNome");
    const nome = campo.value.replace(/\s+/g, " ").trim();
    if (!nome) { toast("Informe o nome da transportadora."); return; }
    if (svTransportadoras.some(t => t.nome.toLowerCase() === nome.toLowerCase())) { toast("Essa transportadora já está na lista."); return; }
    const { data, error } = await sb.from("sv_transportadoras").insert({ id: uid("svtransp"), nome, created_by: currentUser ? currentUser.id : null }).select();
    if (error) { toast("Erro ao adicionar a transportadora: " + error.message); return; }
    if (!data || data.length === 0) { toast("Não foi possível adicionar (sem permissão)."); return; }
    svTransportadoras.push({ id: data[0].id, nome: data[0].nome });
    svTransportadoras.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    campo.value = "";
    svRenderTransportadorasAdmin();
    toast("Transportadora adicionada.");
  } finally { botao.disabled = false; }
}

async function svExcluirTransportadora(id) {
  const t = svTransportadoras.find(x => x.id === id);
  if (!t) return;
  const ok = await confirmModal("Excluir transportadora?", `Remove "${t.nome}" da lista de transportadoras. As reservas que já foram feitas com ela continuam como estão.`);
  if (!ok) return;
  const { data, error } = await sb.from("sv_transportadoras").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir a transportadora: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou já removida)."); return; }
  svTransportadoras = svTransportadoras.filter(x => x.id !== id);
  svRenderTransportadorasAdmin();
  toast("Transportadora removida.");
}

/* ---------- Clientes do Sem Venda (cadastro próprio, separado do Torun) ---------- */

// "Ambos" só existe no cadastro do cliente; a reserva continua sendo de uma unidade só
const SV_UNIDADES_CLIENTE = { ...SV_UNIDADES, AMBOS: "Ambos" };
let svClientes = [];
let svClientesEmAndamento = null;
let svClientesCarregados = false;
let svCliSelecionadoId = null;
let svCliUnidadeAtual = "";

function svClienteFromRow(r) {
  return {
    id: r.id, nome: r.nome, tipoPessoa: r.tipo_pessoa || "PJ", documento: r.documento || "", razaoSocial: r.razao_social || "", contato: r.contato || "",
    telefone: r.telefone || "", email: r.email || "", cep: r.cep || "", endereco: r.endereco || "", cidade: r.cidade || "", estado: r.estado || "",
    unidadeNegocio: r.unidade_negocio || "AMBOS", sistemaCrm: r.sistema_crm || "", obs: r.obs || "", createdAt: r.created_at || ""
  };
}

// carrega uma vez; quem precisa de dado fresco (a tela de Clientes) passa forcar
function svCarregarClientes(forcar) {
  if (svClientesEmAndamento) return svClientesEmAndamento;
  if (svClientesCarregados && !forcar) return Promise.resolve(true);
  svClientesEmAndamento = (async () => {
    const { data, error } = await sb.rpc("sv_clientes_do_crm");
    if (error) {
      toast("Erro ao carregar os clientes (cadastro do CRM): " + error.message);
      return false;
    }
    svClientes = (data || []).map(svClienteFromRow).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    svClientesCarregados = true;
    return true;
  })().finally(() => { svClientesEmAndamento = null; });
  return svClientesEmAndamento;
}

function svReservasDoCliente(nome) {
  return svState.reservas.filter(r => r.cliente === nome);
}

function svRenderClientes() {
  const ativasPorNome = {};
  const ultimaPorNome = {};
  svState.reservas.forEach(r => {
    if (r.situacao === "ATIVA") ativasPorNome[r.cliente] = (ativasPorNome[r.cliente] || 0) + 1;
    if (r.data && (!ultimaPorNome[r.cliente] || r.data > ultimaPorNome[r.cliente])) ultimaPorNome[r.cliente] = r.data;
  });

  const inicioMes = todayISO().slice(0, 7) + "-01";
  const parados = svClientes.filter(c => { const d = svDiasDesde(ultimaPorNome[c.nome]); return d === null || d >= 90; }).length;
  document.getElementById("svCliKpis").innerHTML = [
    { lbl: "Total de clientes", val: fmt(svClientes.length), accent: true },
    { lbl: "Com reserva ativa", val: fmt(svClientes.filter(c => ativasPorNome[c.nome]).length) },
    { lbl: "Novos no mês", val: fmt(svClientes.filter(c => (c.createdAt || "") >= inicioMes).length) },
    { lbl: "Sem reserva há 90+ dias", val: fmt(parados) }
  ].map(k => `<div class="kpi ${k.accent ? "accent" : ""}"><div class="lbl">${k.lbl}</div><div class="val" style="font-size:19px;">${k.val}</div></div>`).join("");

  const chaves = [["", "Todos", svClientes.length], ...Object.entries(SV_UNIDADES_CLIENTE).map(([k, l]) => [k, l, svClientes.filter(c => c.unidadeNegocio === k).length])];
  document.getElementById("svCliChips").innerHTML = chaves.map(([k, l, n]) =>
    `<button type="button" class="sv-chip${k === svCliUnidadeAtual ? " on" : ""}" data-svcliun="${k}" aria-pressed="${k === svCliUnidadeAtual}">${escapeHtml(l)} <b>${fmt(n)}</b></button>`).join("");

  const busca = (document.getElementById("svCliSearch").value || "").trim().toLowerCase();
  let rows = svClientes.slice();
  if (svCliUnidadeAtual) rows = rows.filter(c => c.unidadeNegocio === svCliUnidadeAtual);
  if (busca) rows = rows.filter(c => [c.nome, c.documento, c.cidade, c.estado, c.contato].join(" ").toLowerCase().includes(busca));
  document.getElementById("svCliCount").textContent = `${rows.length} de ${svClientes.length} cliente(s)`;

  if (svCliSelecionadoId && !svClientes.some(c => c.id === svCliSelecionadoId)) svCliSelecionadoId = null;
  document.getElementById("svCliRows").innerHTML = rows.length === 0
    ? `<div class="sv-vazio"><div class="sv-vazio-t">${svClientes.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente com esses filtros."}</div></div>`
    : rows.map(c => {
        const n = ativasPorNome[c.nome] || 0;
        return `
      <div class="split-row ${c.id === svCliSelecionadoId ? "active" : ""}" data-svcli="${escapeAttr(c.id)}">
        <div class="split-row-body">
          <div class="split-row-top"><span class="split-row-nome">${escapeHtml(c.nome)}</span>${svSeloUnidadeCliente(c.unidadeNegocio)}</div>
          <div class="split-row-meta"><span>${escapeHtml(c.cidade || "—")} · ${escapeHtml(c.estado || "—")}</span><span>${n ? `${n} reserva${n === 1 ? "" : "s"} ativa${n === 1 ? "" : "s"}` : "sem reserva ativa"}</span></div>
        </div>
      </div>`;
      }).join("");

  svRenderClienteDetalhe();
}

function svSeloUnidadeCliente(u) {
  const cls = u === "ATACADO" ? "atacado" : u === "ENCOMENDA" ? "encomenda" : "ambos";
  return `<span class="sv-un ${cls}">${escapeHtml(SV_UNIDADES_CLIENTE[u] || u)}</span>`;
}

function svRenderClienteDetalhe() {
  const c = svClientes.find(x => x.id === svCliSelecionadoId);
  document.getElementById("svCliVazio").style.display = c ? "none" : "";
  const box = document.getElementById("svCliDetalhe");
  box.style.display = c ? "" : "none";
  if (!c) return;
  const reservas = svReservasDoCliente(c.nome).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const ativas = reservas.filter(r => r.situacao === "ATIVA");
  const ultima = reservas.length ? reservas[0].data : null;
  const campos = [
    ["CNPJ/CPF", c.documento], ["Contato", c.contato], ["Telefone", c.telefone], ["E-mail", c.email],
    ["Razão social", c.razaoSocial], ["CEP", c.cep], ["Endereço", c.endereco],
    ["Cidade/UF", [c.cidade, c.estado].filter(Boolean).join(" / ")], ["Carteira no CRM", c.sistemaCrm]
  ].map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${escapeHtml(v || "—")}</div></div>`).join("")
    + `<div><div class="lbl">Unidade de negócio</div><div class="val">${svSeloUnidadeCliente(c.unidadeNegocio)}</div></div>`;
  box.innerHTML = `
    <div class="cliente-modal-head">
      <div class="cliente-modal-titulo"><h3>${escapeHtml(c.nome)}</h3><span class="cli-tp-selo">${escapeHtml(c.tipoPessoa)}</span></div>
    </div>
    <div class="cliente-modal-info">${campos}</div>
    ${c.obs ? `<div class="note" style="margin:10px 0;"><b>Observações:</b> ${escapeHtml(c.obs)}</div>` : ""}
    <div class="kpis" style="margin-top:12px;">
      <div class="kpi"><div class="lbl">Reservas ativas</div><div class="val" style="font-size:19px;">${fmt(ativas.length)}</div></div>
      <div class="kpi"><div class="lbl">Pneus reservados</div><div class="val" style="font-size:19px;">${fmt(ativas.reduce((s, r) => s + r.quantidade, 0))} un.</div></div>
      <div class="kpi"><div class="lbl">Última reserva</div><div class="val" style="font-size:19px;">${ultima ? formatDateBR(ultima) : "—"}</div></div>
    </div>
    <h2 style="margin:14px 0 6px;">Reservas deste cliente</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Produto</th><th>Unidade</th><th>Qtd.</th><th>Situação</th></tr></thead>
      <tbody>${reservas.length ? reservas.map(r => {
        const p = svGetProduto(r.codigo);
        const sit = svSituacaoReserva(r);
        return `<tr><td class="mono">${r.data ? formatDateBR(r.data) : "—"}</td><td><span class="mono">${escapeHtml(r.codigo)}</span> ${escapeHtml(p ? p.medida : "")}</td><td>${r.unidadeNegocio ? escapeHtml(SV_UNIDADES[r.unidadeNegocio] || r.unidadeNegocio) : "—"}</td><td class="mono">${fmt(r.quantidade)}</td><td><span class="status-pill ${sit.pill}">${escapeHtml(sit.rotulo)}</span></td></tr>`;
      }).join("") : `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px;">Nenhuma reserva ainda.</td></tr>`}</tbody>
    </table></div>`;
}

function svLigarClientes() {
  const $ = (id) => document.getElementById(id);
  $("svCliSearch").addEventListener("input", svRenderClientes);
  $("svCliChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-svcliun]");
    if (!b) return;
    svCliUnidadeAtual = b.dataset.svcliun;
    svRenderClientes();
  });
  $("svCliRows").addEventListener("click", (e) => {
    const linha = e.target.closest("[data-svcli]");
    if (!linha) return;
    svCliSelecionadoId = linha.dataset.svcli;
    svRenderClientes();
  });
}

/* ---------- Relatório de Preço (proposta em PDF) ---------- */

// preço digitado só pra esta proposta, por código (null = "Sob consulta"); zera sempre que a tela abre,
// pra um preço antigo não esconder uma atualização do cadastro
let svPropostaPrecos = {};
// quantidade digitada só pra esta proposta, por código + armazém (sem trava no disponível); zera junto com os preços
let svPropostaQtds = {};

function svChaveQtdProposta(l) {
  return l.codigo + "|" + l.armazem;
}

// quantidade que sai na proposta: a digitada, ou o disponível; vazio e 0 valem 0 (a linha fica de fora do PDF)
function svQtdProposta(l) {
  const chave = svChaveQtdProposta(l);
  return Object.prototype.hasOwnProperty.call(svPropostaQtds, chave) ? svPropostaQtds[chave] : l.disp;
}

function svPrecoProposta(codigo) {
  if (Object.prototype.hasOwnProperty.call(svPropostaPrecos, codigo)) return svPropostaPrecos[codigo];
  const p = svGetProduto(codigo);
  return p && p.preco !== null ? p.preco : null;
}

// o que dá pra oferecer: disponível (chegou − reservado − vendido) por produto e armazém, com os filtros da tela
function svLinhasProposta() {
  const armazem = document.getElementById("svPropArmazem").value;
  const categoria = document.getElementById("svPropCategoria").value;
  return svCalcularEstoque().linhas
    .filter(l => l.disp > 0)
    .map(l => ({ ...l, produto: svGetProduto(l.codigo) }))
    .filter(l => !armazem || (armazem === "__sem" ? !l.armazem : l.armazem === armazem))
    .filter(l => !categoria || (l.produto && l.produto.categoria === categoria))
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.armazem.localeCompare(b.armazem));
}

// campo de texto livre, sem lista; vazio = "sob consulta"
function svSubProposta() {
  const cliente = document.getElementById("svPropCliente").value.trim();
  const validade = document.getElementById("svPropValidade").value;
  const condicao = document.getElementById("svPropCondicao").value.trim();
  return [validade ? "Válida até " + formatDateBR(validade) : "", cliente, condicao ? "Pagamento: " + condicao : ""].filter(Boolean).join(" · ");
}

function svRodapeProposta() {
  const condicao = document.getElementById("svPropCondicao").value.trim();
  return (condicao ? "" : "Forma de pagamento sob consulta. ") + "Frete não incluso, combinado à parte. Quantidades sujeitas a confirmação de estoque.";
}

function svAtualizarCabecalhoProposta() {
  document.getElementById("svPropSub").textContent = svSubProposta();
  document.getElementById("svPropRodape").textContent = svRodapeProposta();
}

function svAbrirProposta() {
  svPropostaPrecos = {};
  svPropostaQtds = {};
  const disponiveis = svCalcularEstoque().linhas.filter(l => l.disp > 0);

  const selArmazem = document.getElementById("svPropArmazem");
  const armazemAtual = selArmazem.value;
  selArmazem.innerHTML = `<option value="">Todos</option>` +
    svArmazensDoEstoque(disponiveis).map(a => `<option value="${escapeAttr(a === "" ? "__sem" : a)}">${escapeHtml(svNomeArmazem(a))}</option>`).join("");
  if ([...selArmazem.options].some(o => o.value === armazemAtual)) selArmazem.value = armazemAtual;

  const selCategoria = document.getElementById("svPropCategoria");
  const categoriaAtual = selCategoria.value;
  selCategoria.innerHTML = svOpcoesCategoria("Todas");
  if ([...selCategoria.options].some(o => o.value === categoriaAtual)) selCategoria.value = categoriaAtual;

  document.getElementById("svPropClientes").innerHTML = svClientes
    .map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");
  const validade = document.getElementById("svPropValidade");
  if (!validade.value) validade.value = dataMaisDias(todayISO(), 7);

  svAtualizarCabecalhoProposta();
  svRenderTabelaProposta();
}

// célula de modelo ou marca da proposta: o texto do cadastro, ou um traço quando o produto não tem (ou foi removido)
function svCelulaTexto(valor, classeVazio) {
  return valor ? `<td>${escapeHtml(valor)}</td>` : `<td class="${classeVazio}">—</td>`;
}

function svRenderTabelaProposta() {
  const linhas = svLinhasProposta();
  document.getElementById("svPropTbody").innerHTML = linhas.map(l => {
    const preco = svPrecoProposta(l.codigo);
    return `
      <tr>
        <td class="mono">${escapeHtml(l.codigo)}</td>
        <td>${escapeHtml(l.produto ? l.produto.medida : "(produto removido)")}</td>
        ${svCelulaTexto(l.produto && l.produto.modelo, "muted")}
        ${svCelulaTexto(l.produto && l.produto.marca, "muted")}
        <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
        <td class="sv-num">${fmt(l.disp)}</td>
        <td class="sv-num"><input type="number" class="sv-prop-qtd" data-svqtd="${escapeAttr(svChaveQtdProposta(l))}" min="0" step="1" value="${svQtdProposta(l)}" aria-label="Quantidade de ${escapeAttr(l.codigo)} na proposta"></td>
        <td class="sv-num"><input type="number" class="sv-prop-preco" data-svpreco="${escapeAttr(l.codigo)}" min="0" step="0.01" placeholder="Sob consulta" value="${preco === null ? "" : preco}" aria-label="Preço por unidade de ${escapeAttr(l.codigo)}"></td>
      </tr>`;
  }).join("");
  const vazio = document.getElementById("svPropEmpty");
  vazio.style.display = linhas.length === 0 ? "block" : "none";
  vazio.textContent = svCalcularEstoque().linhas.some(l => l.disp > 0)
    ? "Nenhum pneu disponível com esses filtros."
    : "Nenhum pneu disponível ainda. Quando um processo do Estoque Previsto for marcado como FINALIZADO (com o armazém), os pneus aparecem aqui.";
}

function svBuildPropostaHtml(linhas) {
  const sub = svSubProposta();
  const trs = linhas.map(l => {
    const preco = svPrecoProposta(l.codigo);
    return `<tr>
        <td class="mono">${escapeHtml(l.codigo)}</td>
        <td>${escapeHtml(l.produto ? l.produto.medida : "")}</td>
        ${svCelulaTexto(l.produto && l.produto.modelo, "vazio")}
        ${svCelulaTexto(l.produto && l.produto.marca, "vazio")}
        <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
        <td class="num">${fmt(svQtdProposta(l))}</td>
        <td class="num">${preco === null ? "Sob consulta" : escapeHtml(formatMoney(preco))}</td>
      </tr>`;
  }).join("");
  return `
    <div class="print-proposta">
      <div class="pp-topo">
        <div>
          ${sub ? `<div class="pp-sub">${escapeHtml(sub)}</div>` : ""}
        </div>
      </div>
      <table class="pp-tabela">
        <thead><tr><th class="pp-col-cod">Código</th><th>Medida</th><th class="pp-col-modelo">Modelo</th><th class="pp-col-marca">Marca</th><th class="pp-col-arm">Armazém</th><th class="num pp-col-qtd">Qtd.</th><th class="num pp-col-preco">Preço/un.</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <div class="pp-rodape">${escapeHtml(svRodapeProposta())}</div>
    </div>`;
}

function svLimparImpressaoProposta() {
  document.body.classList.remove("imprimindo-doc");
  document.getElementById("reportPrintArea").innerHTML = "";
}

async function svGerarProposta(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnGerarProposta");
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    // confere o estoque com dados atualizados: a aba pode estar aberta há horas e o PDF vai pro cliente
    if (!(await svCarregarDados(true))) return;
    svRenderTabelaProposta();
    const linhas = svLinhasProposta().filter(l => svQtdProposta(l) > 0);
    if (linhas.length === 0) { toast("Não há pneus com quantidade na proposta com esses filtros."); return; }
    const area = document.getElementById("reportPrintArea");
    document.body.classList.remove("imprimindo-doc"); // caso uma impressão anterior tenha sido interrompida
    document.body.classList.add("imprimindo-doc");
    area.innerHTML = svBuildPropostaHtml(linhas);
    // mesmo teto de 10s das outras impressões: aba em segundo plano pode segurar o decode() indefinidamente
    const esperaLimite = new Promise(resolve => setTimeout(resolve, 10000));
    await Promise.race([
      Promise.all([...area.querySelectorAll("img")].map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))),
      esperaLimite
    ]);
    window.addEventListener("afterprint", svLimparImpressaoProposta, { once: true });
    window.print();
  } catch (err) {
    console.error("Erro ao gerar a proposta:", err);
    svLimparImpressaoProposta();
    toast("Não foi possível gerar o PDF da proposta: " + (err.message || err));
  } finally {
    botao.disabled = false;
  }
}

/* ---- Pedido de venda em PDF (para o faturamento) ----
   Um documento por venda: os produtos de um pedido vendidos juntos (mesmo pedido_id e mesmo dia) saem juntos; uma venda parcial
   ou o restante vendido em outro dia é outro documento. O número é sequencial e fica gravado (sql/sem_venda_pedido_documento.sql). */
function svDocVenda(r) {
  if (!r || r.situacao !== "VENDIDA") return [];
  if (!r.pedidoId) return [r];
  return svState.reservas.filter(x => x.pedidoId === r.pedidoId && x.situacao === "VENDIDA" && x.vendidoEm === r.vendidoEm && !svReservaMascarada(x));
}

// pedido com 2+ produtos cujos vendidos formam um documento só (e com 2+ produtos nele): devolve uma linha dele; senão null
function svDocUnicoDoPedido(membros) {
  const vendidas = membros.filter(x => x.situacao === "VENDIDA" && !svReservaMascarada(x));
  if (vendidas.length < 2) return null;
  const doc = svDocVenda(vendidas[0]);
  return doc.length === vendidas.length ? vendidas[0] : null;
}

// o que falta no cadastro do cliente para o faturamento: [] = completo
function svFaltasCadastro(c) {
  if (!c) return ["cadastro do cliente (não achei esse nome em Clientes)"];
  const faltas = [];
  if (!c.documento) faltas.push(c.tipoPessoa === "PF" ? "CPF" : "CNPJ");
  if (!c.endereco) faltas.push("endereço");
  if (!c.cidade || !c.estado) faltas.push("cidade e UF");
  return faltas;
}

function svDadosPedidoDoc(linhas, cliente, numero) {
  const r0 = linhas[0];
  const agora = new Date();
  const total = linhas.reduce((s, r) => s + (r.precoUnitario !== null ? Math.round(r.precoUnitario * r.quantidade * 100) / 100 : 0), 0);
  // pagamento: soma de cada forma nas linhas; sem divisão, a forma única com o total
  const porForma = new Map();
  linhas.forEach(r => {
    if (Array.isArray(r.divisaoPagamento) && r.divisaoPagamento.length) {
      r.divisaoPagamento.forEach(p => porForma.set(p.forma_pagamento, Math.round(((porForma.get(p.forma_pagamento) || 0) + Number(p.valor)) * 100) / 100));
    }
  });
  const pagamento = porForma.size
    ? [...porForma].map(([forma, valor]) => ({ forma, valor }))
    : (r0.formaPagamento ? [{ forma: r0.formaPagamento, valor: total }] : []);
  const obs = [...new Set(linhas.map(r => (r.obs || "").trim()).filter(Boolean))].join(" · ");
  const c = cliente;
  return {
    numero, dataVenda: r0.vendidoEm, dataReserva: r0.data,
    cliente: r0.cliente, razao: c ? (c.razaoSocial || c.nome) : "", documento: c ? c.documento : "", docRotulo: c && c.tipoPessoa === "PF" ? "CPF" : "CNPJ",
    endereco: c && c.endereco ? [c.endereco, [c.cidade, c.estado].filter(Boolean).join("/"), c.cep ? `CEP ${c.cep}` : ""].filter(Boolean).join(" · ") : "",
    contato: c ? [c.contato, c.telefone].filter(Boolean).join(" · ") : "", email: c ? c.email : "",
    vendedor: r0.vendedorInterno, representante: r0.representante || "Sem representante",
    unidade: SV_UNIDADES[r0.unidadeNegocio] || "", frete: r0.clienteRetira ? "Cliente retira" : (SV_TIPOS_TRANSPORTE[r0.tipoTransporte] || ""),
    transportadora: r0.clienteRetira ? "" : r0.transportadora,
    forma: pagamento.map(p => p.forma).join(" + "), pagamento, obs, total,
    itens: linhas.map(r => {
      const p = svGetProduto(r.codigo);
      return { codigo: r.codigo, produto: [p ? p.medida : "(produto removido)", p && p.marca].filter(Boolean).join(" · "), origem: svOrigemReserva(r),
        quantidade: r.quantidade, preco: r.precoUnitario,
        subtotal: r.precoUnitario !== null ? Math.round(r.precoUnitario * r.quantidade * 100) / 100 : null };
    }),
    geradoPor: [currentUserNome, currentUser && currentUser.email ? `(${currentUser.email})` : ""].filter(Boolean).join(" "),
    geradoEm: `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")}`
  };
}

function svBuildPedidoHtml(d) {
  const ni = (v) => v && String(v).trim() ? escapeHtml(v) : `<span class="pv-ni">não informado</span>`;
  const dinheiro = (v) => v === null || v === undefined ? "—" : `<i>R$</i><span>${escapeHtml(formatMoney(v).replace(/^R\$\s*/, ""))}</span>`;
  const trs = d.itens.map(i => `<tr>
        <td class="c mono">${escapeHtml(i.codigo)}</td><td>${escapeHtml(i.produto)}</td><td>${escapeHtml(i.origem)}</td>
        <td class="c">${fmt(i.quantidade)}</td><td class="m"><div class="rs">${dinheiro(i.preco)}</div></td><td class="m"><div class="rs">${dinheiro(i.subtotal)}</div></td>
      </tr>`).join("");
  const unidades = d.itens.reduce((s, i) => s + i.quantidade, 0);
  const pag = d.pagamento.length
    ? d.pagamento.map(p => `<b>${escapeHtml(p.forma)} ${escapeHtml(formatMoney(p.valor))}</b>`).join("")
    : `<b>${ni("")}</b>`;
  return `
    <div class="print-pedido">
      <div class="pv-faixa">
        <div class="pv-meio"><small>PEDIDO DE VENDA</small><b>Nº ${String(d.numero).padStart(4, "0")}</b></div>
        <div class="pv-dt"><small>DATA DA VENDA</small><b>${d.dataVenda ? formatDateBR(d.dataVenda) : "—"}</b>${d.dataReserva ? `<i>reserva de ${formatDateBR(d.dataReserva)}</i>` : ""}</div>
      </div>
      <div class="pv-dados">
        <span>Cliente</span><b>${ni(d.cliente)}</b><span class="sep">Frete</span><b class="d">${ni(d.frete)}</b>
        <span>Razão social</span><b>${ni(d.razao)}</b><span class="sep">Transportadora</span><b class="d">${d.transportadora ? escapeHtml(d.transportadora) : "—"}</b>
        <span>${d.docRotulo}</span><b>${ni(d.documento)}</b><span class="sep">Unidade</span><b class="d">${ni(d.unidade)}</b>
        <span>Endereço entrega</span><b>${ni(d.endereco)}</b><span class="sep">Representante</span><b class="d">${ni(d.representante)}</b>
        <span>Contato</span><b>${ni(d.contato)}</b><span class="sep">Forma de pagamento</span><b class="d">${ni(d.forma)}</b>
        <span>Vendedor</span><b>${ni(d.vendedor)}</b><span class="sep">E-mail</span><b class="d pv-mail">${ni(d.email)}</b>
      </div>
      <div class="pv-sec">ITENS DO PEDIDO</div>
      <table class="pv-tabela"><thead><tr><th class="pv-c-cod">CÓDIGO</th><th>PRODUTO</th><th>ORIGEM DO ESTOQUE</th><th class="pv-c-qtd">QUANTIDADE</th><th class="pv-c-val">VALOR UNITÁRIO</th><th class="pv-c-tot">VALOR TOTAL</th></tr></thead>
        <tbody>${trs}</tbody></table>
      <div class="pv-pag"><span>Divisão do pagamento</span>${pag}</div>
      <div class="pv-tot">
        <div class="pv-obs"><span>Observações para o pedido</span>${d.obs ? escapeHtml(d.obs) : ""}</div>
        <div class="pv-qt">${fmt(unidades)} un.</div>
        <div class="pv-tt"><span>TOTAL</span><b>${escapeHtml(formatMoney(d.total))}</b></div>
      </div>
      <div class="pv-pe"><span><b>Documento gerado por</b> ${escapeHtml(d.geradoPor)} <b>em</b> ${escapeHtml(d.geradoEm)}</span><span>Pedido nº ${String(d.numero).padStart(4, "0")}</span></div>
    </div>`;
}

function svLimparImpressaoPedido() {
  document.body.classList.remove("imprimindo-doc");
  document.getElementById("reportPrintArea").innerHTML = "";
}

let svGerandoPedido = false;
async function svGerarPedido(id, botao) {
  if (svGerandoPedido) return;
  svGerandoPedido = true;
  if (botao) botao.disabled = true;
  try {
    // dados do banco de agora: o cadastro do cliente e o preço podem ter mudado depois da venda
    if (!(await svCarregarDados(true))) return;
    await svCarregarClientes(true);
    const r = svState.reservas.find(x => x.id === id);
    if (!r || r.situacao !== "VENDIDA") { toast("Essa reserva não está mais vendida. Atualizei a lista."); svRenderReserva(); return; }
    const linhas = svDocVenda(r);
    if (linhas.length === 0) return;
    const cliente = svClientes.find(c => c.nome.toLowerCase() === r.cliente.toLowerCase()) || null;
    const faltas = svFaltasCadastro(cliente);
    if (faltas.length && !(await confirmModal("Cadastro do cliente incompleto", `Em ${r.cliente} faltam: ${faltas.join(", ")}. O pedido sai com "não informado" nesses campos e o faturamento vai precisar completar. Gerar mesmo assim?`, "Gerar mesmo assim", "Cancelar"))) return;

    const { data: numero, error } = await sb.rpc("sv_numero_pedido", { p_ids: linhas.map(x => x.id) });
    if (error) {
      toast(/Could not find|does not exist|schema cache/i.test(error.message)
        ? "Falta rodar o SQL sem_venda_pedido_documento.sql no Supabase para numerar o pedido."
        : "Não foi possível numerar o pedido: " + error.message);
      return;
    }
    linhas.forEach(x => { x.numeroPedido = numero; });

    const area = document.getElementById("reportPrintArea");
    document.body.classList.remove("imprimindo-doc"); // caso uma impressão anterior tenha sido interrompida
    document.body.classList.add("imprimindo-doc");
    area.innerHTML = svBuildPedidoHtml(svDadosPedidoDoc(linhas, cliente, numero));
    window.addEventListener("afterprint", svLimparImpressaoPedido, { once: true });
    window.print();
  } catch (err) {
    console.error("Erro ao gerar o pedido:", err);
    svLimparImpressaoPedido();
    toast("Não foi possível gerar o pedido em PDF: " + (err.message || err));
  } finally {
    svGerandoPedido = false;
    if (botao) botao.disabled = false;
  }
}

function initSemVendaTelas() {
  const statusHtml = SV_PREVISTO_STATUS.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
  document.getElementById("svPrevStatus").innerHTML = statusHtml;
  document.getElementById("svPrevArmazem").innerHTML = `<option value="">—</option>` +
    SV_ARMAZENS.map(a => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join("");
  document.getElementById("svProdCategoria").innerHTML = svOpcoesCategoria("—");
  document.getElementById("svProdFiltroCategoria").innerHTML = svOpcoesCategoria("Todas") + `<option value="__sem">Sem categoria</option>`;

  document.getElementById("svFormProduto").addEventListener("submit", svSalvarProduto);
  document.getElementById("svProdCancelEdit").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    svCancelarEdicaoProduto();
  });
  document.getElementById("svProdSearch").addEventListener("input", svRenderProdutos);
  ["svProdFiltroCategoria", "svProdFiltroMarca", "svProdFiltroCarcaca", "svProdFiltroSituacao"].forEach(id => {
    document.getElementById(id).addEventListener("change", svRenderProdutos); // select = "change" (ver seletor-padrao.js)
  });

  document.getElementById("svFormPrevisto").addEventListener("submit", svSalvarPrevisto);
  document.getElementById("svBtnNovoPrevisto").addEventListener("click", svNovoPrevisto);
  ["svPrevCancelar", "svPrevFechar"].forEach(id => document.getElementById(id).addEventListener("click", svCancelarEdicaoPrevisto));
  document.getElementById("svPrevOverlay").addEventListener("click", (e) => { if (e.target.id === "svPrevOverlay") svCancelarEdicaoPrevisto(); });
  document.getElementById("svBtnAddItemPrevisto").addEventListener("click", () => {
    document.getElementById("svPrevItens").appendChild(svCriarLinhaItem("svPrevItens"));
    updateItemRemoveVisibility("svPrevItens");
  });
  document.getElementById("svPrevSearch").addEventListener("input", svRenderPrevistos);
  svInitPrevDetalhe();
  svResetItens();

  document.getElementById("svBtnProdFoto").addEventListener("click", () => document.getElementById("svProdFotoInput").click());
  document.getElementById("svProdFotoInput").addEventListener("change", (e) => svEscolherFoto(e.target.files[0]));
  document.getElementById("svBtnProdRemoverFoto").addEventListener("click", svRemoverFoto);

  document.getElementById("svCatSearch").addEventListener("input", svRenderCatalogo);
  ["svCatFiltroArmazem", "svCatFiltroMarca"].forEach(id => {
    document.getElementById(id).addEventListener("change", svRenderCatalogo); // select = "change" (ver seletor-padrao.js)
  });

  svDashPeriodo.criar();
  svDashEscolher = sdCriarSeletorDashboards(document.getElementById("svDashEscolherMount"), {
    defs: SV_DASH_CARDS, chave: "torun_sv_dash_visibilidade_v1", aoMudar: svAplicarVisibilidadeDash
  });
  document.getElementById("svFormVendedor").addEventListener("submit", svAdicionarVendedor);
  document.getElementById("svFormRepresentante").addEventListener("submit", svAdicionarRepresentante);
  document.getElementById("svFormTransportadora").addEventListener("submit", svAdicionarTransportadora);
  svLigarReserva();
  if (document.getElementById("svEditResOverlay")) svLigarEdicaoReserva(); // se o HTML em cache for antigo, não derruba o sistema
  svLigarClientes();
  document.getElementById("svResData").value = todayISO();

  document.getElementById("svFormProposta").addEventListener("submit", svGerarProposta);
  ["svPropArmazem", "svPropCategoria"].forEach(id => {
    document.getElementById(id).addEventListener("change", svRenderTabelaProposta);
  });
  ["svPropCliente", "svPropValidade", "svPropCondicao"].forEach(id => {
    document.getElementById(id).addEventListener("input", svAtualizarCabecalhoProposta);
  });
  document.getElementById("svPropTbody").addEventListener("input", (e) => {
    const campoQtd = e.target.closest(".sv-prop-qtd");
    if (campoQtd) {
      const q = Math.floor(Number(campoQtd.value));
      svPropostaQtds[campoQtd.dataset.svqtd] = Number.isFinite(q) && q > 0 ? q : 0;
      return;
    }
    const campo = e.target.closest(".sv-prop-preco");
    if (!campo) return;
    const n = campo.value === "" ? null : Math.round(Number(campo.value) * 100) / 100;
    const codigo = campo.dataset.svpreco;
    svPropostaPrecos[codigo] = n !== null && n >= 0 ? n : null;
    // o preço é por produto: a mesma medida em outro armazém mostra o mesmo valor
    document.querySelectorAll("#svPropTbody .sv-prop-preco").forEach(outro => {
      if (outro !== campo && outro.dataset.svpreco === codigo) outro.value = campo.value;
    });
  });

  // preço negativo não vale: limpa o campo ao sair dele (a prévia e o PDF mostrariam coisas diferentes)
  document.getElementById("svPropTbody").addEventListener("change", (e) => {
    const campo = e.target.closest(".sv-prop-preco");
    if (campo && campo.value !== "" && Number(campo.value) < 0) {
      campo.value = "";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  // Os <select> viram o campo de busca padrão (seletor-padrao.js), que só avisa com "change": filtro de lista tem que ouvir "change"
  // (com "input" a lista só atualizava ao trocar de tela e voltar). Só a caixa de texto segue em "input".
  document.getElementById("svEstSearch")?.addEventListener("input", svRenderEstoque); // ?. : se o HTML em cache for antigo, não derruba o sistema
  ["svEstFiltro", "svEstFiltroArmazem", "svEstFiltroTipo", "svEstFiltroMarca"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", svRenderEstoque);
  });
  // "Reservas": abre a tela de Reserva já buscando pelo código do produto
  document.getElementById("svEstTbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-svest-res]");
    if (!btn) return;
    document.getElementById("svResSearch").value = btn.dataset.svestRes;
    setView("sv-reserva");
  });

  document.getElementById("svArmFiltro").addEventListener("change", (e) => {
    svArmSelecionado = e.target.value;
    svRenderArmazenagem();
  });
}

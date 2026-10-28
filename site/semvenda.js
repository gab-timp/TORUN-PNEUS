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

// sistemas que este usuário pode abrir (o varejo é de todos), na ordem dos cartões da tela de escolha
function sistemasDisponiveis() {
  const lista = ["varejo"];
  if (temAcessoSemVenda()) lista.push("semvenda");
  const crm = crmSistemasVisiveis();
  ["encomenda", "atacado"].forEach(s => { if (crm.includes(s)) lista.push(s); });
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
  document.getElementById("sistemaScreen").style.display = "none";
  document.getElementById("appShell").style.display = "flex";
  aplicarSistema(sistema);
}

// Quem só tem o varejo (sem Sem Venda, Atacado ou Encomenda) entra direto nele, como sempre foi.
function entrarNoSistema() {
  const shell = document.getElementById("appShell");
  const disponiveis = sistemasDisponiveis();
  if (disponiveis.length <= 1) {
    shell.style.display = "flex";
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
   statusBadgeClass, PREVISTO_STATUS, CATEGORIA_LABEL, CONFLITO_MSG). Sem log de histórico:
   o log do sistema é legível por quem não tem acesso ao Sem Venda. */

const SV_ARMAZENS = ["Nguedes", "RF", "ZR", "Multilog"];
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
    custo: r.custo_unitario === null || r.custo_unitario === undefined ? null : Number(r.custo_unitario),
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
    tipoTransporte: r.tipo_transporte || "", transportadora: r.transportadora || "",
    // preço e dia gravados no "Confirmar venda"; vazios nas vendas confirmadas antes dessa mudança
    precoUnitario: r.preco_unitario === null || r.preco_unitario === undefined ? null : Number(r.preco_unitario),
    vendidoEm: r.vendido_em || "",
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svReservaToRow(r) {
  return {
    id: r.id, codigo: r.codigo, quantidade: r.quantidade, cliente: r.cliente,
    vendedor_interno: r.vendedorInterno, representante: r.representante || null,
    armazem: r.previsaoId ? null : (r.armazem || ""), previsao_id: r.previsaoId || null,
    situacao: r.situacao, data: r.data, obs: r.obs || null, forma_pagamento: r.formaPagamento || null, unidade_negocio: r.unidadeNegocio || null,
    tipo_transporte: r.tipoTransporte || null, transportadora: r.transportadora || null
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
    custo_unitario: p.custo === null || p.custo === undefined ? null : p.custo,
    preco_proposta: p.preco === null || p.preco === undefined ? null : p.preco
  };
}

function svPrevistoFromRow(r) {
  return {
    id: r.id, numeroProcesso: r.numero_processo, itens: Array.isArray(r.itens) ? r.itens.filter(it => it && typeof it === "object") : [], dataChegada: r.data_chegada || "",
    status: r.status, armazem: r.armazem || "", obs: r.obs || "", dtc: !!r.dtc, createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svPrevistoToRow(p) {
  return {
    id: p.id, numero_processo: p.numeroProcesso, itens: p.itens || [], data_chegada: p.dataChegada || null,
    status: p.status, armazem: p.armazem || null, obs: p.obs || null, dtc: !!p.dtc
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
    const [prod, prev, res] = await Promise.all([
      sb.from("sv_produtos").select("*").order("codigo"),
      sb.from("sv_previsoes").select("*").order("created_at", { ascending: false }),
      sb.from("sv_reservas").select("*").order("created_at", { ascending: false })
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
  if (!["sv-produtos", "sv-previsto", "sv-catalogo", "sv-reserva", "sv-dashboard", "sv-armazenagem", "sv-relatoriopreco", "sv-clientes"].includes(view)) return;
  if (!(await svCarregarDados())) return;
  // o cadastro de clientes tem carga própria (tabela sv_clientes): só as telas que o usam dependem dele
  if (["sv-clientes", "sv-reserva", "sv-relatoriopreco"].includes(view) && !(await svCarregarClientes(view === "sv-clientes"))) return;
  // as listas de vendedores e de condições de pagamento têm carga própria: se a tabela não existir, só a Reserva reclama
  if (view === "sv-reserva") await Promise.all([svCarregarVendedores(), svCarregarTransportadoras()]);
  if (view === "sv-produtos") svRenderProdutos();
  else if (view === "sv-previsto") svRenderPrevistos();
  else if (view === "sv-catalogo") svRenderCatalogo();
  else if (view === "sv-dashboard") svRenderDashboard();
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
      <td class="sv-num">${p.custo === null ? '<span class="muted">—</span>' : escapeHtml(formatMoney(p.custo))}</td>
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
  document.getElementById("svProdCusto").value = p.custo === null ? "" : p.custo;
  document.getElementById("svProdPreco").value = p.preco === null ? "" : p.preco;
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
    custo: svLerValor("svProdCusto"),
    preco: svLerValor("svProdPreco")
  };
  if (!dados.codigo || !dados.medida) { toast("Informe o código e a medida."); return; }
  if (Number.isNaN(dados.custo) || Number.isNaN(dados.preco)) { toast("Custo e preço precisam ser valores de zero em diante."); return; }

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
  return svState.produtos.slice()
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

// Monta as colunas uma vez só (no 1º render). A lista vem de PREVISTO_STATUS e as cores de PREVISTO_COR
// (os dois definidos no app.js, compartilhados com o Estoque Previsto do Torun).
function svMontarKanbanPrevisto() {
  const board = document.getElementById("svPrevBoard");
  board.innerHTML = PREVISTO_STATUS.map((status, i) => {
    const cor = PREVISTO_COR[status] || { accent: "#78716C", deep: "#44403C", pale: "#EFECEA" };
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
    const card = e.target.closest(".kanban-card");
    if (card) svAbrirPrevistoDetalhe(card.dataset.id);
  });
  initKanbanBoardDragScroll("svPrevBoard");

  svPrevSortables = PREVISTO_STATUS.map((_, i) => Sortable.create(document.getElementById("svPrevCol" + i), {
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
  const ok = await confirmModal("Mudar status do processo?",
    `Tem certeza que deseja mudar o processo ${alvo.numeroProcesso} para "${novoStatus}"?`);
  if (ok) await svAtualizarCampoPrevisto(id, { status: novoStatus }, "Status atualizado.");
  svRenderPrevistos(); // se foi barrado ou cancelado, o card volta pra coluna de antes
}

function svPrevTextoArmazem(p) {
  return p.armazem ? svNomeArmazem(p.armazem) : "";
}

function svRenderPrevistos() {
  svAtualizarSelectsProduto();
  if (!document.getElementById("svPrevCol0")) svMontarKanbanPrevisto();
  const search = (document.getElementById("svPrevSearch").value || "").trim().toLowerCase();

  let rows = svState.previsoes.slice();
  if (search) {
    rows = rows.filter(p => {
      const itens = p.itens.map(it => { const prod = svGetProduto(it.codigo); return it.codigo + " " + (prod ? prod.medida : ""); }).join(" ");
      return (p.numeroProcesso + " " + itens).toLowerCase().includes(search);
    });
  }
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  document.getElementById("svPrevEmpty").style.display = svState.previsoes.length === 0 ? "block" : "none";

  PREVISTO_STATUS.forEach((status, i) => {
    const doStatus = rows.filter(p => p.status === status);
    document.getElementById("svPrevCount" + i).textContent = doStatus.length;
    document.getElementById("svPrevCol" + i).innerHTML = doStatus.map(p => {
      const itensHtml = p.itens.map(it => {
        const prod = svGetProduto(it.codigo);
        return `
          <li>
            <span class="mono">${escapeHtml(it.codigo)}</span>
            <span class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span>
            <span class="num mono">${fmt(it.quantidade)}</span>
          </li>`;
      }).join("");
      return `
        <div class="kanban-card" data-id="${escapeAttr(p.id)}">
          <div class="kanban-card-nf">${escapeHtml(p.numeroProcesso)}</div>
          ${p.itens.length ? `<ul class="kanban-card-itens-list">${itensHtml}</ul>` : ""}
          <div class="kanban-card-meta">
            ${p.armazem
              ? `<span class="kanban-card-tag containers" title="Armazém onde o processo vai entrar">${escapeHtml(svPrevTextoArmazem(p))}</span>`
              : `<span class="kanban-card-tag sem-data">Sem armazém</span>`}
            ${p.dataChegada
              ? `<span class="kanban-card-tag ${status === "FINALIZADO" ? "entregue" : ""}">Chegada ${formatDateBR(p.dataChegada)}</span>`
              : `<span class="kanban-card-tag sem-data">Sem data de chegada</span>`}
            ${p.dtc ? `<span class="kanban-card-tag dtc" title="Processo com DTC">DTC</span>` : ""}
          </div>
          ${p.obs ? `<div class="kanban-card-obs">${escapeHtml(p.obs)}</div>` : ""}
        </div>`;
    }).join("");
  });

  // permissão pode mudar depois do 1º render (o perfil carrega junto com os dados)
  svPrevSortables.forEach(s => s.option("disabled", !svPodeEditarPrevisto()));
}

/* ---------- janela do card (clique) ---------- */

let svPrevDetalheId = null;

function svAbrirPrevistoDetalhe(id) {
  const p = svState.previsoes.find(x => x.id === id);
  if (!p) return;
  svPrevDetalheId = id;

  const cor = PREVISTO_COR[p.status];
  document.querySelector("#svPrevDetalheOverlay .modal").style.setProperty("--col-accent", cor ? cor.accent : "var(--orange)");
  document.getElementById("svPrevDetalheTitulo").textContent = p.numeroProcesso;
  const badge = document.getElementById("svPrevDetalheStatus");
  badge.className = "prev-status-badge " + statusBadgeClass(p.status);
  badge.textContent = p.status;
  svAtualizarDtcDaJanela(p);

  const ativas = svState.reservas.filter(r => r.previsaoId === p.id && r.situacao !== "CANCELADA");
  const qtdReservada = ativas.reduce((a, r) => a + (Number(r.quantidade) || 0), 0);
  const valor = (html, vazio) => `<div class="prev-detalhe-valor${vazio ? " vazio" : ""}">${html}</div>`;
  document.getElementById("svPrevDetalheInfo").innerHTML = `
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Armazém</span>${
      p.armazem ? valor(escapeHtml(svPrevTextoArmazem(p))) : valor("Sem armazém", true)}</div>
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Data de chegada</span>${
      p.dataChegada ? valor(`<span class="mono">${formatDateBR(p.dataChegada)}</span>`) : valor("Sem data de chegada", true)}</div>
    <div class="prev-detalhe-cel"><span class="prev-detalhe-lbl">Reservas ligadas</span>${
      ativas.length ? valor(`<span class="mono">${fmt(qtdReservada)}</span> un. em ${ativas.length} reserva${ativas.length > 1 ? "s" : ""}`) : valor("Nenhuma", true)}</div>`;

  const total = p.itens.reduce((a, it) => a + (Number(it.quantidade) || 0), 0);
  document.getElementById("svPrevDetalheMedidas").innerHTML = p.itens.length ? `
    <table class="prev-detalhe-tabela">
      <thead><tr><th style="width:20%;">Código</th><th>Medida</th><th class="num" style="width:14%;">Qtd.</th></tr></thead>
      <tbody>
        ${p.itens.map(it => { const prod = svGetProduto(it.codigo); return `
          <tr><td class="mono">${escapeHtml(it.codigo)}</td><td class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</td><td class="num mono">${fmt(it.quantidade)}</td></tr>`; }).join("")}
        <tr class="total"><td colspan="2">Total do processo</td><td class="num mono">${fmt(total)}</td></tr>
      </tbody>
    </table>` : `<div class="prev-detalhe-obs">Nenhuma medida cadastrada.</div>`;

  document.getElementById("svPrevDetalheObs").textContent = p.obs || "Sem observação.";

  const pode = svPodeEditarPrevisto();
  document.getElementById("svPrevDetalheEditar").style.display = pode ? "" : "none";
  document.getElementById("svPrevDetalheExcluir").style.display = pode ? "" : "none";
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
  if (!svState.previsoes.some(x => x.id === id)) return;
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
  });
  updateItemRemoveVisibility("svPrevItens");

  document.getElementById("svPrevFormTitle").textContent = "Editar processo previsto";
  document.getElementById("svPrevEditBanner").style.display = "block";
  document.getElementById("svBtnSubmitPrevisto").textContent = "Salvar alterações";
  const form = document.getElementById("svFormPrevisto");
  form.closest(".card-collapsible")?.classList.remove("collapsed");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function svCancelarEdicaoPrevisto() {
  svEditandoPrevistoId = null;
  svEditandoPrevistoUpdatedAt = null;
  document.getElementById("svFormPrevisto").reset();
  document.getElementById("svPrevStatus").value = PREVISTO_STATUS[0];
  svResetItens();
  document.getElementById("svPrevFormTitle").textContent = "Novo processo previsto";
  document.getElementById("svPrevEditBanner").style.display = "none";
  document.getElementById("svBtnSubmitPrevisto").textContent = "Adicionar processo";
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

  const itens = [];
  for (const row of document.querySelectorAll("#svPrevItens .item-row")) {
    const codigo = row.querySelector(".item-produto").value;
    const quantidadeRaw = row.querySelector(".item-qtd").value;
    if (!codigo && !quantidadeRaw) continue;
    if (!codigo || !quantidadeRaw || parseInt(quantidadeRaw, 10) <= 0) { toast("Preencha produto e quantidade em todas as medidas adicionadas."); return; }
    itens.push({ codigo, quantidade: parseInt(quantidadeRaw, 10) });
  }
  const dados = { numeroProcesso, itens, dataChegada, status, armazem, obs, dtc };

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
  e.target.reset();
  document.getElementById("svPrevStatus").value = PREVISTO_STATUS[0];
  svResetItens();
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
      if (p.status === "FINALIZADO") {
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
    if (r.previsaoId && (!prev || prev.status !== "FINALIZADO")) {
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
  if (novo && novo.status !== "FINALIZADO") {
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
  { chave: "canceladas", rotulo: "Canceladas" },
  { chave: "todas", rotulo: "Todas" }
];
const SV_CAMPOS_RES = ["produto", "cliente", "unidade", "vendedor", "representante", "forma", "quantidade", "data", "tipotransp", "transportadora"];
// de qual unidade é a venda (check em sv_reservas.unidade_negocio); só informação, não limita quem vê a reserva
const SV_UNIDADES = { ATACADO: "Atacado", ENCOMENDA: "Encomenda" };
let svResUnidadeAtual = ""; // filtro da lista: "" = todas
// as mesmas formas de pagamento do Varejo (check em sv_reservas.forma_pagamento)
const SV_FORMAS_PAGAMENTO = ["PIX", "CARTÃO", "BOLETO PRÓPRIO", "BOLETO TRADEMASTER"];
// quem cuida do frete: o valor vai pro banco (check em sv_reservas), o texto aparece na tela
const SV_TIPOS_TRANSPORTE = { NOSSO: "Frete nosso", CLIENTE: "Frete do cliente" };
let svPickerAberto = false;
let svSalvandoReserva = false;

function svFiltrarPorSituacao(rows, chave) {
  if (chave === "ativas_vendidas") return rows.filter(r => r.situacao !== "CANCELADA");
  if (chave === "ativas") return rows.filter(r => r.situacao === "ATIVA");
  if (chave === "canceladas") return rows.filter(r => r.situacao === "CANCELADA");
  return rows;
}

function svSituacaoReserva(r) {
  if (r.situacao === "CANCELADA") return { chave: "CANCELADA", rotulo: "Cancelada", pill: "pill-neutro" };
  if (r.situacao === "VENDIDA") return { chave: "VENDIDA", rotulo: "Vendido", pill: "pill-normal" };
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (prev && prev.status !== "FINALIZADO") return { chave: "AGUARDANDO", rotulo: "Aguardando chegada", pill: "pill-azul" };
  return { chave: "RESERVADO", rotulo: "Reservado", pill: "pill-baixo" };
}

function svOrigemReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (!prev) return r.previsaoId ? "processo removido" : svNomeArmazem(r.armazem);
  if (prev.status === "FINALIZADO") return `Processo ${prev.numeroProcesso} · ${svNomeArmazem(prev.armazem)}`;
  return `A caminho · processo ${prev.numeroProcesso}`;
}

// "chega 08/11" ou "sem data prevista" (só enquanto a reserva espera o processo)
function svChegadaReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (!prev || prev.status === "FINALIZADO") return "";
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

function svOpcaoSelecionada() {
  const v = document.getElementById("svResProduto").value;
  return v === "" ? null : (svOpcoesReserva[Number(v)] || null);
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
}

function svFocarPrimeiroErro() {
  const chave = SV_CAMPOS_RES.find(k => document.getElementById(`svResCampo_${k}`).classList.contains("sv-campo-erro"));
  if (!chave) return;
  const alvo = document.getElementById(`svResCampo_${chave}`).querySelector("button:not(:disabled), input:not([hidden]), select:not(:disabled)");
  if (alvo) alvo.focus();
}

/* ----- escolha do produto (lista com busca, em grupos) ----- */

function svRenderPickerBotao() {
  const o = svOpcaoSelecionada();
  const btn = document.getElementById("svResProdutoBtn");
  btn.disabled = svOpcoesReserva.length === 0;
  btn.classList.toggle("sv-picker-preenchido", !!o);
  btn.innerHTML = o
    ? `<span class="sv-picker-lado"><span class="sv-picker-t"><b class="mono">${escapeHtml(o.codigo)}</b> ${escapeHtml(o.medida)}</span><span class="sv-picker-s">${escapeHtml(o.origem)}</span></span>
       <span class="sv-picker-chip">Disponível pra reservar: ${fmt(o.disp)} un.</span><span class="sv-picker-trocar">Trocar</span>`
    : `<span class="sv-picker-ph">${svOpcoesReserva.length === 0 ? "Nada disponível" : "Escolha o produto…"}</span><span class="sv-picker-chev" aria-hidden="true">▾</span>`;
}

function svRenderPickerOpcoes() {
  const termo = (document.getElementById("svResProdutoBusca").value || "").trim().toLowerCase();
  const sel = svOpcaoSelecionada();
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
  document.getElementById("svResProdutoOpcoes").innerHTML = grupo("Em estoque", "E") + grupo("A caminho (Estoque Previsto)", "P") ||
    `<div class="sv-picker-vazio">${svOpcoesReserva.length ? "Nenhum produto com essa busca." : "Nada disponível."}</div>`;
}

function svAbrirPicker() {
  if (svOpcoesReserva.length === 0) return;
  svPickerAberto = true;
  document.getElementById("svResProdutoPainel").hidden = false;
  document.getElementById("svResProdutoBtn").setAttribute("aria-expanded", "true");
  const busca = document.getElementById("svResProdutoBusca");
  busca.value = "";
  svRenderPickerOpcoes();
  busca.focus();
}

function svFecharPicker(devolverFoco) {
  svPickerAberto = false;
  document.getElementById("svResProdutoPainel").hidden = true;
  const btn = document.getElementById("svResProdutoBtn");
  btn.setAttribute("aria-expanded", "false");
  if (devolverFoco) btn.focus();
}

function svEscolherOpcao(i) {
  document.getElementById("svResProduto").value = String(i);
  svFecharPicker();
  svLimparErroCampo("produto");
  svAtualizarNotaDisponivel();
  document.getElementById("svResCliente").focus();
}

function svAtualizarNotaDisponivel() {
  const o = svOpcaoSelecionada();
  const aviso = document.getElementById("svResDisp");
  const nada = svOpcoesReserva.length === 0;
  aviso.textContent = nada ? "Nada disponível: marque um processo como FINALIZADO (com armazém) ou cadastre um processo a caminho no Estoque Previsto." : "";
  aviso.style.display = nada ? "" : "none";
  document.getElementById("svResQuantidade").max = o ? String(o.disp) : "";
  document.getElementById("svResQuantMax").textContent = o ? `máx. ${fmt(o.disp)}` : "";
  svRenderPickerBotao();
  svAtualizarResumoReserva();
}

// rodapé da janela: resumo do que vai ser reservado e rótulo do botão ("Reservar 30 un.")
function svAtualizarResumoReserva() {
  const o = svOpcaoSelecionada();
  const q = parseInt(document.getElementById("svResQuantidade").value, 10);
  const cliente = document.getElementById("svResCliente").value.trim();
  const resumo = document.getElementById("svResResumo");
  if (!o) resumo.textContent = "Escolha o produto para continuar.";
  else if (q > 0) resumo.innerHTML = `${fmt(q)} un. de <span class="mono">${escapeHtml(o.codigo)}</span>${cliente ? " para " + escapeHtml(cliente) : ""}`;
  else resumo.textContent = "";
  const botao = document.getElementById("svBtnSubmitReserva");
  botao.textContent = o && q > 0 ? `Reservar ${fmt(q)} un.` : "Reservar";
  botao.disabled = !o || svSalvandoReserva;
}

function svRenderReservaForm() {
  const sel = document.getElementById("svResProduto");
  const anterior = svOpcaoSelecionada();
  const chaveAnterior = anterior ? svChaveOpcao(anterior) : null;
  svOpcoesReserva = svMontarOpcoesReserva();
  sel.innerHTML = `<option value="">Selecione…</option>` + svOpcoesReserva.map((o, i) => `<option value="${i}">${escapeHtml(o.rotulo)}</option>`).join("");
  if (chaveAnterior) {
    const i = svOpcoesReserva.findIndex(o => svChaveOpcao(o) === chaveAnterior);
    if (i >= 0) sel.value = String(i);
  }
  svAtualizarNotaDisponivel();
  if (svPickerAberto) svRenderPickerOpcoes();

  document.getElementById("svListaClientes").innerHTML =
    svClientes.map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");

  // Vendedor interno (lista cadastrada em Administração), Representante (ativos, ou "Sem representante") e
  // Forma de pagamento (fixa, a do Varejo). Todos começam em "Selecione…": nenhum vem preenchido sozinho.
  const selVendedor = document.getElementById("svResVendedor");
  const vendedorAnterior = selVendedor.value;
  selVendedor.innerHTML = `<option value="">${svVendedores.length ? "Selecione…" : "Nenhum vendedor cadastrado"}</option>` +
    svVendedores.map(v => `<option value="${escapeAttr(v.nome)}">${escapeHtml(v.nome)}</option>`).join("");
  if (svVendedores.some(v => v.nome === vendedorAnterior)) selVendedor.value = vendedorAnterior;
  selVendedor.disabled = svVendedores.length === 0;
  document.getElementById("svResVendedorAviso").style.display = svVendedores.length === 0 ? "" : "none";

  const selRep = document.getElementById("svResRepresentante");
  const repAnterior = selRep.value;
  const representantes = [...new Set(state.representantes || [])].sort((a, b) => a.localeCompare(b));
  selRep.innerHTML = `<option value="">Selecione…</option><option value="${SV_SEM_REPRESENTANTE}">Sem representante</option>` +
    representantes.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
  if ([...selRep.options].some(o => o.value === repAnterior)) selRep.value = repAnterior;

  const selForma = document.getElementById("svResForma");
  const formaAnterior = selForma.value;
  selForma.innerHTML = svOpcoesForma("");
  selForma.value = formaAnterior; // mantém a escolha quando a lista é refeita (por valor, não por "selected": o reset da janela não pode trazê-la de volta)
  const selUnidade = document.getElementById("svResUnidade");
  const unidadeAnterior = selUnidade.value;
  selUnidade.innerHTML = `<option value="">Selecione…</option>` +
    Object.entries(SV_UNIDADES).map(([valor, rotulo]) => `<option value="${valor}">${escapeHtml(rotulo)}</option>`).join("");
  selUnidade.value = unidadeAnterior;

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
}

function svAbrirNovaReserva() {
  document.getElementById("svFormReserva").reset();
  document.getElementById("svResData").value = todayISO();
  svLimparErrosReserva();
  svFecharPicker();
  svRenderReservaForm();
  document.getElementById("svResOverlay").classList.add("show");
  const primeiro = document.getElementById("svResProdutoBtn");
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
  if (e.target.id === "svResCliente") svPreencherUnidadeDoCliente();
  if (e.target.id === "svResQuantidade" || e.target.id === "svResCliente") svAtualizarResumoReserva();
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
  document.getElementById("svResChipsUnidade").innerHTML = Object.entries(SV_UNIDADES).map(([valor, rotulo]) => {
    const ligado = valor === svResUnidadeAtual;
    return `<button type="button" class="sv-chip sv-chip-un${ligado ? " on" : ""}" data-svunidade="${valor}" aria-pressed="${ligado}">${escapeHtml(rotulo)} <b>${fmt(svState.reservas.filter(r => r.unidadeNegocio === valor).length)}</b></button>`;
  }).join("");
}

function svRenderReservaTabela() {
  svRenderReservaChips();
  const busca = (document.getElementById("svResSearch").value || "").trim().toLowerCase();
  let rows = svFiltrarPorSituacao(svState.reservas.slice(), svResFiltroAtual);
  if (svResUnidadeAtual) rows = rows.filter(r => r.unidadeNegocio === svResUnidadeAtual);
  if (busca) {
    rows = rows.filter(r => {
      const p = svGetProduto(r.codigo);
      return [r.cliente, r.vendedorInterno, r.representante || "", r.codigo, p ? p.medida : "", r.formaPagamento, r.condicaoPagamento, r.transportadora, SV_UNIDADES[r.unidadeNegocio] || "", r.obs].join(" ").toLowerCase().includes(busca);
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
  tbody.innerHTML = rows.map(r => {
    const p = svGetProduto(r.codigo);
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
    const acoes = r.situacao === "ATIVA"
      ? `<button type="button" class="btn small outline sv-vender sv-write" data-svresvender="${escapeAttr(r.id)}">Confirmar venda</button>
         <button type="button" class="sv-link sv-cancelar sv-write" data-svrescancelar="${escapeAttr(r.id)}">Cancelar</button>`
      : `<span class="muted">—</span>`;
    return `
      <tr>
        <td><span class="mono">${escapeHtml(r.codigo)}</span><div class="muted sv-sub">${escapeHtml(p ? p.medida : "(produto removido)")}</div><div class="muted sv-sub">${escapeHtml(svOrigemReserva(r))}</div></td>
        <td>${escapeHtml(r.cliente)}${r.obs ? `<div class="sv-obs">${escapeHtml(r.obs)}</div>` : ""}</td>
        <td>${escapeHtml(r.vendedorInterno)}</td>
        <td>${r.representante ? escapeHtml(r.representante) : '<span class="sv-sem-rep">Sem representante</span>'}</td>
        <td>${svFormaCelula(r)}</td>
        <td>${r.tipoTransporte ? `<span class="sv-tt ${r.tipoTransporte === "NOSSO" ? "nosso" : "cli"}">${escapeHtml(SV_TIPOS_TRANSPORTE[r.tipoTransporte] || r.tipoTransporte)}</span>${r.transportadora ? `<div class="sv-transp">${escapeHtml(r.transportadora)}</div>` : ""}` : '<span class="muted">—</span><div class="muted sv-sub">reserva antiga</div>'}</td>
        <td>${r.unidadeNegocio ? `<span class="sv-un ${r.unidadeNegocio === "ATACADO" ? "atacado" : "encomenda"}">${escapeHtml(SV_UNIDADES[r.unidadeNegocio] || r.unidadeNegocio)}</span>` : '<span class="muted">—</span><div class="muted sv-sub">reserva antiga</div>'}</td>
        <td class="mono">${fmt(r.quantidade)}</td>
        <td><span class="status-pill ${sit.pill}">${escapeHtml(sit.rotulo)}</span>${sitExtra}</td>
        <td><span class="mono">${r.data ? formatDateBR(r.data) : "—"}</span>${dataExtra ? `<div class="muted sv-sub">${escapeHtml(dataExtra)}</div>` : ""}</td>
        <td class="sv-acoes">${acoes}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-svresvender]").forEach(btn => {
    btn.addEventListener("click", () => svMudarSituacaoReserva(btn.dataset.svresvender, "VENDIDA"));
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
function svVendaModal(r) {
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
    $("svVendaTexto").textContent = `Marcar as ${r.quantidade} un. de ${r.codigo} reservadas para ${r.cliente} como vendidas?`;
    $("svVendaDica").textContent = temPreco
      ? "Já vem com o preço de proposta do cadastro. Mude se vendeu por outro valor."
      : "Esse produto não tem preço de proposta no cadastro: digite o preço da venda.";
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
    $("svVendaTranspDica").textContent = r.tipoTransporte && r.transportadora
      ? "O transporte veio da reserva. Mude se combinaram outra coisa na hora de vender."
      : "Essa reserva é de antes do campo existir e veio sem transporte. Escolha para confirmar a venda.";

    // vazio ou ilegível = NaN (o campo numérico devolve "" quando o texto digitado não é um número)
    const lerPreco = () => (input.value.trim() === "" ? NaN : Math.round(Number(input.value) * 100) / 100);
    const totalVenda = () => { const p = lerPreco(); return p >= 0 ? Math.round(p * r.quantidade * 100) / 100 : 0; };
    const atualizarTotal = () => {
      const p = lerPreco();
      const valido = p >= 0;
      totalEl.textContent = valido ? formatMoney(totalVenda()) : "—";
      contaEl.textContent = valido ? `${fmt(r.quantidade)} un. × ${formatMoney(p)}` : "";
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
    const atualizarTudo = () => { atualizarTotal(); atualizarTrademaster(); atualizarDivisao(); };
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
      selForma.removeEventListener("change", onInput);
      recebido.removeEventListener("input", onInput);
      chkDividir.removeEventListener("change", onDividir);
      btnAddDiv.removeEventListener("click", onAddDivisao);
      listaDiv.removeEventListener("input", onInput);
      listaDiv.removeEventListener("change", onInput);
      listaDiv.removeEventListener("click", onListaClick);
      selTipo.removeEventListener("change", onInput);
      selTransp.removeEventListener("change", onInput);
      resolve(resultado);
    };
    const falha = (msg) => { erro.textContent = msg; erro.style.display = "block"; };
    const onOk = () => {
      const p = lerPreco();
      if (Number.isNaN(p)) return falha("Informe o preço por unidade.");
      if (p < 0) return falha("O preço não pode ser negativo.");
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
      if (!selTransp.value) {
        return falha(nomesT.length
          ? "Escolha a transportadora para confirmar a venda."
          : "Cadastre as transportadoras em Administração, Transportadoras, antes de confirmar a venda.");
      }
      cleanup({
        preco: p, forma: selForma.value, valorRecebido: ehTm ? Math.round(parseFloat(recebido.value) * 100) / 100 : null,
        divisao, tipo: selTipo.value, transportadora: selTransp.value
      });
    };
    const onCancel = () => cleanup(null);
    const onTecla = (e) => { if (e.key === "Enter") { e.preventDefault(); onOk(); } };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onTecla);
    selForma.addEventListener("change", onInput);
    recebido.addEventListener("input", onInput);
    chkDividir.addEventListener("change", onDividir);
    btnAddDiv.addEventListener("click", onAddDivisao);
    listaDiv.addEventListener("input", onInput);
    listaDiv.addEventListener("change", onInput);
    listaDiv.addEventListener("click", onListaClick);
    selTipo.addEventListener("change", onInput);
    selTransp.addEventListener("change", onInput);
    atualizarTudo();
    overlay.classList.add("show");
    input.focus();
    input.select();
  });
}

async function svMudarSituacaoReserva(id, nova) {
  const r = svState.reservas.find(x => x.id === id);
  if (!r) return;
  let campos = { situacao: nova };
  if (nova === "VENDIDA") {
    // a venda grava o preço por unidade, a condição de pagamento e o dia: é daí que o Dashboard tira o "Valor vendido" e o mês
    const venda = await svVendaModal(r);
    if (venda === null) return;
    campos = {
      situacao: nova, preco_unitario: venda.preco, forma_pagamento: venda.forma,
      valor_recebido: venda.valorRecebido, divisao_pagamento: venda.divisao,
      tipo_transporte: venda.tipo, transportadora: venda.transportadora, vendido_em: todayISO()
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
  $("svResProduto").addEventListener("change", svAtualizarNotaDisponivel);
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
  $("svResNovoCliente").addEventListener("click", () => svAbrirClienteModal(null, true));
  $("svResFechar").addEventListener("click", svFecharNovaReserva);
  $("svResCancelar").addEventListener("click", svFecharNovaReserva);
  $("svResOverlay").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (svPickerAberto) svFecharPicker(true); else svFecharNovaReserva();
  });
  $("svResProdutoBtn").addEventListener("click", () => { if (svPickerAberto) svFecharPicker(true); else svAbrirPicker(); });
  $("svResProdutoBusca").addEventListener("input", svRenderPickerOpcoes);
  $("svResProdutoBusca").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter na busca escolhe o primeiro resultado, não envia o formulário
    const primeira = $("svResProdutoOpcoes").querySelector("[data-svopcao]");
    if (primeira) svEscolherOpcao(Number(primeira.dataset.svopcao));
  });
  $("svResProdutoOpcoes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-svopcao]");
    if (b) svEscolherOpcao(Number(b.dataset.svopcao));
  });
  document.addEventListener("click", (e) => {
    if (svPickerAberto && !e.target.closest("#svPicker")) svFecharPicker();
  });
  $("svFormReserva").addEventListener("input", svAoMudarFormReserva);
  $("svFormReserva").addEventListener("change", svAoMudarFormReserva);
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
  const opcao = svOpcaoSelecionada();
  const clienteDigitado = document.getElementById("svResCliente").value.trim();
  const vendedorInterno = document.getElementById("svResVendedor").value;
  const escolhaRepresentante = document.getElementById("svResRepresentante").value;
  const forma = document.getElementById("svResForma").value;
  const unidade = document.getElementById("svResUnidade").value;
  const tipoTransporte = document.getElementById("svResTipoTransporte").value;
  const transportadora = document.getElementById("svResTransportadora").value;
  const quantidade = parseInt(document.getElementById("svResQuantidade").value, 10);
  const data = document.getElementById("svResData").value;
  const obs = document.getElementById("svResObs").value.trim();
  const cliente = svClientes.find(c => c.nome.toLowerCase() === clienteDigitado.toLowerCase());

  // confere tudo de uma vez e marca cada campo com problema (em vez de avisar um por vez)
  const erros = [];
  if (!opcao) erros.push(["produto", "Escolha o produto."]);
  if (!clienteDigitado) erros.push(["cliente", "Escolha um cliente da lista. Se ele ainda não existe, cadastre em Clientes."]);
  else if (!cliente) erros.push(["cliente", "Cliente não encontrado no cadastro do Sem Venda. Use \"Cadastrar cliente\" antes de reservar."]);
  if (!vendedorInterno) erros.push(["vendedor", svVendedores.length ? "Escolha o vendedor interno." : "Cadastre os vendedores em Administração antes de reservar."]);
  if (!escolhaRepresentante) erros.push(["representante", 'Escolha o representante ou marque "Sem representante".']);
  if (!unidade) erros.push(["unidade", "Escolha a unidade de negócio."]);
  if (!forma) erros.push(["forma", "Escolha a forma de pagamento."]);
  if (!tipoTransporte) erros.push(["tipotransp", "Escolha o tipo de transporte."]);
  if (!transportadora) erros.push(["transportadora", svTransportadoras.length ? "Escolha a transportadora." : "Cadastre as transportadoras em Administração antes de reservar."]);
  if (!(quantidade > 0)) erros.push(["quantidade", "Informe a quantidade."]);
  else if (opcao && quantidade > opcao.disp) erros.push(["quantidade", `Só há ${fmt(opcao.disp)} un. disponíveis neste produto.`]);
  if (!data) erros.push(["data", "Informe a data."]);
  if (erros.length) {
    erros.forEach(([campo, msg]) => svErroCampo(campo, msg));
    svFocarPrimeiroErro();
    return;
  }
  const representante = escolhaRepresentante === SV_SEM_REPRESENTANTE ? null : escolhaRepresentante;

  // confere o saldo com dados atualizados: outra pessoa pode ter reservado o mesmo lote agora há pouco
  if (!(await svCarregarDados(true))) return;
  const { linhas, aChegar } = svCalcularEstoque();
  let disponivel = 0;
  if (opcao.tipo === "E") {
    const l = linhas.find(x => x.codigo === opcao.codigo && x.armazem === opcao.armazem);
    disponivel = l ? l.disp : 0;
  } else {
    const prev = svState.previsoes.find(x => x.id === opcao.previsaoId);
    if (!prev || prev.status === "FINALIZADO") {
      svRenderReserva();
      svErroCampo("produto", "Esse processo já chegou. As opções foram atualizadas — escolha o produto em estoque.");
      svFocarPrimeiroErro();
      return;
    }
    const a = aChegar.find(x => x.previsaoId === opcao.previsaoId && x.codigo === opcao.codigo);
    disponivel = a ? a.livres : 0;
  }
  if (quantidade > disponivel) {
    svRenderReserva();
    svErroCampo("quantidade", `Só há ${fmt(disponivel)} un. disponíveis nessa opção.`);
    svFocarPrimeiroErro();
    return;
  }

  const nova = {
    id: uid("svres"), codigo: opcao.codigo, quantidade, cliente: cliente.nome, vendedorInterno, representante,
    armazem: opcao.tipo === "E" ? opcao.armazem : null,
    previsaoId: opcao.tipo === "P" ? opcao.previsaoId : null,
    formaPagamento: forma, unidadeNegocio: unidade, tipoTransporte, transportadora,
    situacao: "ATIVA", data, obs
  };
  const { data: inserida, error } = await sb.from("sv_reservas").insert({ ...svReservaToRow(nova), created_by: currentUser ? currentUser.id : null }).select();
  if (error) { toast("Erro ao reservar: " + error.message); return; }
  if (!inserida || inserida.length === 0) { toast("Não foi possível reservar (sem permissão)."); return; }
  svState.reservas.unshift(svReservaFromRow(inserida[0]));
  svFecharNovaReserva();
  svRenderReserva();
  toast("Reserva criada.");
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
// valor = quantidade × custo do produto (null quando o produto não tem custo cadastrado);
// dias = tempo desde a chegada mais antiga daquele produto naquele armazém.
function svEstoqueFisico() {
  return svCalcularEstoque().linhas
    .map(l => ({ ...l, qtd: l.chegou - l.vendido, produto: svGetProduto(l.codigo) }))
    .filter(l => l.qtd > 0)
    .map(l => ({
      ...l,
      dias: svDiasDesde(l.desde),
      valor: l.produto && l.produto.custo !== null ? l.qtd * l.produto.custo : null
    }));
}

// armazéns na ordem fixa do cadastro, depois os que aparecem só nos dados, e "sem armazém" por último
function svArmazensDoEstoque(est) {
  const extras = [...new Set(est.map(l => l.armazem))].filter(a => a && !SV_ARMAZENS.includes(a)).sort();
  return [...SV_ARMAZENS, ...extras, ...(est.some(l => !l.armazem) ? [""] : [])];
}

function svResumoValor(est) {
  const comCusto = est.filter(l => l.valor !== null);
  return {
    total: comCusto.reduce((s, l) => s + l.valor, 0),
    temCusto: comCusto.length > 0,
    semCusto: new Set(est.filter(l => l.valor === null).map(l => l.codigo)).size
  };
}

function svNotaSemCusto(resumo) {
  if (resumo.semCusto === 0) return "";
  return resumo.temCusto
    ? `${resumo.semCusto} código(s) sem custo cadastrado`
    : "Cadastre o custo nos Produtos";
}

/* ---------- Dashboard ---------- */

function svRenderDashboard() {
  const est = svEstoqueFisico();
  const total = est.reduce((s, l) => s + l.qtd, 0);
  const valor = svResumoValor(est);
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

const SV_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// "" = ainda não escolheu (abre no mês atual); "__tudo" = soma desde o início; senão "AAAA-MM"
let svDashMes = "";

function svNomeMes(chave) {
  const [ano, mes] = chave.split("-");
  return `${SV_MESES[Number(mes) - 1]} de ${ano}`;
}

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
  if (svDashMes !== "__tudo" && !meses.includes(svDashMes)) svDashMes = atual;
  const sel = document.getElementById("svDashMes");
  sel.innerHTML = `<option value="__tudo">Tudo</option>` + meses.map(m => `<option value="${m}">${escapeHtml(svNomeMes(m))}</option>`).join("");
  sel.value = svDashMes;

  const doPeriodo = svDashMes === "__tudo" ? vendas : vendas.filter(v => v.dia.startsWith(svDashMes));
  const quando = svDashMes === "__tudo" ? "desde o início" : "no mês";
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

  const valorTodos = svResumoValor(est);
  const cartoes = [`
    <button type="button" class="sv-arm-card${svArmSelecionado === "" ? " sel" : ""}" data-svarm="" aria-pressed="${svArmSelecionado === ""}">
      <span class="sv-arm-nome">Todos</span>
      <span class="sv-arm-qtd">${fmt(est.reduce((s, l) => s + l.qtd, 0))} un.</span>
      <span class="sv-arm-sub">${valorTodos.temCusto ? escapeHtml(formatMoney(valorTodos.total)) + " investidos" : "custo não cadastrado"}${valorTodos.temCusto && valorTodos.semCusto > 0 ? ` · ${valorTodos.semCusto} sem custo` : ""}</span>
    </button>`];
  nomes.forEach(a => {
    const linhas = est.filter(l => l.armazem === a);
    const codigos = new Set(linhas.map(l => l.codigo)).size;
    cartoes.push(`
    <button type="button" class="sv-arm-card${svArmSelecionado === chaveDe(a) ? " sel" : ""}" data-svarm="${escapeAttr(chaveDe(a))}" aria-pressed="${svArmSelecionado === chaveDe(a)}">
      <span class="sv-arm-nome">${escapeHtml(svNomeArmazem(a))}</span>
      <span class="sv-arm-qtd">${fmt(linhas.reduce((s, l) => s + l.qtd, 0))} un.</span>
      <span class="sv-arm-sub">${fmt(codigos)} ${codigos === 1 ? "código" : "códigos diferentes"}</span>
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
    .sort((a, b) => (b.valor === null ? -1 : b.valor) - (a.valor === null ? -1 : a.valor) || b.qtd - a.qtd || a.codigo.localeCompare(b.codigo));
  document.getElementById("svArmTitulo").textContent = "Itens — " + (svArmSelecionado === "" ? "todos os armazéns" : svNomeArmazem(svArmSelecionado === "__sem" ? "" : svArmSelecionado));
  document.getElementById("svArmCount").textContent = `${rows.length} item(ns)`;
  document.getElementById("svArmTbody").innerHTML = rows.map(l => `
    <tr>
      <td class="mono">${escapeHtml(l.codigo)}</td>
      <td>${escapeHtml(l.produto ? l.produto.medida : "(produto removido)")}</td>
      <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
      <td class="sv-num">${fmt(l.qtd)}</td>
      <td class="sv-num">${l.valor === null ? "—" : escapeHtml(formatMoney(l.valor))}</td>
    </tr>`).join("");
  const vazio = document.getElementById("svArmEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = est.length === 0
    ? "Nenhum pneu em estoque ainda. Quando um processo do Estoque Previsto for marcado como FINALIZADO (com o armazém), os pneus aparecem aqui."
    : "Nenhum pneu nesse armazém.";
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
let svCliEditandoId = null;
let svCliDaReserva = false; // a janela foi aberta pelo atalho da Reserva: ao salvar, o cliente já volta preenchido lá
let svCliUnidadeAtual = "";
let svCliSalvando = false;

function svClienteFromRow(r) {
  return {
    id: r.id, nome: r.nome, tipoPessoa: r.tipo_pessoa || "PJ", documento: r.documento || "", contato: r.contato || "",
    telefone: r.telefone || "", email: r.email || "", cidade: r.cidade || "", estado: r.estado || "",
    unidadeNegocio: r.unidade_negocio || "AMBOS", obs: r.obs || "", createdAt: r.created_at || ""
  };
}

function svClienteToRow(c) {
  return {
    id: c.id, nome: c.nome, tipo_pessoa: c.tipoPessoa, documento: c.documento || null, contato: c.contato || null,
    telefone: c.telefone || null, email: c.email || null, cidade: c.cidade || null, estado: c.estado,
    unidade_negocio: c.unidadeNegocio, obs: c.obs || null
  };
}

// carrega uma vez; quem precisa de dado fresco (a tela de Clientes) passa forcar
function svCarregarClientes(forcar) {
  if (svClientesEmAndamento) return svClientesEmAndamento;
  if (svClientesCarregados && !forcar) return Promise.resolve(true);
  svClientesEmAndamento = (async () => {
    const { data, error } = await sb.from("sv_clientes").select("*").order("nome");
    if (error) {
      toast("Erro ao carregar os clientes do Sem Venda: " + error.message);
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
    ["Cidade/UF", [c.cidade, c.estado].filter(Boolean).join(" / ")]
  ].map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${escapeHtml(v || "—")}</div></div>`).join("")
    + `<div><div class="lbl">Unidade de negócio</div><div class="val">${svSeloUnidadeCliente(c.unidadeNegocio)}</div></div>`;
  const podeExcluir = currentUserIsAdmin && reservas.length === 0;
  box.innerHTML = `
    <div class="cliente-modal-head">
      <div class="cliente-modal-titulo"><h3>${escapeHtml(c.nome)}</h3><span class="cli-tp-selo">${escapeHtml(c.tipoPessoa)}</span></div>
      <div class="cliente-modal-head-actions">
        <button type="button" class="btn small outline sv-write" id="svCliBtnEditar">✎ Editar dados</button>
        ${currentUserIsAdmin ? `<button type="button" class="btn small danger sv-write" id="svCliBtnExcluir" ${podeExcluir ? "" : `disabled title="Só dá para excluir cliente sem reservas"`}>🗑 Excluir</button>` : ""}
      </div>
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
  document.getElementById("svCliBtnEditar").addEventListener("click", () => svAbrirClienteModal(c.id, false));
  const ex = document.getElementById("svCliBtnExcluir");
  if (ex && !ex.disabled) ex.addEventListener("click", () => svExcluirCliente(c.id));
}

function svAbrirClienteModal(id, daReserva) {
  const c = id ? svClientes.find(x => x.id === id) : null;
  svCliEditandoId = c ? c.id : null;
  svCliDaReserva = !!daReserva;
  document.getElementById("svFormCliente").reset();
  document.getElementById("svCliErro").textContent = "";
  document.getElementById("svCliModalTitulo").textContent = c ? "Editar cliente" : "Novo cliente";
  document.getElementById("svBtnSubmitCliente").textContent = c ? "Salvar" : "Adicionar cliente";
  // selects montados por valor (não por "selected"), para o reset da janela não trazer a escolha anterior
  document.getElementById("svCliEstado").innerHTML = `<option value="">Selecione…</option>` + UF_LIST.map(uf => `<option value="${uf}">${uf}</option>`).join("");
  document.getElementById("svCliUnidade").innerHTML = `<option value="">Selecione…</option>` +
    Object.entries(SV_UNIDADES_CLIENTE).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("");
  if (c) {
    document.getElementById("svCliNome").value = c.nome;
    document.getElementById("svCliTipoPessoa").value = c.tipoPessoa;
    document.getElementById("svCliDocumento").value = c.documento;
    document.getElementById("svCliContato").value = c.contato;
    document.getElementById("svCliTelefone").value = c.telefone;
    document.getElementById("svCliEmail").value = c.email;
    document.getElementById("svCliCidade").value = c.cidade;
    document.getElementById("svCliEstado").value = c.estado;
    document.getElementById("svCliUnidade").value = c.unidadeNegocio;
    document.getElementById("svCliObs").value = c.obs;
  } else if (daReserva) {
    const digitado = document.getElementById("svResCliente").value.trim();
    document.getElementById("svCliNome").value = digitado;
    const un = document.getElementById("svResUnidade").value;
    if (un) document.getElementById("svCliUnidade").value = un;
  }
  document.getElementById("svCliOverlay").classList.add("show");
  document.getElementById("svCliNome").focus();
}

function svFecharClienteModal() {
  document.getElementById("svCliOverlay").classList.remove("show");
}

async function svSalvarCliente(e) {
  e.preventDefault();
  if (svCliSalvando) return;
  svCliSalvando = true;
  const botao = document.getElementById("svBtnSubmitCliente");
  botao.disabled = true;
  try { await svSalvarClienteDados(); } finally { svCliSalvando = false; botao.disabled = false; }
}

async function svSalvarClienteDados() {
  const v = (id) => document.getElementById(id).value.replace(/\s+/g, " ").trim();
  const dados = {
    nome: v("svCliNome"), tipoPessoa: document.getElementById("svCliTipoPessoa").value, documento: v("svCliDocumento"),
    contato: v("svCliContato"), telefone: v("svCliTelefone"), email: v("svCliEmail"), cidade: v("svCliCidade"),
    estado: document.getElementById("svCliEstado").value, unidadeNegocio: document.getElementById("svCliUnidade").value, obs: v("svCliObs")
  };
  const erro = document.getElementById("svCliErro");
  const falha = !dados.nome ? "Informe o nome do cliente."
    : !dados.estado ? "Escolha o estado (UF)."
    : !dados.unidadeNegocio ? "Escolha a unidade de negócio."
    : svClientes.some(c => c.id !== svCliEditandoId && c.nome.toLowerCase() === dados.nome.toLowerCase()) ? "Já existe um cliente com esse nome."
    : "";
  erro.textContent = falha;
  if (falha) return;

  const antigo = svCliEditandoId ? svClientes.find(c => c.id === svCliEditandoId) : null;
  let salvo;
  if (antigo) {
    const { data, error } = await sb.from("sv_clientes").update(svClienteToRow({ ...dados, id: antigo.id })).eq("id", antigo.id).select();
    if (error) { erro.textContent = "Erro ao salvar: " + error.message; return; }
    if (!data || data.length === 0) { erro.textContent = "Não foi possível salvar (sem permissão)."; return; }
    salvo = svClienteFromRow(data[0]);
    svClientes[svClientes.indexOf(antigo)] = salvo;
    // renomear atualiza as reservas no banco (on update cascade): recarrega para a lista não ficar com o nome velho
    if (antigo.nome !== salvo.nome) await svCarregarDados(true);
  } else {
    const { data, error } = await sb.from("sv_clientes").insert({ ...svClienteToRow({ ...dados, id: uid("svcli") }), created_by: currentUser ? currentUser.id : null }).select();
    if (error) { erro.textContent = "Erro ao adicionar: " + error.message; return; }
    if (!data || data.length === 0) { erro.textContent = "Não foi possível adicionar (sem permissão)."; return; }
    salvo = svClienteFromRow(data[0]);
    svClientes.push(salvo);
  }
  svClientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  svFecharClienteModal();
  if (svCliDaReserva) {
    // volta para a Reserva com o cliente já escolhido
    svRenderReservaForm();
    document.getElementById("svResCliente").value = salvo.nome;
    svPreencherUnidadeDoCliente();
    svAtualizarResumoReserva();
    svLimparErroCampo("cliente");
  } else {
    svCliSelecionadoId = salvo.id;
    svRenderClientes();
  }
  toast(antigo ? "Cliente atualizado." : "Cliente adicionado.");
}

async function svExcluirCliente(id) {
  const c = svClientes.find(x => x.id === id);
  if (!c) return;
  if (svReservasDoCliente(c.nome).length) { toast("Esse cliente tem reservas e não pode ser excluído."); return; }
  if (!(await confirmModal("Excluir cliente?", `Remove "${c.nome}" do cadastro do Sem Venda.`))) return;
  const { data, error } = await sb.from("sv_clientes").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir o cliente: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou já removido)."); return; }
  svClientes = svClientes.filter(x => x.id !== id);
  svCliSelecionadoId = null;
  svRenderClientes();
  toast("Cliente removido.");
}

// na Reserva: cliente de uma unidade só já preenche a Unidade de negócio ("Ambos" deixa a escolha com a pessoa)
function svPreencherUnidadeDoCliente() {
  const nome = document.getElementById("svResCliente").value.trim().toLowerCase();
  const c = svClientes.find(x => x.nome.toLowerCase() === nome);
  if (c && SV_UNIDADES[c.unidadeNegocio]) {
    document.getElementById("svResUnidade").value = c.unidadeNegocio;
    svLimparErroCampo("unidade");
  }
}

function svLigarClientes() {
  const $ = (id) => document.getElementById(id);
  $("svBtnNovoCliente").addEventListener("click", () => svAbrirClienteModal(null, false));
  $("svFormCliente").addEventListener("submit", svSalvarCliente);
  $("svCliFechar").addEventListener("click", svFecharClienteModal);
  $("svCliCancelar").addEventListener("click", svFecharClienteModal);
  $("svCliOverlay").addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    svFecharClienteModal();
  });
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
  return (condicao ? "" : "Forma de pagamento sob consulta. ") + "Frete não incluso, combinado à parte. Quantidades disponíveis em " + formatDateBR(todayISO()) + ".";
}

function svAtualizarCabecalhoProposta() {
  document.getElementById("svPropSub").textContent = svSubProposta();
  document.getElementById("svPropRodape").textContent = svRodapeProposta();
}

function svAbrirProposta() {
  svPropostaPrecos = {};
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
        <td class="num">${fmt(l.disp)}</td>
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
    const linhas = svLinhasProposta();
    if (linhas.length === 0) { toast("Não há pneus disponíveis com esses filtros."); return; }
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

function initSemVendaTelas() {
  const statusHtml = PREVISTO_STATUS.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
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
  ["svProdSearch", "svProdFiltroCategoria", "svProdFiltroMarca", "svProdFiltroCarcaca", "svProdFiltroSituacao"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderProdutos);
  });

  document.getElementById("svFormPrevisto").addEventListener("submit", svSalvarPrevisto);
  document.getElementById("svPrevCancelEdit").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    svCancelarEdicaoPrevisto();
  });
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

  ["svCatSearch", "svCatFiltroArmazem", "svCatFiltroMarca"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderCatalogo);
  });

  document.getElementById("svDashMes").addEventListener("change", (e) => {
    svDashMes = e.target.value;
    svRenderDashboardVendas();
  });
  document.getElementById("svFormVendedor").addEventListener("submit", svAdicionarVendedor);
  document.getElementById("svFormTransportadora").addEventListener("submit", svAdicionarTransportadora);
  svLigarReserva();
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

  document.getElementById("svArmFiltro").addEventListener("change", (e) => {
    svArmSelecionado = e.target.value;
    svRenderArmazenagem();
  });
}

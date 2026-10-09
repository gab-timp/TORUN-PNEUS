/* ---------------- Sem Venda: escolha do sistema, menu e telas ---------------- */
/* Carrega antes do app.js; usa currentUser*, setView, primeiraViewPermitida e
   currentUserRoleLabel do app.js, que só são resolvidos na hora da chamada. */

const SISTEMA_KEY = "torun_sistema_atual_v1";

function temAcessoSemVenda() {
  return currentUserIsAdmin || currentUserPodeAcessarSemVenda;
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
  lembrarSistema(sistema);
  document.body.classList.toggle("sistema-semvenda", semVenda);
  document.getElementById("navVarejo").style.display = semVenda ? "none" : "";
  document.getElementById("navSemVenda").style.display = semVenda ? "" : "none";
  document.getElementById("brandSub").textContent = semVenda ? "Sem Venda" : "Controle de Estoque";
  document.getElementById("btnTrocarSistema").style.display = temAcessoSemVenda() ? "" : "none";
  document.title = semVenda ? "TORUN PNEUS · Sem Venda" : "TORUN PNEUS · Painel de Controle";
  setView(semVenda ? "sv-dashboard" : primeiraViewPermitida());
}

function mostrarEscolhaSistema() {
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

// Quem não tem acesso ao Sem Venda entra direto no varejo, como sempre foi.
function entrarNoSistema() {
  const shell = document.getElementById("appShell");
  if (!temAcessoSemVenda()) {
    shell.style.display = "flex";
    return;
  }
  const lembrado = sistemaLembrado();
  if (lembrado === "varejo" || lembrado === "semvenda") {
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
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svReservaToRow(r) {
  return {
    id: r.id, codigo: r.codigo, quantidade: r.quantidade, cliente: r.cliente,
    vendedor_interno: r.vendedorInterno, representante: r.representante || null,
    armazem: r.previsaoId ? null : (r.armazem || ""), previsao_id: r.previsaoId || null,
    situacao: r.situacao, data: r.data, obs: r.obs || null
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
    status: r.status, armazem: r.armazem || "", obs: r.obs || "", createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svPrevistoToRow(p) {
  return {
    id: p.id, numero_processo: p.numeroProcesso, itens: p.itens || [], data_chegada: p.dataChegada || null,
    status: p.status, armazem: p.armazem || null, obs: p.obs || null
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
  if (!["sv-produtos", "sv-previsto", "sv-catalogo", "sv-reserva", "sv-dashboard", "sv-armazenagem", "sv-relatoriopreco"].includes(view)) return;
  if (!(await svCarregarDados())) return;
  // a lista de vendedores tem carga própria: se a tabela não existir, só a Reserva reclama
  if (view === "sv-reserva") await svCarregarVendedores();
  if (view === "sv-produtos") svRenderProdutos();
  else if (view === "sv-previsto") svRenderPrevistos();
  else if (view === "sv-catalogo") svRenderCatalogo();
  else if (view === "sv-dashboard") svRenderDashboard();
  else if (view === "sv-armazenagem") svRenderArmazenagem();
  else if (view === "sv-relatoriopreco") svAbrirProposta();
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

function svInitPrevDetalhe() {
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
  const dados = { numeroProcesso, itens, dataChegada, status, armazem, obs };

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
  return `Estoque Previsto — processo ${prev.numeroProcesso}${prev.dataChegada ? " · chega " + formatDateBR(prev.dataChegada) : ""}`;
}

function svMontarOpcoesReserva() {
  const { linhas, aChegar } = svCalcularEstoque();
  const opcoes = [];
  linhas.filter(l => l.disp > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.armazem.localeCompare(b.armazem))
    .forEach(l => {
      const p = svGetProduto(l.codigo);
      opcoes.push({
        tipo: "E", codigo: l.codigo, armazem: l.armazem, disp: l.disp,
        rotulo: `${l.codigo} — ${p ? p.medida : "(produto removido)"} (${l.disp} disp. · ${svNomeArmazem(l.armazem)})`
      });
    });
  aChegar.filter(a => a.livres > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .forEach(a => {
      const prev = svState.previsoes.find(x => x.id === a.previsaoId);
      const p = svGetProduto(a.codigo);
      opcoes.push({
        tipo: "P", codigo: a.codigo, previsaoId: a.previsaoId, disp: a.livres,
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

function svAtualizarNotaDisponivel() {
  const o = svOpcaoSelecionada();
  document.getElementById("svResDisp").textContent = o
    ? `Disponível pra reservar: ${fmt(o.disp)} un.`
    : (svOpcoesReserva.length === 0 ? "Nada disponível: marque um processo como FINALIZADO (com armazém) ou cadastre um processo a caminho no Estoque Previsto." : "");
  document.getElementById("svResQuantidade").max = o ? String(o.disp) : "";
}

function svRenderReservaForm() {
  const sel = document.getElementById("svResProduto");
  const anterior = svOpcaoSelecionada();
  const chaveAnterior = anterior ? svChaveOpcao(anterior) : null;
  svOpcoesReserva = svMontarOpcoesReserva();
  const grupo = (titulo, tipo) => {
    const itens = svOpcoesReserva.map((o, i) => ({ o, i })).filter(x => x.o.tipo === tipo);
    return itens.length
      ? `<optgroup label="${escapeAttr(titulo)}">` + itens.map(x => `<option value="${x.i}">${escapeHtml(x.o.rotulo)}</option>`).join("") + `</optgroup>`
      : "";
  };
  sel.innerHTML = `<option value="">Selecione…</option>` + grupo("Em estoque", "E") + grupo("A caminho (Estoque Previsto)", "P");
  if (chaveAnterior) {
    const i = svOpcoesReserva.findIndex(o => svChaveOpcao(o) === chaveAnterior);
    if (i >= 0) sel.value = String(i);
  }
  svAtualizarNotaDisponivel();

  document.getElementById("svListaClientes").innerHTML =
    (state.clientes || []).map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");

  // Vendedor interno (lista cadastrada em Administração) e Representante (ativos, ou "Sem representante").
  // Os dois começam em "Selecione…": nenhum vem preenchido sozinho.
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

function svRenderReservaTabela() {
  const filtro = document.getElementById("svResFiltro").value;
  const busca = (document.getElementById("svResSearch").value || "").trim().toLowerCase();
  let rows = svState.reservas.slice();
  if (filtro === "ativas_vendidas") rows = rows.filter(r => r.situacao !== "CANCELADA");
  else if (filtro === "ativas") rows = rows.filter(r => r.situacao === "ATIVA");
  else if (filtro === "canceladas") rows = rows.filter(r => r.situacao === "CANCELADA");
  if (busca) {
    rows = rows.filter(r => {
      const p = svGetProduto(r.codigo);
      return [r.cliente, r.vendedorInterno, r.representante || "", r.codigo, p ? p.medida : ""].join(" ").toLowerCase().includes(busca);
    });
  }
  rows.sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));

  document.getElementById("svResCount").textContent = `${rows.length} de ${svState.reservas.length} reserva(s)`;
  const vazio = document.getElementById("svResEmpty");
  vazio.style.display = rows.length === 0 ? "block" : "none";
  vazio.textContent = svState.reservas.length === 0 ? "Nenhuma reserva ainda." : "Nenhuma reserva com esses filtros.";

  const tbody = document.getElementById("svResTbody");
  tbody.innerHTML = rows.map(r => {
    const p = svGetProduto(r.codigo);
    const sit = svSituacaoReserva(r);
    const acoes = r.situacao === "ATIVA"
      ? `<button type="button" class="sv-link sv-link-ok sv-write" data-svresvender="${escapeAttr(r.id)}">Confirmar venda</button>
         <button type="button" class="sv-link sv-write" data-svrescancelar="${escapeAttr(r.id)}">Cancelar</button>`
      : `<span class="muted">—</span>`;
    return `
      <tr>
        <td><span class="mono">${escapeHtml(r.codigo)}</span><div class="muted sv-sub">${escapeHtml(p ? p.medida : "(produto removido)")}</div><div class="muted sv-sub">${escapeHtml(svOrigemReserva(r))}</div></td>
        <td>${escapeHtml(r.cliente)}</td>
        <td>${escapeHtml(r.vendedorInterno)}</td>
        <td>${r.representante ? escapeHtml(r.representante) : '<span class="sv-sem-rep">Sem representante</span>'}</td>
        <td class="mono">${fmt(r.quantidade)}</td>
        <td><span class="status-pill ${sit.pill}">${escapeHtml(sit.rotulo)}</span></td>
        <td class="mono">${r.data ? formatDateBR(r.data) : "—"}</td>
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

async function svMudarSituacaoReserva(id, nova) {
  const r = svState.reservas.find(x => x.id === id);
  if (!r) return;
  const [titulo, texto] = nova === "VENDIDA"
    ? ["Confirmar venda?", `Marcar as ${r.quantidade} un. de ${r.codigo} reservadas para ${r.cliente} como vendidas?`]
    : ["Cancelar reserva?", `Libera as ${r.quantidade} un. de ${r.codigo} reservadas para ${r.cliente}.`];
  if (!(await confirmModal(titulo, texto))) return;
  // só muda se ainda estiver ativa: se outra pessoa já vendeu ou cancelou, não sobrescreve
  const { data, error } = await sb.from("sv_reservas").update({ situacao: nova }).eq("id", id).eq("situacao", "ATIVA").select();
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

async function svSalvarReserva(e) {
  e.preventDefault();
  const botao = document.getElementById("svBtnSubmitReserva");
  if (botao.disabled) return;
  botao.disabled = true;
  try { await svSalvarReservaDados(); } finally { botao.disabled = false; }
}

async function svSalvarReservaDados() {
  const opcao = svOpcaoSelecionada();
  const clienteDigitado = document.getElementById("svResCliente").value.trim();
  const vendedorInterno = document.getElementById("svResVendedor").value;
  const escolhaRepresentante = document.getElementById("svResRepresentante").value;
  const quantidade = parseInt(document.getElementById("svResQuantidade").value, 10);
  const data = document.getElementById("svResData").value;
  const obs = document.getElementById("svResObs").value.trim();

  if (!opcao) { toast("Escolha o produto."); return; }
  const cliente = (state.clientes || []).find(c => c.nome.toLowerCase() === clienteDigitado.toLowerCase());
  if (!cliente) { toast("Cliente não encontrado no cadastro do Torun. Cadastre em Clientes antes de reservar."); return; }
  if (!vendedorInterno) { toast("Escolha o vendedor interno."); return; }
  if (!escolhaRepresentante) { toast('Escolha o representante ou marque "Sem representante".'); return; }
  const representante = escolhaRepresentante === SV_SEM_REPRESENTANTE ? null : escolhaRepresentante;
  if (!(quantidade > 0)) { toast("Informe a quantidade."); return; }
  if (!data) { toast("Informe a data."); return; }

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
      toast("Esse processo já chegou. As opções foram atualizadas — escolha o produto em estoque.");
      return;
    }
    const a = aChegar.find(x => x.previsaoId === opcao.previsaoId && x.codigo === opcao.codigo);
    disponivel = a ? a.livres : 0;
  }
  if (quantidade > disponivel) {
    svRenderReserva();
    toast(`Só há ${disponivel} un. disponíveis nessa opção.`);
    return;
  }

  const nova = {
    id: uid("svres"), codigo: opcao.codigo, quantidade, cliente: cliente.nome, vendedorInterno, representante,
    armazem: opcao.tipo === "E" ? opcao.armazem : null,
    previsaoId: opcao.tipo === "P" ? opcao.previsaoId : null,
    situacao: "ATIVA", data, obs
  };
  const { data: inserida, error } = await sb.from("sv_reservas").insert({ ...svReservaToRow(nova), created_by: currentUser ? currentUser.id : null }).select();
  if (error) { toast("Erro ao reservar: " + error.message); return; }
  if (!inserida || inserida.length === 0) { toast("Não foi possível reservar (sem permissão)."); return; }
  svState.reservas.unshift(svReservaFromRow(inserida[0]));
  document.getElementById("svFormReserva").reset();
  document.getElementById("svResData").value = todayISO();
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
  if (!document.getElementById("svVendedoresCard")) return;
  if (await svCarregarVendedores()) svRenderVendedoresAdmin();
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

function svSubProposta() {
  const cliente = document.getElementById("svPropCliente").value.trim();
  const validade = document.getElementById("svPropValidade").value;
  return [validade ? "Válida até " + formatDateBR(validade) : "", cliente].filter(Boolean).join(" · ");
}

function svRodapeProposta() {
  return "Valores e condições de pagamento sob consulta. Frete não incluso, combinado à parte. Quantidades disponíveis em " + formatDateBR(todayISO()) + ".";
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

  document.getElementById("svPropClientes").innerHTML = (state.clientes || [])
    .map(c => `<option value="${escapeAttr(c.nome)}"></option>`).join("");
  const validade = document.getElementById("svPropValidade");
  if (!validade.value) validade.value = dataMaisDias(todayISO(), 7);

  svAtualizarCabecalhoProposta();
  svRenderTabelaProposta();
}

function svRenderTabelaProposta() {
  const linhas = svLinhasProposta();
  document.getElementById("svPropTbody").innerHTML = linhas.map(l => {
    const preco = svPrecoProposta(l.codigo);
    return `
      <tr>
        <td class="mono">${escapeHtml(l.codigo)}</td>
        <td>${escapeHtml(l.produto ? l.produto.medida : "(produto removido)")}</td>
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
        <td>${escapeHtml(svNomeArmazem(l.armazem))}</td>
        <td class="num">${fmt(l.disp)}</td>
        <td class="num">${preco === null ? "Sob consulta" : escapeHtml(formatMoney(preco))}</td>
      </tr>`;
  }).join("");
  return `
    <div class="print-proposta">
      <div class="pp-topo">
        <img src="assets/logo-light.png" class="pp-logo" alt="Torun Pneus">
        <div>
          <h1>Proposta — Estoque Sem Venda</h1>
          ${sub ? `<div class="pp-sub">${escapeHtml(sub)}</div>` : ""}
        </div>
      </div>
      <table class="pp-tabela">
        <thead><tr><th>Código</th><th>Medida</th><th>Armazém</th><th class="num">Qtd.</th><th class="num">Preço/un.</th></tr></thead>
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

  document.getElementById("svFormVendedor").addEventListener("submit", svAdicionarVendedor);
  document.getElementById("svFormReserva").addEventListener("submit", svSalvarReserva);
  document.getElementById("svResProduto").addEventListener("change", svAtualizarNotaDisponivel);
  ["svResSearch", "svResFiltro"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderReservaTabela);
  });
  document.getElementById("svResData").value = todayISO();

  document.getElementById("svFormProposta").addEventListener("submit", svGerarProposta);
  ["svPropArmazem", "svPropCategoria"].forEach(id => {
    document.getElementById(id).addEventListener("change", svRenderTabelaProposta);
  });
  ["svPropCliente", "svPropValidade"].forEach(id => {
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

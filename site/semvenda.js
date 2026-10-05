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
    icIv: r.ic_iv || "", pr: r.pr || "", capCarga: r.cap_carga || "", fotoPath: r.foto_path || null
  };
}

function svReservaFromRow(r) {
  return {
    id: r.id, codigo: r.codigo, quantidade: Number(r.quantidade), cliente: r.cliente, responsavel: r.responsavel,
    armazem: r.armazem === null || r.armazem === undefined ? null : r.armazem,
    previsaoId: r.previsao_id || null, situacao: r.situacao, data: r.data || "", obs: r.obs || "",
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function svReservaToRow(r) {
  return {
    id: r.id, codigo: r.codigo, quantidade: r.quantidade, cliente: r.cliente, responsavel: r.responsavel,
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
    ic_iv: p.icIv || null, pr: p.pr || null, cap_carga: p.capCarga || null
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
  if (!["sv-produtos", "sv-previsto", "sv-catalogo", "sv-reserva"].includes(view)) return;
  if (!(await svCarregarDados())) return;
  if (view === "sv-produtos") svRenderProdutos();
  else if (view === "sv-previsto") svRenderPrevistos();
  else if (view === "sv-catalogo") svRenderCatalogo();
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
    capCarga: document.getElementById("svProdCapCarga").value.trim()
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

function svRenderPrevistos() {
  svAtualizarSelectsProduto();
  const search = (document.getElementById("svPrevSearch").value || "").trim().toLowerCase();
  const filtroStatus = document.getElementById("svPrevFiltroStatus").value;
  const somenteLeitura = currentUserRole === "viewer";

  let rows = svState.previsoes.slice();
  if (search) {
    rows = rows.filter(p => {
      const medidas = p.itens.map(it => { const prod = svGetProduto(it.codigo); return prod ? prod.medida : it.codigo; }).join(" ");
      return (p.numeroProcesso + " " + medidas).toLowerCase().includes(search);
    });
  }
  if (filtroStatus !== "todos") rows = rows.filter(p => p.status === filtroStatus);
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const grid = document.getElementById("svPrevGrid");
  const vazio = document.getElementById("svPrevEmpty");
  if (rows.length === 0) {
    grid.innerHTML = "";
    vazio.style.display = "block";
    return;
  }
  vazio.style.display = "none";

  grid.innerHTML = rows.map(p => {
    const itensHtml = p.itens.map(it => {
      const prod = svGetProduto(it.codigo);
      return `
        <li>
          <span class="mono">${escapeHtml(it.codigo)}</span>
          <span class="medida-txt">${escapeHtml(prod ? prod.medida : "(produto removido)")}</span>
          <span class="num mono">${fmt(it.quantidade)}</span>
        </li>
      `;
    }).join("");
    const statusOptions = PREVISTO_STATUS.map(s => `<option value="${escapeAttr(s)}" ${s === p.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");
    const armazens = p.armazem && !SV_ARMAZENS.includes(p.armazem) ? [...SV_ARMAZENS, p.armazem] : SV_ARMAZENS;
    const armazemOptions = `<option value="" ${p.armazem ? "" : "selected"}>—</option>` +
      armazens.map(a => `<option value="${escapeAttr(a)}" ${a === p.armazem ? "selected" : ""}>${escapeHtml(a)}</option>`).join("");
    const bloqueio = somenteLeitura ? "disabled" : "";

    return `
      <div class="prev-card ${statusBadgeClass(p.status)}">
        <div class="prev-card-head">
          <div>
            <span class="prev-card-eyebrow">Processo</span>
            <span class="mono prev-card-title">${escapeHtml(p.numeroProcesso)}</span>
            <span class="prev-status-badge ${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
          </div>
          <div class="prev-card-actions sv-write">
            <button class="btn small outline" data-svprevedit="${escapeAttr(p.id)}">Editar</button>
            <button class="btn small danger" data-svprevdel="${escapeAttr(p.id)}">✕</button>
          </div>
        </div>
        <ul class="prev-itens-list">${itensHtml}</ul>
        ${p.obs ? `<div class="muted prev-card-obs">${escapeHtml(p.obs)}</div>` : ""}
        <div class="prev-card-footer">
          <div class="field">
            <label>Data de chegada</label>
            <input type="date" value="${escapeAttr(p.dataChegada || "")}" data-svprevdata="${escapeAttr(p.id)}" ${bloqueio}>
          </div>
          <div class="field">
            <label>Armazém</label>
            <select data-svprevarmazem="${escapeAttr(p.id)}" ${bloqueio}>${armazemOptions}</select>
          </div>
          <div class="field">
            <label>Status</label>
            <select data-svprevstatus="${escapeAttr(p.id)}" ${bloqueio}>${statusOptions}</select>
          </div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-svprevdata]").forEach(inp => {
    inp.addEventListener("change", async () => {
      await svAtualizarCampoPrevisto(inp.dataset.svprevdata, { data_chegada: inp.value || null }, "Data de chegada atualizada.");
      svRenderPrevistos();
    });
  });
  grid.querySelectorAll("[data-svprevstatus]").forEach(sel => {
    sel.addEventListener("change", async () => {
      await svAtualizarCampoPrevisto(sel.dataset.svprevstatus, { status: sel.value }, "Status atualizado.");
      svRenderPrevistos();
    });
  });
  grid.querySelectorAll("[data-svprevarmazem]").forEach(sel => {
    sel.addEventListener("change", async () => {
      await svAtualizarCampoPrevisto(sel.dataset.svprevarmazem, { armazem: sel.value || null }, "Armazém atualizado.");
      svRenderPrevistos();
    });
  });
  grid.querySelectorAll("[data-svprevedit]").forEach(btn => {
    btn.addEventListener("click", () => svIniciarEdicaoPrevisto(btn.dataset.svprevedit));
  });
  grid.querySelectorAll("[data-svprevdel]").forEach(btn => {
    btn.addEventListener("click", () => svExcluirPrevisto(btn.dataset.svprevdel));
  });
}

async function svAtualizarCampoPrevisto(id, campos, mensagem) {
  if (!svState.previsoes.some(x => x.id === id)) return;
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

async function svExcluirPrevisto(id) {
  const alvo = svState.previsoes.find(p => p.id === id);
  if (svState.reservas.some(r => r.previsaoId === id)) { toast("Não é possível excluir: há reservas ligadas a esse processo."); return; }
  const ok = await confirmModal("Excluir processo previsto?", `Remove o processo ${alvo ? alvo.numeroProcesso : ""} e as medidas dele desta lista.`);
  if (!ok) return;
  const { data, error } = await sb.from("sv_previsoes").delete().eq("id", id).select();
  if (error) { toast("Erro ao excluir: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou processo já removido)."); return; }
  if (svEditandoPrevistoId === id) svCancelarEdicaoPrevisto();
  svState.previsoes = svState.previsoes.filter(p => p.id !== id);
  svRenderPrevistos();
  toast("Processo removido.");
}

/* ---------- Saldo: calculado dos processos que chegaram menos as reservas ---------- */

// linhas: uma por produto + armazém, com o que chegou (processos CHEGOU), o que está reservado
//   (reservas ativas), o que já foi vendido e o disponível = chegou − reservado − vendido.
// aChegar: uma por processo ainda não chegado + produto, com o que ainda dá pra reservar (livres).
// Nada disso é gravado: a tela recalcula a cada carga, então não existe saldo "errado" no banco.
function svCalcularEstoque() {
  const linhas = new Map();
  const linha = (codigo, armazem) => {
    const chave = codigo + "|" + (armazem || "");
    if (!linhas.has(chave)) linhas.set(chave, { codigo, armazem: armazem || "", chegou: 0, reservado: 0, vendido: 0 });
    return linhas.get(chave);
  };
  const aChegar = new Map();

  svState.previsoes.forEach(p => {
    p.itens.forEach(it => {
      const qtd = Number(it.quantidade) || 0;
      if (!it.codigo || qtd <= 0) return;
      if (p.status === "CHEGOU") {
        linha(it.codigo, p.armazem).chegou += qtd;
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
    if (r.previsaoId && (!prev || prev.status !== "CHEGOU")) {
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

function svNomeArmazem(armazem) {
  return armazem || "Sem armazém";
}

/* ---------- Catálogo ---------- */

function svRenderCatalogo() {
  const { linhas } = svCalcularEstoque();
  const todas = linhas
    .filter(l => l.chegou > 0 || l.reservado > 0)
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
    ? "Nenhum pneu em estoque ainda. Quando um processo do Estoque Previsto for marcado como CHEGOU (com o armazém), os pneus aparecem aqui."
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
  if (prev && prev.status !== "CHEGOU") return { chave: "AGUARDANDO", rotulo: "Aguardando chegada", pill: "pill-azul" };
  return { chave: "RESERVADO", rotulo: "Reservado", pill: "pill-baixo" };
}

function svOrigemReserva(r) {
  const prev = r.previsaoId ? svState.previsoes.find(p => p.id === r.previsaoId) : null;
  if (!prev) return r.previsaoId ? "processo removido" : svNomeArmazem(r.armazem);
  if (prev.status === "CHEGOU") return `Processo ${prev.numeroProcesso} · ${svNomeArmazem(prev.armazem)}`;
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
    : (svOpcoesReserva.length === 0 ? "Nada disponível: marque um processo como CHEGOU (com armazém) ou cadastre um processo a caminho no Estoque Previsto." : "");
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
  const responsaveis = [...new Set([...(state.representantes || []), ...(state.vendas || []).map(v => v.vendedor)].filter(Boolean))].sort();
  document.getElementById("svListaResponsaveis").innerHTML = responsaveis.map(n => `<option value="${escapeAttr(n)}"></option>`).join("");
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
      return [r.cliente, r.responsavel, r.codigo, p ? p.medida : ""].join(" ").toLowerCase().includes(busca);
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
        <td>${escapeHtml(r.responsavel)}</td>
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
  const responsavel = document.getElementById("svResResponsavel").value.trim();
  const quantidade = parseInt(document.getElementById("svResQuantidade").value, 10);
  const data = document.getElementById("svResData").value;
  const obs = document.getElementById("svResObs").value.trim();

  if (!opcao) { toast("Escolha o produto."); return; }
  const cliente = (state.clientes || []).find(c => c.nome.toLowerCase() === clienteDigitado.toLowerCase());
  if (!cliente) { toast("Cliente não encontrado no cadastro do Torun. Cadastre em Clientes antes de reservar."); return; }
  if (!responsavel) { toast("Informe o responsável pela venda."); return; }
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
    if (!prev || prev.status === "CHEGOU") {
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
    id: uid("svres"), codigo: opcao.codigo, quantidade, cliente: cliente.nome, responsavel,
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

function initSemVendaTelas() {
  const statusHtml = PREVISTO_STATUS.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("");
  document.getElementById("svPrevStatus").innerHTML = statusHtml;
  document.getElementById("svPrevFiltroStatus").innerHTML = `<option value="todos">Todos os status</option>${statusHtml}`;
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
  ["svPrevSearch", "svPrevFiltroStatus"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderPrevistos);
  });
  svResetItens();

  document.getElementById("svBtnProdFoto").addEventListener("click", () => document.getElementById("svProdFotoInput").click());
  document.getElementById("svProdFotoInput").addEventListener("change", (e) => svEscolherFoto(e.target.files[0]));
  document.getElementById("svBtnProdRemoverFoto").addEventListener("click", svRemoverFoto);

  ["svCatSearch", "svCatFiltroArmazem", "svCatFiltroMarca"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderCatalogo);
  });

  document.getElementById("svFormReserva").addEventListener("submit", svSalvarReserva);
  document.getElementById("svResProduto").addEventListener("change", svAtualizarNotaDisponivel);
  ["svResSearch", "svResFiltro"].forEach(id => {
    document.getElementById(id).addEventListener("input", svRenderReservaTabela);
  });
  document.getElementById("svResData").value = todayISO();
}

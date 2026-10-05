/* ---------------- Sem Venda: escolha do sistema e estrutura (etapa 1) ---------------- */
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

const svState = { produtos: [], previsoes: [] };
let svUltimaCarga = 0;
let svEditandoProduto = null;
let svEditandoPrevistoId = null;
let svEditandoPrevistoUpdatedAt = null;

function svProdutoFromRow(r) {
  return {
    codigo: r.codigo, medida: r.medida, marca: r.marca || "", modelo: r.modelo || "",
    categoria: r.categoria || "", carcaca: r.carcaca || "", situacao: r.situacao || "ATIVO",
    icIv: r.ic_iv || "", pr: r.pr || "", capCarga: r.cap_carga || ""
  };
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
    id: r.id, numeroProcesso: r.numero_processo, itens: r.itens || [], dataChegada: r.data_chegada || "",
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

async function svCarregarDados(forcar) {
  if (!forcar && Date.now() - svUltimaCarga < SV_RECARGA_MIN_MS) return true;
  const [prod, prev] = await Promise.all([
    sb.from("sv_produtos").select("*").order("codigo"),
    sb.from("sv_previsoes").select("*").order("created_at", { ascending: false })
  ]);
  const erro = prod.error || prev.error;
  if (erro) {
    toast("Erro ao carregar o Sem Venda: " + erro.message);
    return false;
  }
  svState.produtos = (prod.data || []).map(svProdutoFromRow);
  svState.previsoes = (prev.data || []).map(svPrevistoFromRow);
  svUltimaCarga = Date.now();
  return true;
}

// chamado pelo setView() do app.js sempre que uma tela sv-* abre
async function svAoAbrirView(view) {
  if (view !== "sv-produtos" && view !== "sv-previsto") return;
  if (!(await svCarregarDados())) return;
  if (view === "sv-produtos") svRenderProdutos();
  else svRenderPrevistos();
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
          <button type="button" class="icon-btn write-ui" data-svedit="${escapeAttr(p.codigo)}" title="Editar"><svg class="ic" viewBox="0 0 20 20"><use href="#i-pencil"/></svg></button>
          <button type="button" class="btn small danger write-ui" data-svdel="${escapeAttr(p.codigo)}">Excluir</button>
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
}

async function svSalvarProduto(e) {
  e.preventDefault();
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
  e.target.reset();
  svRenderProdutos();
  toast("Produto adicionado.");
}

async function svExcluirProduto(codigo) {
  const usado = svState.previsoes.some(pr => (pr.itens || []).some(it => it.codigo === codigo));
  if (usado) { toast("Não é possível excluir: esse produto está numa medida de Estoque Previsto."); return; }
  const ok = await confirmModal("Excluir produto?", `Remover "${codigo}" do cadastro do Sem Venda?`);
  if (!ok) return;
  const { data, error } = await sb.from("sv_produtos").delete().eq("codigo", codigo).select();
  if (error) { toast("Erro ao excluir produto: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível excluir (sem permissão ou produto já removido)."); return; }
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

function svAtualizarSelectsProduto() {
  const opcoes = svProdutoOptionsHTML();
  document.querySelectorAll("#svPrevItens .item-produto").forEach(sel => {
    const anterior = sel.value;
    sel.innerHTML = opcoes;
    if (anterior) sel.value = anterior;
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
          <div class="prev-card-actions write-ui">
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
  const p = svState.previsoes.find(x => x.id === id);
  if (!p) return;
  const { data, error } = await sb.from("sv_previsoes").update(campos).eq("id", id).select();
  if (error) { toast("Erro ao salvar: " + error.message); return; }
  if (!data || data.length === 0) { toast("Não foi possível salvar (sem permissão ou processo removido)."); return; }
  Object.assign(p, svPrevistoFromRow(data[0]));
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
    if (it.codigo) row.querySelector(".item-produto").value = it.codigo;
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
}

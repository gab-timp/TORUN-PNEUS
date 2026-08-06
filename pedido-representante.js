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
let meusPreCadastros = [];
let clienteAtual = null;
let ultimoPedidoSalvo = null;
let itemRowSeq = 0;
let toastTimer;

const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const CATALOGO_REGIOES = ["SC/RS", "PR", "MG", "MT", "SC REVENDA"];
const CATALOGO_CONDICOES = ["A VISTA", "30 DIAS", "30/60", "30/60/90", "30/60/90/120", "30/60/90/120/150", "30/60/90/120/150/180"];

const ETAPA_LABEL = {
  ENTRADA: "Entrada", AUTORIZACAO_GERENCIA: "Autorização de Gerência", ANALISE_CREDITO: "Análise de Crédito",
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
    });
  });
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

  const [produtosRes, precosRes, movimentosRes, entregasRes, preCadastrosRes] = await Promise.all([
    sb.from("produtos").select("codigo, medida, categoria, modelo, ic_iv, pr, cintas, cap_carga, psi, sulco_mm, larg_banda_mm, peso_kg, foto_path, foto_path_2").order("codigo"),
    sb.from("produtos_precos").select("codigo, regiao, condicao_pagamento, preco"),
    sb.from("movimentos").select("codigo, tipo, quantidade"),
    sb.from("entregas").select("*").order("data", { ascending: false }),
    sb.from("clientes_pendentes").select("*").eq("created_by", currentUser.id).order("created_at", { ascending: false })
  ]);
  if (produtosRes.error) toast("Erro ao carregar produtos.");
  if (precosRes.error) toast("Erro ao carregar tabela de preços.");
  if (movimentosRes.error) toast("Erro ao carregar movimentações de estoque.");
  if (entregasRes.error) toast("Erro ao carregar entregas.");
  produtos = produtosRes.data || [];
  produtosPrecos = precosRes.data || [];
  movimentos = movimentosRes.data || [];
  entregas = entregasRes.data || [];
  meusPreCadastros = preCadastrosRes.data || [];

  document.getElementById("repDataPedido").textContent = formatDateBR(todayISO());
  document.getElementById("preCadEstado").innerHTML = UF_LIST.map(uf => `<option value="${uf}">${uf}</option>`).join("");
  document.getElementById("repCatalogoRegiao").innerHTML = `<option value="">Selecione…</option>` + CATALOGO_REGIOES.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  document.getElementById("repCatalogoCondicao").innerHTML = `<option value="">Selecione…</option>` + CATALOGO_CONDICOES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("repShell").style.display = "block";
  initForm();
  initRepTabs();
  initRepEstoque();
  initRepCatalogo();
  initRepEntregas();
  initPreCadastroForm();
  initThemeToggle();
  renderRepEstoque();
  renderRepCatalogo();
  renderRepEntregas();
  renderMeusPreCadastros();
  renderAcompanhamento();
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
    .select("nome, razao_social, documento, endereco, estado, cidade");

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

  if (!document.querySelectorAll("#repItens tr").length) {
    document.getElementById("repItens").appendChild(createItemRowRep());
    updateRemoveVisibilityRep();
  }
}

/* ---------------- itens ---------------- */

function produtoOptionsHTML() {
  return `<option value="">Selecione...</option>` + produtos.map(p =>
    `<option value="${escapeHtml(p.codigo)}">${escapeHtml(p.codigo)} — ${escapeHtml(p.medida)}</option>`
  ).join("");
}

function createItemRowRep() {
  itemRowSeq++;
  const tr = document.createElement("tr");
  tr.dataset.rowId = itemRowSeq;
  tr.innerHTML = `
    <td><select class="rep-item-produto">${produtoOptionsHTML()}</select></td>
    <td><input type="number" class="rep-item-qtd" min="1" step="1" placeholder="Qtd"></td>
    <td><input type="number" class="rep-item-valor" min="0" step="0.01" placeholder="0,00"></td>
    <td><input type="number" class="rep-item-desconto" min="0" max="100" step="0.01" placeholder="0"></td>
    <td class="rep-item-valor-total">${formatMoney(0)}</td>
    <td><button type="button" class="btn outline rep-item-remove">×</button></td>
  `;
  tr.querySelectorAll(".rep-item-qtd, .rep-item-valor, .rep-item-desconto").forEach(inp => {
    inp.addEventListener("input", recalcularTotais);
  });
  tr.querySelector(".rep-item-produto").addEventListener("change", (e) => {
    preencherValorSugerido(tr, e.target.value);
  });
  tr.querySelector(".rep-item-remove").addEventListener("click", () => {
    tr.remove();
    recalcularTotais();
    updateRemoveVisibilityRep();
  });
  return tr;
}

function preencherValorSugerido(tr, codigo) {
  const regiao = document.getElementById("repCatalogoRegiao").value;
  const condicao = document.getElementById("repCatalogoCondicao").value;
  if (!codigo || !regiao || !condicao) return;
  const preco = produtosPrecos.find(p => p.codigo === codigo && p.regiao === regiao && p.condicao_pagamento === condicao);
  if (!preco) return;
  tr.querySelector(".rep-item-valor").value = Number(preco.preco).toFixed(2);
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

function getPrecoProdutoRep(codigo, regiao, condicao) {
  const p = produtosPrecos.find(x => x.codigo === codigo && x.regiao === regiao && x.condicao_pagamento === condicao);
  return p ? Number(p.preco) : null;
}

function populateRepCatalogoFiltros() {
  const selCategoria = document.getElementById("repCatFiltroCategoria");
  const atual = selCategoria.value;
  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))].sort();
  selCategoria.innerHTML = `<option value="">Todas</option>` + categorias.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (categorias.includes(atual)) selCategoria.value = atual;

  const selCondicao = document.getElementById("repCatCondicaoView");
  if (selCondicao.options.length <= 1) {
    selCondicao.innerHTML = `<option value="">Selecione…</option>` + CATALOGO_CONDICOES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }
}

function buildPrecoMatrixHtmlRep(codigo) {
  const precos = produtosPrecos.filter(p => p.codigo === codigo);
  if (precos.length === 0) {
    return `<div class="note">Nenhum preço cadastrado para este produto ainda.</div>`;
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

function renderRepCatalogo() {
  populateRepCatalogoFiltros();

  const search = (document.getElementById("repCatSearch").value || "").trim().toLowerCase();
  const categoria = document.getElementById("repCatFiltroCategoria").value;
  const condicao = document.getElementById("repCatCondicaoView").value;
  const condicaoAtual = condicao || "A VISTA";

  let rows = produtos.filter(p => computeSaldoProduto(p.codigo) > 0);
  if (search) {
    rows = rows.filter(p =>
      p.codigo.toLowerCase().includes(search) ||
      p.medida.toLowerCase().includes(search) ||
      (p.modelo || "").toLowerCase().includes(search)
    );
  }
  if (categoria) rows = rows.filter(p => p.categoria === categoria);
  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const grid = document.getElementById("repCatalogoGrid");
  const empty = document.getElementById("repCatalogoEmpty");
  if (rows.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

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

    const precoPorRegiao = CATALOGO_REGIOES.map(r => {
      const preco = getPrecoProdutoRep(p.codigo, r, condicaoAtual);
      return `<div class="catalogo-prazo-row">
        <span>${escapeHtml(r)}</span>
        <span class="mono">${preco !== null ? formatMoney(preco) : "—"}</span>
      </div>`;
    }).join("");

    return `
      <div class="catalogo-card" data-repcatcard="${escapeHtml(p.codigo)}">
        <div class="catalogo-card-top">
          ${fotosCard.length ? `<div class="catalogo-card-thumbs">${fotosCard.map((url, i) => `<img class="catalogo-card-thumb" src="${escapeHtml(url)}" alt="${escapeHtml(p.codigo)}" data-repcatfoto="${escapeHtml(p.codigo)}" data-repcatfotoidx="${i}">`).join("")}</div>` : ""}
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
        <div class="catalogo-preco-condicao">Preço — ${escapeHtml(condicaoAtual)}</div>
        <div class="catalogo-prazos-lista aberto">
          ${precoPorRegiao}
        </div>

        <button type="button" class="btn small outline" style="width:100%;margin-top:10px;" data-reptoggleprazos="${escapeHtml(p.codigo)}">${aberto ? "Ocultar todos os prazos" : "Ver todos os prazos"}</button>
        <div class="catalogo-prazos-matriz" style="display:${aberto ? "" : "none"};">
          ${aberto ? buildPrecoMatrixHtmlRep(p.codigo) : ""}
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("[data-repcatfoto]").forEach(img => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const prod = produtos.find(x => x.codigo === img.dataset.repcatfoto);
      if (!prod) return;
      const urls = [fotoProdutoUrlRep(prod.foto_path), fotoProdutoUrlRep(prod.foto_path_2)].filter(Boolean);
      openCatalogoFotoLightbox(urls, Number(img.dataset.repcatfotoidx) || 0);
    });
  });
  grid.querySelectorAll("[data-reptoggleprazos]").forEach(btn => {
    btn.addEventListener("click", () => {
      const codigo = btn.dataset.reptoggleprazos;
      if (repCatalogoPrazosAbertos.has(codigo)) repCatalogoPrazosAbertos.delete(codigo);
      else repCatalogoPrazosAbertos.add(codigo);
      renderRepCatalogo();
    });
  });
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
    return `
      <tr>
        <td>${escapeHtml(it.codigo)}</td>
        <td>${escapeHtml(prod ? prod.medida : "")}</td>
        <td class="num">${fmt(it.quantidade)}</td>
        <td class="num">${formatMoney(it.valorUnitario)}</td>
        <td class="num">${it.desconto ? it.desconto + "%" : "—"}</td>
        <td class="num">${formatMoney(it.valorTotal)}</td>
      </tr>
    `;
  }).join("");
  const total = pedido.itens.reduce((a, it) => a + it.valorTotal, 0);

  return `
    <div class="print-pedido">
      <div class="print-pedido-header">
        <img src="assets/logo-dark.png" class="print-pedido-logo" alt="Torun Pneus">
        <div class="print-pedido-title">PEDIDO DE COMPRA<div class="print-pedido-numero">N° ${escapeHtml(pedido.numero_pedido)}</div></div>
        <div class="print-pedido-data-box">DATA DO PEDIDO<div class="valor">${formatDateBR(pedido.data)}</div></div>
      </div>
      <div class="print-pedido-info">
        <div><b>Cliente:</b> ${escapeHtml(pedido.cliente || "—")}</div>
        <div><b>Razão social:</b> ${escapeHtml(pedido.razao_social || "—")}</div>
        <div><b>CNPJ/CPF:</b> ${escapeHtml(pedido.documento_cliente || "—")}</div>
        <div><b>Vendedor:</b> ${escapeHtml(pedido.vendedor || "—")}</div>
        <div><b>Endereço entrega:</b> ${escapeHtml(pedido.destino || "—")}</div>
        <div><b>Frete:</b> ${escapeHtml(pedido.condicao_frete || "—")}</div>
        <div><b>Finalidade:</b> ${escapeHtml(pedido.finalidade || "—")}</div>
        <div><b>Condição pagamento:</b> ${escapeHtml(pedido.condicao_pagamento || "—")}</div>
        <div><b>Forma pagamento:</b> ${escapeHtml(pedido.forma_pagamento || "—")}</div>
        <div><b>Prazo pagamento:</b> ${escapeHtml(pedido.prazo_pagamento || "—")}</div>
      </div>
      <table class="print-pedido-table">
        <thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Desc.</th><th>Valor total</th></tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>
      <div class="print-pedido-total"><span>Total</span><span>${formatMoney(total)}</span></div>
      ${(pedido.obs || pedido.obs_impressao_nf) ? `
        <div class="print-pedido-obs">
          ${pedido.obs ? `<div><b>Observações do pedido:</b> ${escapeHtml(pedido.obs)}</div>` : ""}
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
  document.getElementById("repFinalidade").value = "INDUSTRIALIZAÇÃO";
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
  ["repCatalogoRegiao", "repCatalogoCondicao"].forEach(id => {
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

  document.getElementById("formPedidoRepresentante").addEventListener("submit", async (e) => {
    e.preventDefault();
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
    const marcarReserva = document.getElementById("repMarcarReserva").checked;

    const btnSalvar = document.getElementById("btnSalvarPedidoRep");
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";

    const { data: numeroData, error: numeroError } = await sb.rpc("proximo_numero_pedido_representante");
    if (numeroError) {
      toast("Erro ao gerar número do pedido: " + numeroError.message);
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar pedido";
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
      finalidade: document.getElementById("repFinalidade").value.trim() || null,
      condicao_pagamento: document.getElementById("repCondicaoPagamento").value.trim() || null,
      forma_pagamento: document.getElementById("repFormaPagamento").value.trim() || null,
      prazo_pagamento: document.getElementById("repPrazoPagamento").value.trim() || null,
      obs: document.getElementById("repObs").value.trim() || null,
      obs_impressao_nf: document.getElementById("repObsImpressaoNF").value.trim() || null,
      itens,
      etapa: "ENTRADA",
      cte_status: "aguardando",
      origem: "representante",
      created_by: currentUser.id,
      reserva: marcarReserva,
      reserva_status: marcarReserva ? "pendente" : null,
      reserva_expira_em: marcarReserva ? new Date(Date.now() + 72 * 3600 * 1000).toISOString() : null
    };

    const { error: insertError } = await sb.from("entregas").insert(payload).select();
    if (insertError) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar pedido";
      toast("Erro ao salvar pedido: " + insertError.message);
      return;
    }

    if (marcarReserva) {
      for (const it of itens) {
        const movPayload = {
          id: uid("mov"), data: todayISO(), tipo: "reserva", codigo: it.codigo, quantidade: it.quantidade,
          numero: numeroFormatado, pedido: numeroFormatado, processo: null,
          obs: `Reserva automática — Pedido de Compra do representante ${currentUserNome}, cliente ${clienteAtual.nome}`,
          created_by: currentUser.id, entrega_id: payload.id
        };
        const { error: movError } = await sb.from("movimentos").insert(movPayload);
        if (movError) {
          toast(`Pedido salvo, mas houve erro ao reservar o item ${it.codigo}: ${movError.message}. Avise o escritório.`);
        } else {
          movimentos.push(movPayload);
        }
      }
    }

    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar pedido";

    ultimoPedidoSalvo = payload;
    document.getElementById("repNumeroConfirmado").textContent = numeroFormatado;
    document.getElementById("repNumeroPedido").textContent = numeroFormatado;
    document.getElementById("formPedidoRepresentante").style.display = "none";
    document.getElementById("repConfirmacao").style.display = "flex";
    document.getElementById("repConfirmacaoReserva").style.display = marcarReserva ? "block" : "none";
    renderRepEstoque();
    entregas.unshift(payload);
    renderRepEntregas();
    acompanhamentoSelecionadoId = payload.id;
    renderAcompanhamento();
  });
}

/* ---------------- abas ---------------- */

const REP_TAB_IDS = {
  pedido: "repTabPedido", estoque: "repTabEstoque", catalogo: "repTabCatalogo", entregas: "repTabEntregas",
  precadastro: "repTabPreCadastro", acompanhamento: "repTabAcompanhamento"
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
    });
  });
}

/* ---------------- estoque (somente leitura) ---------------- */

function computeSaldoProduto(codigo) {
  return movimentos
    .filter(m => m.codigo === codigo)
    .reduce((saldo, m) => saldo + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)), 0);
}

function initRepEstoque() {
  document.getElementById("repEstoqueSearch").addEventListener("input", renderRepEstoque);
}

function renderRepEstoque() {
  const search = (document.getElementById("repEstoqueSearch").value || "").trim().toLowerCase();
  let rows = produtos.map(p => ({ codigo: p.codigo, medida: p.medida, saldo: computeSaldoProduto(p.codigo) }));
  if (search) {
    rows = rows.filter(r => [r.codigo, r.medida].join(" ").toLowerCase().includes(search));
  }
  rows.sort((a, b) => a.codigo.localeCompare(b.codigo));

  document.getElementById("repEstoqueEmpty").style.display = rows.length ? "none" : "block";
  document.getElementById("repEstoqueTbody").innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.codigo)}</td>
      <td>${escapeHtml(r.medida)}</td>
      <td class="num mono">${fmt(r.saldo)}</td>
    </tr>
  `).join("");
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

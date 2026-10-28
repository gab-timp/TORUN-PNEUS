/* ---------------- CRM: perfil do cliente ---------------- */
/* Assistente de cadastro (adicionar cliente à carteira e editar o perfil) e as abas Perfil, Fiscal e financeiro e
   Raio-X comercial da ficha. Usa o estado e os helpers de crm.js (carregado antes). As tabelas vêm de
   sql/crm_perfil_cliente.sql; sem elas a ficha avisa que o perfil não está disponível e o resto do CRM segue normal. */

const CRM_SEGMENTOS = ["Revenda", "Auto Center", "Reformadora", "Borracharia", "Transportadora", "Frota", "Agro", "Indústria", "Outros"];
const CRM_PORTES = ["Pequeno", "Médio", "Grande"];
const CRM_REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real"];
const CRM_INADIMPLENCIAS = ["Nenhuma", "Em atraso", "Protestado"];
const CRM_UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const CRM_FUNCOES = ["Proprietário", "Comprador / fechador", "Financeiro", "Fiscal", "Estoque", "Outros"];
const CRM_TIPOS_PNEU = ["Carga", "Passeio", "Agrícola", "OTR", "Moto", "Remold"];
const CRM_DIAS_ALERTA_TTD = 60;

// passos do assistente: chave -> rótulo. "carteira" só existe ao adicionar; "contatos" só ao adicionar (na ficha os
// contatos têm a janela própria da aba Atividade).
const CRM_WIZ_PASSOS = [
  ["carteira", "Cliente"], ["cadastro", "Dados cadastrais"], ["perfil", "Perfil"], ["fiscal", "Fiscal"],
  ["comercial", "Comercial"], ["contatos", "Contatos"], ["financeiro", "Financeiro"], ["inteligencia", "Inteligência"]
];

/* ---------------- leitura e gravação ---------------- */

function crmPerfilFromRow(r) {
  return {
    razaoSocial: r.razao_social || "", nomeFantasia: r.nome_fantasia || "", cnpj: r.cnpj || "",
    inscricaoEstadual: r.inscricao_estadual || "", cnae: r.cnae || "", regime: r.regime_tributario || "",
    cep: r.cep || "", cidadeUf: r.cidade_uf || "", endereco: r.endereco || "",
    segmento: r.segmento || "", tempoMercado: r.tempo_mercado_anos != null ? String(r.tempo_mercado_anos) : "",
    porte: r.porte || "", funcionarios: r.funcionarios != null ? String(r.funcionarios) : "",
    possuiTtd: r.possui_ttd === true ? "sim" : r.possui_ttd === false ? "nao" : "",
    ttdNumero: r.ttd_numero || "", ttdVencimento: r.ttd_vencimento || "",
    faturaSemSt: r.fatura_sem_st === true ? "sim" : r.fatura_sem_st === false ? "nao" : "",
    estados: Array.isArray(r.estados_beneficio) ? r.estados_beneficio.slice() : [], obsFiscal: r.obs_fiscal || "",
    obsCrescimento: r.obs_crescimento || "",
    clienteDesde: r.cliente_desde ? String(r.cliente_desde).slice(0, 7) : "", condicao: r.condicao_pagamento || "",
    limite: r.limite_credito != null ? crmNumParaBR(Number(r.limite_credito)) : "", inadimplencia: r.inadimplencia || "",
    obsFinanceiro: r.obs_financeiro || "", concorrentes: r.concorrentes || "", ficarNoPe: r.ficar_no_pe || ""
  };
}

const crmTxt = v => { const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return t || null; };
const crmInt = v => { const n = parseInt(String(v == null ? "" : v).trim(), 10); return Number.isFinite(n) && n >= 0 ? n : null; };
const crmSimNao = v => (v === "sim" ? true : v === "nao" ? false : null);

// "250.000,00" -> 250000 ; 250000 -> "250.000,00"
function crmNumDeBR(v) {
  const t = String(v == null ? "" : v).trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function crmNumParaBR(n) { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

function crmPerfilToRow(cliente, d) {
  return {
    cliente,
    razao_social: crmTxt(d.razaoSocial), nome_fantasia: crmTxt(d.nomeFantasia), cnpj: crmTxt(d.cnpj),
    inscricao_estadual: crmTxt(d.inscricaoEstadual), cnae: crmTxt(d.cnae), regime_tributario: crmTxt(d.regime),
    cep: crmTxt(d.cep), cidade_uf: crmTxt(d.cidadeUf), endereco: crmTxt(d.endereco),
    segmento: crmTxt(d.segmento), tempo_mercado_anos: crmInt(d.tempoMercado), porte: crmTxt(d.porte), funcionarios: crmInt(d.funcionarios),
    possui_ttd: crmSimNao(d.possuiTtd), ttd_numero: d.possuiTtd === "sim" ? crmTxt(d.ttdNumero) : null,
    ttd_vencimento: d.possuiTtd === "sim" && d.ttdVencimento ? d.ttdVencimento : null,
    fatura_sem_st: crmSimNao(d.faturaSemSt), estados_beneficio: d.estados || [], obs_fiscal: crmTxt(d.obsFiscal),
    obs_crescimento: crmTxt(d.obsCrescimento),
    cliente_desde: d.clienteDesde ? d.clienteDesde + "-01" : null, condicao_pagamento: crmTxt(d.condicao),
    limite_credito: crmNumDeBR(d.limite), inadimplencia: crmTxt(d.inadimplencia), obs_financeiro: crmTxt(d.obsFinanceiro),
    concorrentes: crmTxt(d.concorrentes), ficar_no_pe: crmTxt(d.ficarNoPe),
    updated_at: new Date().toISOString(), updated_by: currentUser ? currentUser.id : null
  };
}

async function crmCarregarPerfis() {
  const [p, f, n] = await Promise.all([
    sb.from("crm_cliente_perfil").select("*"),
    selectTudoPaginado("crm_cliente_filiais", "created_at"),
    selectTudoPaginado("crm_cliente_pneus", "created_at")
  ]);
  const erro = p.error || f.error || n.error;
  if (erro) {
    crmState.perfilIndisponivel = true;
    crmState.perfis = new Map();
    crmState.filiais = [];
    crmState.pneus = [];
    console.warn("Perfil do cliente indisponível:", erro.message);
    return;
  }
  crmState.perfilIndisponivel = false;
  crmState.perfis = new Map((p.data || []).map(r => [r.cliente, crmPerfilFromRow(r)]));
  const ordenar = (a, b) => (a.ordem - b.ordem) || (a.createdAt || "").localeCompare(b.createdAt || "");
  crmState.filiais = (f.data || []).map(r => ({ id: r.id, cliente: r.cliente, cnpj: r.cnpj || "", cidadeUf: r.cidade_uf || "", ordem: r.ordem || 0, createdAt: r.created_at })).sort(ordenar);
  crmState.pneus = (n.data || []).map(r => ({
    id: r.id, cliente: r.cliente, tipo: r.tipo, marcas: r.marcas_fornecedores || "",
    compra: r.compra_mes != null ? String(r.compra_mes) : "", potencial: r.potencial_mes != null ? String(r.potencial_mes) : "",
    ordem: r.ordem || 0, createdAt: r.created_at
  })).sort(ordenar);
}

// grava perfil + filiais + Raio-X de um cliente. Devolve null se deu certo, ou a mensagem do erro.
async function crmGravarPerfil(cliente, d, filiais, pneus) {
  const up = await sb.from("crm_cliente_perfil").upsert(crmPerfilToRow(cliente, d), { onConflict: "cliente" }).select();
  if (up.error) return up.error.message;
  if (!up.data || !up.data[0]) return "sem permissão para gravar o perfil";

  const filiaisOk = filiais.filter(x => crmTxt(x.cnpj) || crmTxt(x.cidadeUf));
  const pneusOk = pneus.filter(x => crmTxt(x.tipo));

  const trocar = async (tabela, linhas) => {
    const antigos = await sb.from(tabela).select("id").eq("cliente", cliente);
    if (antigos.error) return antigos.error.message;
    let novos = [];
    if (linhas.length) {
      const ins = await sb.from(tabela).insert(linhas).select("id");
      if (ins.error) return ins.error.message;
      novos = (ins.data || []).map(r => r.id);
    }
    const apagar = (antigos.data || []).map(r => r.id).filter(id => !novos.includes(id));
    if (apagar.length) {
      const del = await sb.from(tabela).delete().in("id", apagar).select("id");
      if (del.error) return del.error.message;
    }
    return null;
  };
  const erroF = await trocar("crm_cliente_filiais", filiaisOk.map((x, i) => ({ cliente, cnpj: crmTxt(x.cnpj), cidade_uf: crmTxt(x.cidadeUf), ordem: i })));
  if (erroF) return erroF;
  const erroP = await trocar("crm_cliente_pneus", pneusOk.map((x, i) => ({
    cliente, tipo: crmTxt(x.tipo), marcas_fornecedores: crmTxt(x.marcas), compra_mes: crmInt(x.compra), potencial_mes: crmInt(x.potencial), ordem: i
  })));
  if (erroP) return erroP;
  await crmCarregarPerfis();
  return null;
}

/* ---------------- assistente ---------------- */

let crmWizAbertura = 0;
const crmWiz = {
  modo: null,         // 'novo' | 'editar'
  passo: 0,           // índice em crmWiz.passos
  passos: [],         // [chave, rótulo]
  cliente: null,
  d: {}, filiais: [], pneus: [], contatos: [],
  ocupados: new Map(), execs: [], execId: "", outro: false, busca: "",
  salvando: false,
  sujo: false         // algo foi digitado ou escolhido: fechar pede confirmação
};

const crmWizPerfilVazio = () => ({
  razaoSocial: "", nomeFantasia: "", cnpj: "", inscricaoEstadual: "", cnae: "", regime: "", cep: "", cidadeUf: "", endereco: "",
  segmento: "", tempoMercado: "", porte: "", funcionarios: "", possuiTtd: "", ttdNumero: "", ttdVencimento: "", faturaSemSt: "",
  estados: [], obsFiscal: "", obsCrescimento: "", clienteDesde: "", condicao: "", limite: "", inadimplencia: "", obsFinanceiro: "",
  concorrentes: "", ficarNoPe: ""
});

// preenche com o que o Torun já sabe do cliente, sem sobrescrever o que o perfil do CRM já tem
function crmWizCarregarCliente(nome) {
  const cl = crmInfoCliente(nome);
  const existente = crmState.perfis.get(nome);
  const d = Object.assign(crmWizPerfilVazio(), existente ? JSON.parse(JSON.stringify(existente)) : {});
  if (!d.razaoSocial) d.razaoSocial = cl.razaoSocial || "";
  if (!d.nomeFantasia) d.nomeFantasia = cl.nome || nome;
  if (!d.cnpj) d.cnpj = cl.documento || "";
  if (!d.cep) d.cep = cl.cep || "";
  if (!d.endereco) d.endereco = cl.endereco || "";
  if (!d.cidadeUf) d.cidadeUf = [cl.cidade, cl.estado].filter(Boolean).join(" / ");
  if (!d.limite && cl.limiteCredito != null) d.limite = crmNumParaBR(cl.limiteCredito);
  crmWiz.d = d;
  crmWiz.filiais = crmState.filiais.filter(x => x.cliente === nome).map(x => ({ cnpj: x.cnpj, cidadeUf: x.cidadeUf }));
  crmWiz.pneus = crmState.pneus.filter(x => x.cliente === nome).map(x => ({ tipo: x.tipo, marcas: x.marcas, compra: x.compra, potencial: x.potencial }));
}

function crmWizContatosVazios() {
  return CRM_FUNCOES.map((f, i) => ({ funcao: f, nome: "", telefone: "", email: "", decisor: i === 0 }));
}

async function crmAbrirAdicionar() {
  if (!crmPodeGerirCarteira()) return;
  const s = crmSistemaAtual();
  Object.assign(crmWiz, {
    modo: "novo", passo: 0, cliente: null, d: crmWizPerfilVazio(), filiais: [], pneus: [], contatos: crmWizContatosVazios(),
    ocupados: new Map(), execs: [], execId: "", outro: false, busca: "", salvando: false, sujo: false,
    passos: CRM_WIZ_PASSOS.slice()
  });
  document.getElementById("crmAddHeader").textContent = "Adicionar cliente à carteira";
  document.getElementById("crmWizSub").textContent = "Carteira " + CRM_SISTEMAS[s] + ". Preencha o que souber agora; o resto dá para completar depois na ficha.";
  crmWizErro("");
  document.getElementById("crmAddOverlay").classList.add("show");
  crmWizRender();
  const abertura = ++crmWizAbertura;

  const [ocupados, execs] = await Promise.all([
    sb.rpc("crm_carteira_ocupada", { p_sistema: s }),
    crmEhExecutivo() ? Promise.resolve({ data: [] }) : sb.rpc("crm_executivos", { p_sistema: s })
  ]);
  if (abertura !== crmWizAbertura || crmWiz.modo !== "novo") return;
  if (ocupados.error) toast("Não deu pra conferir quem já tem cada cliente: " + ocupados.error.message);
  crmWiz.ocupados = new Map((ocupados.data || []).map(r => [r.cliente, r.executivo_nome || "outro executivo"]));
  crmWiz.execs = (execs.data || []).map(r => ({ id: r.user_id, nome: r.nome }));
  if (crmWiz.modo === "novo" && crmWiz.passos[crmWiz.passo][0] === "carteira") crmWizRender();
}

// abre o assistente num cliente que já está na carteira, direto no passo pedido
function crmAbrirPerfil(cliente, chave) {
  if (!crmPodeGerirCarteira()) return;
  crmWizAbertura++;
  const passos = CRM_WIZ_PASSOS.filter(p => p[0] !== "carteira" && p[0] !== "contatos");
  Object.assign(crmWiz, { modo: "editar", cliente, contatos: [], ocupados: new Map(), execs: [], execId: "", outro: false, busca: "", salvando: false, sujo: false, passos });
  crmWizCarregarCliente(cliente);
  const i = passos.findIndex(p => p[0] === chave);
  crmWiz.passo = i >= 0 ? i : 0;
  document.getElementById("crmAddHeader").textContent = "Editar perfil do cliente";
  document.getElementById("crmWizSub").textContent = cliente;
  crmWizErro("");
  document.getElementById("crmAddOverlay").classList.add("show");
  crmWizRender();
}

// fecha sem perguntar (depois de salvar)
function crmFecharAdicionar() {
  document.getElementById("crmWizConfirma").hidden = true;
  document.getElementById("crmAddOverlay").classList.remove("show");
}

// X e Cancelar: se já tem algo preenchido, pergunta antes de descartar
function crmWizPedirFechar() {
  if (crmWiz.salvando) return;
  if (!crmWiz.sujo) { crmFecharAdicionar(); return; }
  document.getElementById("crmWizConfirma").hidden = false;
  document.getElementById("crmWizConfirmaNao").focus();
}

function crmWizErro(msg) {
  const el = document.getElementById("crmAddErro");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function crmWizChave() { return crmWiz.passos[crmWiz.passo][0]; }

function crmWizRender() {
  const total = crmWiz.passos.length;
  document.getElementById("crmWizTrilha").innerHTML = crmWiz.passos.map(([, rot], i) =>
    `<li><button type="button" class="${i < crmWiz.passo ? "feito" : i === crmWiz.passo ? "atual" : ""}" data-wizir="${i}" ${i === crmWiz.passo ? 'aria-current="step"' : ""}><i></i><span>${i + 1}. ${escapeHtml(rot)}</span></button></li>`
  ).join("");
  document.getElementById("crmWizCorpo").innerHTML = crmWizPassoHtml(crmWizChave());
  document.getElementById("crmWizVoltar").disabled = crmWiz.passo === 0;
  document.getElementById("crmWizProximo").textContent = crmWiz.passo === total - 1 ? (crmWiz.modo === "novo" ? "Adicionar à carteira" : "Salvar") : "Próximo";
  document.getElementById("crmWizDica").textContent = `Etapa ${crmWiz.passo + 1} de ${total}`;
  crmWizAtualizarGap();
  if (crmWizChave() === "carteira") crmWizRenderBusca();
}

const crmOpts = (lista, atual, vazio) => `<option value="">${vazio || "Selecione…"}</option>` + lista.map(o => `<option value="${escapeAttr(o)}" ${o === atual ? "selected" : ""}>${escapeHtml(o)}</option>`).join("");
const crmWizCampo = (rot, chave, extra) => `<div class="field"><label>${rot}</label><input type="text" data-w="${chave}" value="${escapeAttr(crmWiz.d[chave])}" autocomplete="off" ${extra || ""}></div>`;
const crmWizSelect = (rot, chave, lista) => `<div class="field"><label>${rot}</label><select data-w="${chave}">${crmOpts(lista, crmWiz.d[chave])}</select></div>`;
const crmWizTexto = (rot, chave) => `<div class="field"><label>${rot}</label><textarea data-w="${chave}" rows="3">${escapeHtml(crmWiz.d[chave])}</textarea></div>`;

function crmWizPassoHtml(chave) {
  const d = crmWiz.d;
  if (chave === "carteira") {
    const s = crmSistemaAtual();
    return `
      <h4 class="crm-wiz-titulo">Qual cliente entra na carteira?</h4>
      <p class="muted sv-sub">Escolha um cliente que já existe no cadastro do Torun. Ele ainda não aparece aqui? Cadastre antes em Varejo, tela Clientes.</p>
      <div class="field"><label for="crmWizBusca">Buscar pelo nome</label><input type="text" id="crmWizBusca" value="${escapeAttr(crmWiz.busca)}" autocomplete="off"></div>
      <div class="crm-add-resultados" id="crmWizResultados"></div>
      <div class="crm-add-selecionado" id="crmWizSelecionado"></div>
      ${crmEhExecutivo() ? "" : `<div class="field"><label>Executivo responsável</label><select id="crmWizExec">${crmWiz.execs.length
        ? `<option value="">Selecione…</option>` + crmWiz.execs.map(e => `<option value="${escapeAttr(e.id)}" ${e.id === crmWiz.execId ? "selected" : ""}>${escapeHtml(e.nome)}${e.id === crmMeuId() ? " (eu)" : ""}</option>`).join("")
        : `<option value="">Nenhum executivo cadastrado neste sistema</option>`}</select></div>`}
      <label class="crm-add-outro"><input type="checkbox" id="crmWizOutro" ${crmWiz.outro ? "checked" : ""}> Este cliente também compra no outro sistema (${CRM_SISTEMAS[s === "atacado" ? "encomenda" : "atacado"]})</label>`;
  }
  if (chave === "cadastro") {
    return `
      <h4 class="crm-wiz-titulo">Dados cadastrais</h4>
      <div class="crm-wiz-grade">
        ${crmWizCampo("CNPJ", "cnpj")}${crmWizCampo("Inscrição estadual", "inscricaoEstadual")}
        ${crmWizCampo("Razão social", "razaoSocial")}${crmWizCampo("Nome fantasia", "nomeFantasia")}
        ${crmWizCampo("CNAE", "cnae")}${crmWizSelect("Regime tributário", "regime", CRM_REGIMES)}
        ${crmWizCampo("CEP", "cep")}${crmWizCampo("Cidade / UF", "cidadeUf")}
        <div class="field crm-wiz-cheio"><label>Endereço</label><input type="text" data-w="endereco" value="${escapeAttr(d.endereco)}" autocomplete="off"></div>
      </div>
      <h4 class="crm-wiz-sub">Filiais</h4>
      <div class="crm-wiz-lista">
        ${crmWiz.filiais.length ? `<div class="crm-wiz-cab crm-wiz-fil"><span>CNPJ</span><span>Cidade / UF</span><span></span></div>` : `<div class="muted sv-sub">Nenhuma filial cadastrada.</div>`}
        ${crmWiz.filiais.map((x, i) => `<div class="crm-wiz-linha crm-wiz-fil">
          <input type="text" data-wl="filiais" data-i="${i}" data-f="cnpj" value="${escapeAttr(x.cnpj)}" placeholder="00.000.000/0000-00" aria-label="CNPJ da filial ${i + 1}">
          <input type="text" data-wl="filiais" data-i="${i}" data-f="cidadeUf" value="${escapeAttr(x.cidadeUf)}" placeholder="Cidade / UF" aria-label="Cidade da filial ${i + 1}">
          <button type="button" class="crm-wiz-x" data-wdel="filiais" data-i="${i}" aria-label="Remover filial ${i + 1}">✕</button></div>`).join("")}
      </div>
      <button type="button" class="btn small outline" data-wadd="filiais">+ Adicionar filial</button>`;
  }
  if (chave === "perfil") {
    return `
      <h4 class="crm-wiz-titulo">Perfil do cliente</h4>
      <div class="field"><label>Segmento</label>
        <div class="crm-chips" role="radiogroup" aria-label="Segmento">${CRM_SEGMENTOS.map(sg => `<button type="button" class="crm-chip ${d.segmento === sg ? "on" : ""}" role="radio" aria-checked="${d.segmento === sg}" data-wseg="${escapeAttr(sg)}">${escapeHtml(sg)}</button>`).join("")}</div></div>
      <div class="crm-wiz-grade">
        <div class="field"><label>Tempo de mercado (anos)</label><input type="number" min="0" data-w="tempoMercado" value="${escapeAttr(d.tempoMercado)}"></div>
        ${crmWizSelect("Porte da empresa", "porte", CRM_PORTES)}
        <div class="field"><label>Quantidade de funcionários</label><input type="number" min="0" data-w="funcionarios" value="${escapeAttr(d.funcionarios)}"></div>
      </div>`;
  }
  if (chave === "fiscal") {
    const ttd = d.possuiTtd === "sim";
    return `
      <h4 class="crm-wiz-titulo">Perfil fiscal</h4>
      <div class="crm-wiz-grade">
        <div class="field"><label>Possui TTD</label><select data-w="possuiTtd" data-wrender="1"><option value="">Selecione…</option><option value="sim" ${d.possuiTtd === "sim" ? "selected" : ""}>Sim</option><option value="nao" ${d.possuiTtd === "nao" ? "selected" : ""}>Não</option></select></div>
        <div class="field"><label>Pode faturar sem ST</label><select data-w="faturaSemSt"><option value="">Selecione…</option><option value="sim" ${d.faturaSemSt === "sim" ? "selected" : ""}>Sim</option><option value="nao" ${d.faturaSemSt === "nao" ? "selected" : ""}>Não</option></select></div>
        ${ttd ? `${crmWizCampo("Número do TTD", "ttdNumero")}<div class="field"><label>Vencimento do TTD</label><input type="date" data-w="ttdVencimento" value="${escapeAttr(d.ttdVencimento)}"></div>` : ""}
      </div>
      <div class="field"><label>Estados com benefício fiscal</label>
        <div class="crm-chips">${CRM_UFS.map(uf => `<button type="button" class="crm-chip ${d.estados.includes(uf) ? "on" : ""}" aria-pressed="${d.estados.includes(uf)}" data-wuf="${uf}">${uf}</button>`).join("")}</div></div>
      ${crmWizTexto("Observações fiscais", "obsFiscal")}`;
  }
  if (chave === "comercial") {
    return `
      <h4 class="crm-wiz-titulo">Perfil comercial</h4>
      <p class="muted sv-sub">O que ele compra por mês, por tipo de pneu. O gap é o potencial menos o que ele já compra.</p>
      <datalist id="crmWizTipos">${CRM_TIPOS_PNEU.map(t => `<option value="${t}">`).join("")}</datalist>
      <div class="crm-wiz-lista">
        ${crmWiz.pneus.length ? `<div class="crm-wiz-cab crm-wiz-pn"><span>Tipo de pneu</span><span>Marcas e fornecedores</span><span>Compra/mês</span><span>Potencial/mês</span><span></span></div>` : `<div class="muted sv-sub">Nenhum tipo de pneu cadastrado.</div>`}
        ${crmWiz.pneus.map((x, i) => `<div class="crm-wiz-linha crm-wiz-pn">
          <input type="text" list="crmWizTipos" data-wl="pneus" data-i="${i}" data-f="tipo" value="${escapeAttr(x.tipo)}" placeholder="Ex.: Carga" aria-label="Tipo de pneu ${i + 1}">
          <input type="text" data-wl="pneus" data-i="${i}" data-f="marcas" value="${escapeAttr(x.marcas)}" placeholder="Marcas · fornecedores" aria-label="Marcas e fornecedores ${i + 1}">
          <input type="number" min="0" data-wl="pneus" data-i="${i}" data-f="compra" value="${escapeAttr(x.compra)}" placeholder="Compra/mês" aria-label="Compra por mês ${i + 1}">
          <input type="number" min="0" data-wl="pneus" data-i="${i}" data-f="potencial" value="${escapeAttr(x.potencial)}" placeholder="Potencial/mês" aria-label="Potencial por mês ${i + 1}">
          <button type="button" class="crm-wiz-x" data-wdel="pneus" data-i="${i}" aria-label="Remover tipo ${i + 1}">✕</button></div>`).join("")}
      </div>
      <button type="button" class="btn small outline" data-wadd="pneus">+ Adicionar tipo de pneu</button>
      <div class="crm-wiz-gap"><span>Gap total para ampliar a atuação</span><b id="crmWizGap"></b></div>
      ${crmWizTexto("Onde enxergamos espaço para crescer", "obsCrescimento")}`;
  }
  if (chave === "contatos") {
    return `
      <h4 class="crm-wiz-titulo">Contatos</h4>
      <p class="muted sv-sub">Telefone e e-mail de cada função. Marque quem decide a compra. Informe pelo menos o nome de um contato.</p>
      <div class="crm-wiz-lista">
        <div class="crm-wiz-cab crm-wiz-ct"><span>Função</span><span>Nome</span><span>Telefone</span><span>E-mail</span><span>Decisor</span></div>
        ${crmWiz.contatos.map((x, i) => `<div class="crm-wiz-linha crm-wiz-ct">
          <b>${escapeHtml(x.funcao)}</b>
          <input type="text" data-wl="contatos" data-i="${i}" data-f="nome" value="${escapeAttr(x.nome)}" placeholder="Nome" aria-label="Nome (${escapeAttr(x.funcao)})">
          <input type="text" data-wl="contatos" data-i="${i}" data-f="telefone" value="${escapeAttr(x.telefone)}" placeholder="Telefone" aria-label="Telefone (${escapeAttr(x.funcao)})">
          <input type="email" data-wl="contatos" data-i="${i}" data-f="email" value="${escapeAttr(x.email)}" placeholder="E-mail" aria-label="E-mail (${escapeAttr(x.funcao)})">
          <label class="crm-wiz-dec"><input type="radio" name="crmWizDecisor" data-wdec="${i}" ${x.decisor ? "checked" : ""} aria-label="Decisor: ${escapeAttr(x.funcao)}"><span>Decisor</span></label></div>`).join("")}
      </div>`;
  }
  if (chave === "financeiro") {
    return `
      <h4 class="crm-wiz-titulo">Financeiro</h4>
      <div class="crm-wiz-grade">
        <div class="field"><label>Cliente desde</label><input type="month" data-w="clienteDesde" value="${escapeAttr(d.clienteDesde)}"></div>
        ${crmWizSelect("Inadimplência", "inadimplencia", CRM_INADIMPLENCIAS)}
        ${crmWizCampo("Condição de pagamento", "condicao", 'placeholder="Ex.: 28/35/42 dias"')}
        ${crmWizCampo("Limite de crédito (R$)", "limite", 'inputmode="decimal" placeholder="0,00"')}
      </div>
      ${crmWizTexto("Observações", "obsFinanceiro")}`;
  }
  return `
    <h4 class="crm-wiz-titulo">Inteligência comercial</h4>
    <p class="muted sv-sub">O que a equipe precisa lembrar na próxima conversa.</p>
    <div class="field"><label>Concorrentes</label><input type="text" data-w="concorrentes" value="${escapeAttr(d.concorrentes)}" autocomplete="off" placeholder="Separe por vírgula"></div>
    ${crmWizTexto("O que ficar no pé para ofertar", "ficarNoPe")}`;
}

function crmWizAtualizarGap() {
  const el = document.getElementById("crmWizGap");
  if (!el) return;
  const g = crmWiz.pneus.reduce((t, x) => t + (crmInt(x.potencial) || 0) - (crmInt(x.compra) || 0), 0);
  el.textContent = fmt(g) + " pneus/mês";
}

/* passo 1 (escolher o cliente) */
function crmWizRenderBusca() {
  const lista = document.getElementById("crmWizResultados");
  if (!lista) return;
  const busca = (crmWiz.busca || "").trim().toLowerCase();
  const achados = (state.clientes || []).filter(cl => !busca || cl.nome.toLowerCase().includes(busca)).slice(0, 40);
  lista.innerHTML = achados.length ? achados.map(cl => {
    const dono = crmWiz.ocupados.get(cl.nome);
    const cidade = [cl.cidade, cl.estado].filter(Boolean).join("/");
    if (dono) return `<div class="crm-add-res crm-add-ocupado"><b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml(cidade)}</div><div class="crm-add-aviso">Já está na carteira de ${escapeHtml(dono)}</div></div>`;
    const on = crmWiz.cliente === cl.nome;
    return `<button type="button" class="crm-add-res ${on ? "on" : ""}" data-wizcli="${escapeAttr(cl.nome)}" aria-pressed="${on}"><b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml(cidade)}</div></button>`;
  }).join("") : `<div class="muted sv-sub">Nenhum cliente com esse nome no cadastro do Torun.</div>`;
  const cl = crmWiz.cliente ? crmInfoCliente(crmWiz.cliente) : null;
  document.getElementById("crmWizSelecionado").innerHTML = cl && cl.nome
    ? `<b>${escapeHtml(cl.nome)}</b><div class="muted sv-sub">${escapeHtml([cl.cidade, cl.estado].filter(Boolean).join("/"))} · do cadastro do Torun</div>`
    : `<span class="muted">Nenhum cliente escolhido ainda.</span>`;
}

function crmWizValidar(chave) {
  if (chave === "carteira") {
    if (!crmWiz.cliente) return "Escolha um cliente do cadastro do Torun.";
    if (!crmEhExecutivo() && !crmWiz.execs.some(e => e.id === crmWiz.execId)) return "Escolha o executivo responsável.";
  }
  if (chave === "contatos" && !crmWiz.contatos.some(c => crmTxt(c.nome))) return "Informe pelo menos o nome de um contato.";
  if (chave === "financeiro" && crmTxt(crmWiz.d.limite) && crmNumDeBR(crmWiz.d.limite) === null) return "O limite de crédito precisa ser um valor, como 250.000,00.";
  return "";
}

function crmWizIr(i) {
  if (i === crmWiz.passo) return;
  if (i > crmWiz.passo) {
    for (let k = crmWiz.passo; k < i; k++) {
      const msg = crmWizValidar(crmWiz.passos[k][0]);
      if (msg) { crmWiz.passo = k; crmWizRender(); crmWizErro(msg); return; }
    }
  }
  crmWiz.passo = Math.max(0, Math.min(crmWiz.passos.length - 1, i));
  crmWizErro("");
  crmWizRender();
  const corpo = document.getElementById("crmWizCorpo");
  if (corpo) corpo.scrollTop = 0;
}

function crmWizProximo() {
  const msg = crmWizValidar(crmWizChave());
  if (msg) { crmWizErro(msg); return; }
  if (crmWiz.passo < crmWiz.passos.length - 1) { crmWizIr(crmWiz.passo + 1); return; }
  crmWizSalvar();
}

async function crmWizSalvar() {
  if (crmWiz.salvando) return;
  for (const [chave] of crmWiz.passos) {
    const msg = crmWizValidar(chave);
    if (msg) { crmWizIr(crmWiz.passos.findIndex(p => p[0] === chave)); crmWizErro(msg); return; }
  }
  crmWiz.salvando = true;
  const botao = document.getElementById("crmWizProximo");
  botao.disabled = true;
  try {
    if (crmWiz.modo === "editar") {
      const erro = await crmGravarPerfil(crmWiz.cliente, crmWiz.d, crmWiz.filiais, crmWiz.pneus);
      if (erro) { crmWizErro("Erro ao salvar o perfil: " + erro); return; }
      crmFecharAdicionar();
      crmRender();
      toast("Perfil salvo.");
      return;
    }
    await crmWizSalvarNovo();
  } finally {
    crmWiz.salvando = false;
    botao.disabled = false;
  }
}

async function crmWizSalvarNovo() {
  const s = crmSistemaAtual();
  const cliente = crmWiz.cliente;
  const preenchidos = crmWiz.contatos.filter(c => crmTxt(c.nome));
  const decisor = preenchidos.find(c => c.decisor) || preenchidos[0];

  let execId = currentUser.id, execNome = currentUserNome;
  if (!crmEhExecutivo()) {
    execId = crmWiz.execId;
    const e = crmWiz.execs.find(x => x.id === execId);
    if (!e) { crmWizErro("Escolha o executivo responsável."); return; }
    execNome = e.nome;
  }

  const cart = await sb.from("crm_carteira").insert({
    sistema: s, cliente, executivo_user_id: execId, executivo_nome: execNome,
    tambem_outro_sistema: crmWiz.outro, primeiro_followup: todayISO()
  }).select();
  if (cart.error) {
    crmWizErro(cart.error.code === "23505"
      ? "Esse cliente já está na carteira de outro executivo deste sistema."
      : "Erro ao adicionar à carteira: " + cart.error.message);
    return;
  }
  if (!cart.data || !cart.data[0]) { crmWizErro("Não foi possível adicionar (sem permissão)."); return; }
  crmState.carteira.push(crmCarteiraFromRow(cart.data[0]));

  const cont = await sb.from("crm_contatos").insert(preenchidos.map(c => ({
    sistema: s, cliente, nome: crmTxt(c.nome), cargo: c.funcao, telefone: crmTxt(c.telefone), whatsapp: null,
    email: crmTxt(c.email), principal: c === decisor
  }))).select();
  if (cont.error) toast("O cliente entrou na carteira, mas os contatos não foram salvos: " + cont.error.message);
  else (cont.data || []).forEach(r => crmState.contatos.push(crmContatoFromRow(r)));

  const erroPerfil = await crmGravarPerfil(cliente, crmWiz.d, crmWiz.filiais, crmWiz.pneus);
  if (erroPerfil) toast("O cliente entrou na carteira, mas o perfil não foi salvo: " + erroPerfil + ". Abra a ficha e use Editar.");

  crmReindexar();
  crmFecharAdicionar();
  crmRender();
  toast("Cliente adicionado à carteira.");
}

/* eventos do assistente */
function crmWizInit() {
  const corpo = document.getElementById("crmWizCorpo");

  corpo.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "crmWizBusca") { crmWiz.busca = t.value; crmWizRenderBusca(); return; }
    crmWiz.sujo = true;
    if (t.dataset.w) crmWiz.d[t.dataset.w] = t.value;
    else if (t.dataset.wl) {
      const lista = crmWiz[t.dataset.wl];
      if (lista && lista[Number(t.dataset.i)]) lista[Number(t.dataset.i)][t.dataset.f] = t.value;
      if (t.dataset.wl === "pneus") crmWizAtualizarGap();
    }
    crmWizErro("");
  });
  corpo.addEventListener("change", (e) => {
    const t = e.target;
    crmWiz.sujo = true;
    if (t.id === "crmWizExec") { crmWiz.execId = t.value; crmWizErro(""); }
    else if (t.id === "crmWizOutro") crmWiz.outro = t.checked;
    else if (t.dataset.w) {
      crmWiz.d[t.dataset.w] = t.value;
      if (t.dataset.wrender) crmWizRender();
    } else if (t.dataset.wdec !== undefined) crmWiz.contatos.forEach((c, i) => { c.decisor = i === Number(t.dataset.wdec); });
  });
  corpo.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.wizcli || b.dataset.wseg || b.dataset.wuf || b.dataset.wadd || b.dataset.wdel) crmWiz.sujo = true;
    if (b.dataset.wizcli) {
      if (crmWiz.cliente !== b.dataset.wizcli) { crmWiz.cliente = b.dataset.wizcli; crmWizCarregarCliente(crmWiz.cliente); }
      crmWizErro("");
      crmWizRenderBusca();
    } else if (b.dataset.wseg) {
      crmWiz.d.segmento = crmWiz.d.segmento === b.dataset.wseg ? "" : b.dataset.wseg;
      crmWizRender();
    } else if (b.dataset.wuf) {
      const k = crmWiz.d.estados.indexOf(b.dataset.wuf);
      if (k >= 0) crmWiz.d.estados.splice(k, 1); else crmWiz.d.estados.push(b.dataset.wuf);
      crmWiz.d.estados.sort();
      b.classList.toggle("on", k < 0);
      b.setAttribute("aria-pressed", String(k < 0));
    } else if (b.dataset.wadd) {
      crmWiz[b.dataset.wadd].push(b.dataset.wadd === "filiais" ? { cnpj: "", cidadeUf: "" } : { tipo: "", marcas: "", compra: "", potencial: "" });
      crmWizRender();
    } else if (b.dataset.wdel) {
      crmWiz[b.dataset.wdel].splice(Number(b.dataset.i), 1);
      crmWizRender();
    }
  });
  document.getElementById("crmWizTrilha").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wizir]");
    if (b) crmWizIr(Number(b.dataset.wizir));
  });
  document.getElementById("crmWizVoltar").addEventListener("click", () => crmWizIr(crmWiz.passo - 1));
  document.getElementById("crmWizProximo").addEventListener("click", crmWizProximo);
  document.getElementById("crmAddCancelar").addEventListener("click", crmWizPedirFechar);
  document.getElementById("crmAddFechar").addEventListener("click", crmWizPedirFechar);
  document.getElementById("crmWizConfirmaNao").addEventListener("click", () => { document.getElementById("crmWizConfirma").hidden = true; });
  document.getElementById("crmWizConfirmaSim").addEventListener("click", crmFecharAdicionar);

  // abas e botões de editar da ficha
  document.getElementById("crmFicha").addEventListener("click", (e) => {
    const aba = e.target.closest("[data-crmaba]");
    if (aba) { crmUi.fichaAba = aba.dataset.crmaba; crmRenderFicha(); return; }
    const ed = e.target.closest("[data-crmeditar]");
    if (ed) {
      const c = crmCarteiraPorId(crmUi.fichaId);
      if (c) crmAbrirPerfil(c.cliente, ed.dataset.crmeditar);
    }
  });
}

/* ---------------- ficha: abas ---------------- */

const CRM_ABAS = [["atividade", "Atividade"], ["perfil", "Perfil"], ["fiscal", "Fiscal e financeiro"], ["raiox", "Raio-X comercial"]];

function crmFichaAbasHtml() {
  return `<div class="crm-abas" role="tablist">${CRM_ABAS.map(([k, rot]) =>
    `<button type="button" role="tab" class="${crmUi.fichaAba === k ? "on" : ""}" aria-selected="${crmUi.fichaAba === k}" data-crmaba="${k}">${rot}</button>`).join("")}</div>`;
}

const crmDl = (linhas) => `<dl class="crm-dl">${linhas.map(([rot, val, mono]) => {
  const vazio = val === null || val === undefined || val === "";
  return `<dt>${rot}</dt><dd class="${vazio ? "vazio" : mono ? "mono" : ""}">${vazio ? "não informado" : val}</dd>`;
}).join("")}</dl>`;

function crmEditarLink(chave, titulo) {
  return crmPodeGerirCarteira() ? `<button type="button" class="sv-link" data-crmeditar="${chave}" aria-label="Editar ${titulo}">Editar</button>` : "";
}

function crmSimNaoTxt(v) { return v === "sim" ? "Sim" : v === "nao" ? "Não" : ""; }

function crmMesAno(ym) { return ym ? ym.slice(5, 7) + "/" + ym.slice(0, 4) : ""; }

function crmTtdAviso(p) {
  if (p.possuiTtd !== "sim" || !p.ttdVencimento) return "";
  const dias = Math.round((new Date(p.ttdVencimento + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
  if (dias > CRM_DIAS_ALERTA_TTD) return "";
  const data = formatDateBR(p.ttdVencimento);
  const txt = dias < 0 ? `O TTD venceu em ${data}. Avisar o fiscal para renovar.`
    : dias === 0 ? `O TTD vence hoje (${data}). Avisar o fiscal para renovar.`
    : `O TTD vence em ${dias} ${dias === 1 ? "dia" : "dias"} (${data}). Avisar o fiscal para renovar.`;
  return `<div class="crm-aviso${dias < 0 ? " crm-aviso-forte" : ""}">${escapeHtml(txt)}</div>`;
}

function crmFichaPerfilHtml(c, aba) {
  if (crmState.perfilIndisponivel) {
    return `<div class="card"><div class="empty-state">O perfil do cliente ainda não está disponível. Avise o administrador do sistema.</div></div>`;
  }
  const p = crmState.perfis.get(c.cliente);
  if (!p) {
    return `<div class="card"><div class="empty-state">O perfil deste cliente ainda não foi preenchido.
      ${crmPodeGerirCarteira() ? `<div style="margin-top:10px"><button type="button" class="btn primary" data-crmeditar="cadastro">Preencher perfil</button></div>` : ""}</div></div>`;
  }
  const mono = true;
  if (aba === "perfil") {
    const fil = crmState.filiais.filter(x => x.cliente === c.cliente);
    return `
      <div class="crm-ficha-duas">
        <div class="card">
          <div class="card-head"><h2>Dados cadastrais</h2>${crmEditarLink("cadastro", "dados cadastrais")}</div>
          ${crmDl([
            ["Razão social", escapeHtml(p.razaoSocial)], ["Nome fantasia", escapeHtml(p.nomeFantasia)], ["CNPJ", escapeHtml(p.cnpj), mono],
            ["Inscrição estadual", escapeHtml(p.inscricaoEstadual), mono], ["CNAE", escapeHtml(p.cnae)], ["Regime tributário", escapeHtml(p.regime)],
            ["Endereço", [p.endereco, [p.cidadeUf, p.cep].filter(Boolean).join(" · ")].filter(Boolean).map(escapeHtml).join("<br>")]
          ])}
        </div>
        <div class="card">
          <div class="card-head"><h2>Perfil do cliente</h2>${crmEditarLink("perfil", "perfil do cliente")}</div>
          ${crmDl([
            ["Segmento", escapeHtml(p.segmento)], ["Porte", escapeHtml(p.porte)],
            ["Tempo de mercado", p.tempoMercado !== "" ? escapeHtml(p.tempoMercado) + " anos" : ""],
            ["Funcionários", escapeHtml(p.funcionarios)], ["Cliente desde", escapeHtml(crmMesAno(p.clienteDesde))]
          ])}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Filiais · ${fil.length}</h2>${crmEditarLink("cadastro", "filiais")}</div>
        ${fil.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Unidade</th><th>CNPJ</th><th>Cidade / UF</th></tr></thead>
          <tbody>${fil.map((x, i) => `<tr><td>Filial ${i + 1}</td><td class="mono">${escapeHtml(x.cnpj)}</td><td>${escapeHtml(x.cidadeUf)}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty-state">Nenhuma filial cadastrada.</div>`}
      </div>`;
  }
  if (aba === "fiscal") {
    return `
      ${crmTtdAviso(p)}
      <div class="crm-ficha-duas">
        <div class="card">
          <div class="card-head"><h2>Perfil fiscal</h2>${crmEditarLink("fiscal", "perfil fiscal")}</div>
          ${crmDl([
            ["Possui TTD", crmSimNaoTxt(p.possuiTtd)],
            ...(p.possuiTtd === "sim" ? [["Número do TTD", escapeHtml(p.ttdNumero), mono], ["Vencimento", p.ttdVencimento ? formatDateBR(p.ttdVencimento) : "", mono]] : []),
            ["Faturar sem ST", crmSimNaoTxt(p.faturaSemSt)],
            ["Estados com benefício", p.estados.length ? p.estados.map(u => `<span class="status-pill pill-normal">${u}</span>`).join(" ") : ""],
            ["Observações", escapeHtml(p.obsFiscal)]
          ])}
        </div>
        <div class="card">
          <div class="card-head"><h2>Financeiro</h2>${crmEditarLink("financeiro", "financeiro")}</div>
          ${crmDl([
            ["Condição de pagamento", escapeHtml(p.condicao)],
            ["Limite de crédito", p.limite ? "R$ " + escapeHtml(p.limite) : "", mono],
            ["Inadimplência", escapeHtml(p.inadimplencia)],
            ["Observações", escapeHtml(p.obsFinanceiro)]
          ])}
        </div>
      </div>`;
  }
  // raio-x
  const pneus = crmState.pneus.filter(x => x.cliente === c.cliente);
  const tc = pneus.reduce((t, x) => t + (crmInt(x.compra) || 0), 0);
  const tp = pneus.reduce((t, x) => t + (crmInt(x.potencial) || 0), 0);
  const conc = String(p.concorrentes || "").split(",").map(x => x.trim()).filter(Boolean);
  return `
    <div class="card">
      <div class="card-head"><h2>O que ele compra por mês</h2>${crmEditarLink("comercial", "perfil comercial")}</div>
      ${pneus.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Tipo de pneu</th><th>Marcas e fornecedores</th><th class="num">Compra</th><th class="num">Potencial</th><th>Do potencial</th><th class="num">Gap</th></tr></thead>
        <tbody>${pneus.map(x => {
          const cm = crmInt(x.compra) || 0, pt = crmInt(x.potencial) || 0;
          const pc = pt > 0 ? Math.min(100, Math.round(cm / pt * 100)) : 0;
          return `<tr><td><b>${escapeHtml(x.tipo)}</b></td><td class="muted">${escapeHtml(x.marcas)}</td><td class="num mono">${fmt(cm)}</td><td class="num mono">${fmt(pt)}</td>
            <td><div class="crm-meter"><div class="crm-meter-barra" role="img" aria-label="${pc}% do potencial"><i style="width:${pc}%"></i></div><span class="mono">${pc}%</span></div></td>
            <td class="num mono crm-gap">${fmt(pt - cm)}</td></tr>`;
        }).join("")}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num mono">${fmt(tc)}</td><td class="num mono">${fmt(tp)}</td><td></td><td class="num mono crm-gap">${fmt(tp - tc)}</td></tr></tfoot>
      </table></div>
      <div class="note">Gap é o potencial menos o que ele já compra, em pneus por mês.</div>`
        : `<div class="empty-state">Nenhum tipo de pneu cadastrado ainda.</div>`}
    </div>
    <div class="crm-ficha-duas">
      <div class="card">
        <div class="card-head"><h2>Onde crescer</h2>${crmEditarLink("comercial", "onde crescer")}</div>
        ${p.obsCrescimento ? `<p class="crm-obs">${escapeHtml(p.obsCrescimento)}</p>` : `<div class="empty-state">Nada anotado.</div>`}
        ${crmDl([["O que ficar no pé", escapeHtml(p.ficarNoPe)]])}
      </div>
      <div class="card">
        <div class="card-head"><h2>Concorrentes</h2>${crmEditarLink("inteligencia", "concorrentes")}</div>
        ${conc.length ? `<div>${conc.map(x => `<span class="status-pill pill-normal crm-conc">${escapeHtml(x)}</span>`).join(" ")}</div>` : `<div class="empty-state">Nenhum concorrente anotado.</div>`}
      </div>
    </div>`;
}

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
const CRM_ORIGENS_LEAD = ["Indicação", "Feira", "Ligação ativa", "Instagram", "Site", "Outro"];
const CRM_DIAS_ALERTA_TTD = 60;

// passos do assistente: chave -> rótulo. "carteira" só existe ao adicionar; "contatos" só ao adicionar (na ficha os
// contatos têm a janela própria da aba Atividade).
const CRM_WIZ_PASSOS = [
  ["carteira", "Cliente"], ["cadastro", "Dados cadastrais"], ["perfil", "Perfil"], ["fiscal", "Fiscal"],
  ["comercial", "Comercial"], ["contatos", "Contatos"], ["financeiro", "Financeiro"], ["inteligencia", "Inteligência"]
];

// prospect: cadastro curto (sql/crm_prospects.sql); só vira cliente efetivo pela ficha
const CRM_WIZ_PASSOS_PROSPECT = [["carteira", "Cliente"], ["contatos", "Contato"], ["interesse", "Interesse"]];
// converter prospect em cliente efetivo e editar o perfil usam os mesmos passos (sem escolher cliente nem contatos)
const crmWizPassosPerfil = () => CRM_WIZ_PASSOS.filter(p => p[0] !== "carteira" && p[0] !== "contatos");

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
  modo: null,         // 'novo' | 'editar' | 'converter' (prospect -> cliente efetivo)
  tipo: "cliente",    // só no modo 'novo': 'cliente' (8 passos) | 'prospect' (3 passos)
  p: { origem: "", tipos: [], obs: "" }, // respostas do passo Interesse do prospect
  passo: 0,           // índice em crmWiz.passos
  passos: [],         // [chave, rótulo]
  cliente: null,
  d: {}, filiais: [], pneus: [], contatos: [],
  ocupados: new Map(), execs: [], execId: "", outro: false, busca: "",
  ocupadosOutro: new Map(), // quem tem o cliente no OUTRO sistema (só informativo)
  fonte: null,        // linha escolhida na lista do passo 1: 'crm' (já cadastrado) | 'torun' (importar) | 'novo' (cadastrar agora)
  selNome: null,      // nome do cliente escolhido (fonte crm ou torun)
  novo: { nome: "", documento: "", telefone: "", cidade: "", estado: "" },
  nomeAuto: false,    // o nome foi preenchido pelo CNPJ, não digitado
  infoNova: null,     // dados que viram a linha em crm_clientes quando a fonte é torun ou novo
  escolhaSig: "",
  salvando: false,
  sujo: false         // algo foi digitado ou escolhido: fechar pede confirmação
};

const crmWizPerfilVazio = () => ({
  razaoSocial: "", nomeFantasia: "", cnpj: "", inscricaoEstadual: "", cnae: "", regime: "", cep: "", cidadeUf: "", endereco: "",
  segmento: "", tempoMercado: "", porte: "", funcionarios: "", possuiTtd: "", ttdNumero: "", ttdVencimento: "", faturaSemSt: "",
  estados: [], obsFiscal: "", obsCrescimento: "", clienteDesde: "", condicao: "", limite: "", inadimplencia: "", obsFinanceiro: "",
  concorrentes: "", ficarNoPe: ""
});

// preenche com o que o cadastro já sabe do cliente (info: o cadastro do CRM, o do Torun ou o que foi digitado), sem
// sobrescrever o que o perfil do CRM já tem
function crmWizCarregarCliente(nome, info) {
  const cl = info || crmInfoCliente(nome);
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
    modo: "novo", tipo: "cliente", p: { origem: "", tipos: [], obs: "" }, passo: 0, cliente: null, d: crmWizPerfilVazio(), filiais: [], pneus: [], contatos: crmWizContatosVazios(),
    ocupados: new Map(), ocupadosOutro: new Map(), execs: [], execId: "", outro: false, busca: "", salvando: false, sujo: false,
    fonte: null, selNome: null,
    novo: { nome: "", documento: "", telefone: "", cidade: "", estado: "" }, infoNova: null, escolhaSig: "",
    passos: CRM_WIZ_PASSOS.slice()
  });
  document.getElementById("crmAddHeader").textContent = "Adicionar cliente à carteira";
  document.getElementById("crmWizSub").textContent = "Carteira " + CRM_SISTEMAS[s] + ". Preencha o que souber agora; o resto dá para completar depois na ficha.";
  crmWizErro("");
  document.getElementById("crmAddOverlay").classList.add("show");
  crmWizRender();
  const abertura = ++crmWizAbertura;

  const outroSistema = s === "atacado" ? "encomenda" : "atacado";
  const [ocupados, ocupadosOutro, execs] = await Promise.all([
    sb.rpc("crm_carteira_ocupada", { p_sistema: s }),
    sb.rpc("crm_carteira_ocupada", { p_sistema: outroSistema }),
    crmEhExecutivo() ? Promise.resolve({ data: [] }) : sb.rpc("crm_executivos", { p_sistema: s })
  ]);
  if (abertura !== crmWizAbertura || crmWiz.modo !== "novo") return;
  if (ocupados.error) toast("Não deu pra conferir quem já tem cada cliente: " + ocupados.error.message);
  crmWiz.ocupados = new Map((ocupados.data || []).map(r => [r.cliente, r.executivo_nome || "outro executivo"]));
  // executivo de um sistema só não enxerga o outro: a consulta volta vazia e o aviso simplesmente não aparece
  crmWiz.ocupadosOutro = new Map((ocupadosOutro.data || []).map(r => [r.cliente, r.executivo_nome || "outro executivo"]));
  crmWiz.execs = (execs.data || []).map(r => ({ id: r.user_id, nome: r.nome }));
  if (crmWiz.modo === "novo" && crmWiz.passos[crmWiz.passo][0] === "carteira") crmWizRender();
}

// abre o assistente num cliente que já está na carteira, direto no passo pedido
function crmAbrirPerfil(cliente, chave) {
  if (!crmPodeGerirCarteira()) return;
  crmWizAbertura++;
  const passos = crmWizPassosPerfil();
  Object.assign(crmWiz, { modo: "editar", cliente, contatos: [], ocupados: new Map(), ocupadosOutro: new Map(), execs: [], execId: "", outro: false, busca: "", salvando: false, sujo: false, infoNova: null, passos });
  crmWizCarregarCliente(cliente);
  const i = passos.findIndex(p => p[0] === chave);
  crmWiz.passo = i >= 0 ? i : 0;
  document.getElementById("crmAddHeader").textContent = "Editar perfil do cliente";
  document.getElementById("crmWizSub").textContent = cliente;
  crmWizErro("");
  document.getElementById("crmAddOverlay").classList.add("show");
  crmWizRender();
}

// "Tornar cliente efetivo": confirma e abre o assistente nos dados cadastrais, com o que o prospect já tinha
async function crmConverterProspect(cliente) {
  if (!crmPodeGerirCarteira() || !crmEhProspect(cliente)) return;
  const ok = await confirmModal("Tornar cliente efetivo",
    "O assistente abre nos dados cadastrais, com o contato e o interesse já preenchidos, e o CNPJ passa a ser obrigatório. As ligações e os contatos continuam no histórico, o cliente passa a aparecer no Faturamento e não volta a ser prospect depois de confirmado.",
    "Abrir assistente");
  if (!ok) return;
  crmWizAbertura++;
  Object.assign(crmWiz, { modo: "converter", cliente, contatos: [], ocupados: new Map(), ocupadosOutro: new Map(), execs: [], execId: "", outro: false, busca: "", salvando: false, sujo: false, infoNova: null, passos: crmWizPassosPerfil(), passo: 0 });
  crmWizCarregarCliente(cliente);
  // o que o prospect disse que compra vira a lista do passo Comercial, para só completar as quantidades
  const info = crmInfoCliente(cliente);
  if (!crmWiz.pneus.length) crmWiz.pneus = (info.interesseTipos || []).map(t => ({ tipo: t, marcas: "", compra: "", potencial: "" }));
  document.getElementById("crmAddHeader").textContent = "Tornar cliente efetivo";
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
  document.getElementById("crmWizProximo").textContent = crmWiz.passo === total - 1
    ? (crmWiz.modo === "converter" ? "Tornar cliente efetivo" : crmWiz.modo === "novo" ? (crmWiz.tipo === "prospect" ? "Salvar prospect" : "Adicionar à carteira") : "Salvar") : "Próximo";
  if (crmWiz.modo === "novo") {
    document.getElementById("crmWizSub").textContent = crmWiz.tipo === "prospect"
      ? "Prospect ainda não comprou. Cadastro curto; os dados fiscais ficam para quando virar cliente."
      : "Carteira " + CRM_SISTEMAS[crmSistemaAtual()] + ". Preencha o que souber agora; o resto dá para completar depois na ficha.";
  }
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
    const legado = crmState.clientesIndisponivel;
    const n = crmWiz.novo;
    const prospect = crmWiz.tipo === "prospect";
    const seletor = crmWiz.modo === "novo" && crmState.prospectsDisponivel ? `
      <div class="crm-wiz-tipo">
        <div class="crm-seg" role="group" aria-label="Tipo de cadastro">
          <button type="button" data-wtipo="cliente" class="${prospect ? "" : "on"}">Cliente efetivo</button>
          <button type="button" data-wtipo="prospect" class="${prospect ? "on" : ""}">Prospect</button>
        </div>
        <span class="note">${prospect ? "Ainda não comprou. Cadastro curto, sem dados fiscais." : "Já compra ou vai comprar. Cadastro completo."}</span>
      </div>` : "";
    return `
      ${seletor}
      <h4 class="crm-wiz-titulo">${prospect ? "Quem é o prospect?" : "Qual cliente entra na carteira?"}</h4>
      <div class="crm-wiz-grade">
        <div class="field"><label for="crmWizNDoc">CNPJ ou CPF</label><input type="text" id="crmWizNDoc" data-wn="documento" value="${escapeAttr(n.documento)}" placeholder="00.000.000/0000-00" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="crmWizNNome">Razão social ou nome</label><input type="text" id="crmWizNNome" data-wn="nome" value="${escapeAttr(n.nome)}" autocomplete="off"></div>
      </div>
      <p class="muted sv-sub">${prospect ? "O sistema avisa se a empresa já existe no CRM ou no Torun. O CNPJ é opcional para prospect, mas ajuda a achar repetidos. Depois clique em “Cadastrar … como prospect novo”." : ""}${prospect ? "" : (legado ? "O cadastro próprio do CRM ainda não foi criado no banco; por enquanto só dá para escolher cliente do Torun. " : "O sistema procura no CRM e no Torun enquanto você digita. O CNPJ vale mais que o nome. ") + "Clique na linha do cliente para escolher."}</p>
      <div class="crm-add-resultados" id="crmWizResultados" role="listbox" aria-label="Clientes encontrados" aria-live="polite"></div>
      <div id="crmWizNovoCampos"></div>
      ${crmEhExecutivo() ? "" : `<div class="field"><label>Executivo responsável</label><select id="crmWizExec">${crmWiz.execs.length
        ? `<option value="">Selecione…</option>` + crmWiz.execs.map(e => `<option value="${escapeAttr(e.id)}" ${e.id === crmWiz.execId ? "selected" : ""}>${escapeHtml(e.nome)}${e.id === crmMeuId() ? " (eu)" : ""}</option>`).join("")
        : `<option value="">Nenhum executivo cadastrado neste sistema</option>`}</select></div>`}
      ${prospect ? "" : `<label class="crm-add-outro"><input type="checkbox" id="crmWizOutro" ${crmWiz.outro ? "checked" : ""}> Este cliente também compra no outro sistema (${CRM_SISTEMAS[s === "atacado" ? "encomenda" : "atacado"]})</label>`}`;
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
      <p class="muted sv-sub">Telefone e e-mail de cada função. Marque quem decide a compra. ${crmWiz.tipo === "prospect" ? "Informe pelo menos o nome e o telefone de um contato." : "Informe pelo menos o nome de um contato."}</p>
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
  if (chave === "interesse") {
    const p = crmWiz.p;
    return `
      <h4 class="crm-wiz-titulo">Interesse</h4>
      <p class="muted sv-sub">O que o prospect compra e de onde veio o contato. Dá para completar depois na ficha.</p>
      <div class="field"><label>O que compra</label>
        <div class="crm-chips">${CRM_TIPOS_PNEU.map(t => `<button type="button" class="crm-chip ${p.tipos.includes(t) ? "on" : ""}" aria-pressed="${p.tipos.includes(t)}" data-wptipo="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join("")}</div></div>
      <div class="crm-wiz-grade" style="margin-top:14px">
        <div class="field"><label>Origem do contato</label><select data-wp="origem">${crmOpts(CRM_ORIGENS_LEAD, p.origem)}</select></div>
      </div>
      <div class="field"><label>Observação</label><textarea data-wp="obs" rows="3" placeholder="Ex.: frota própria de 18 caminhões">${escapeHtml(p.obs)}</textarea></div>`;
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
// nome sem acento, maiúscula nem espaço a mais: dois nomes iguais por esse critério são o mesmo cliente
const crmNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// mesmo nome, ou mesmo CNPJ/CPF (só números, a partir de 11 dígitos)
function crmMesmoCliente(c, nomeNorm, doc) {
  return (nomeNorm && crmNorm(c.nome) === nomeNorm) || (doc.length >= 11 && crmDigitos(c.documento) === doc);
}
function crmAcharNoCrm(nome, documento) {
  const n = crmNorm(nome), d = crmDigitos(documento);
  for (const c of crmState.clientes.values()) if (crmMesmoCliente(c, n, d)) return c;
  return null;
}
function crmAcharNoTorun(nome, documento) {
  const n = crmNorm(nome), d = crmDigitos(documento);
  return (state.clientes || []).find(c => crmMesmoCliente(c, n, d)) || null;
}
// só sugestão: um nome contido no outro (a partir de 4 letras)
function crmParecidos(nome) {
  const n = crmNorm(nome);
  if (n.length < 4) return [];
  const vistos = new Set([n]);
  const achados = [];
  const olhar = (lista, onde) => {
    for (const c of lista) {
      const a = crmNorm(c.nome);
      if (vistos.has(a) || !(a.includes(n) || n.includes(a))) continue;
      vistos.add(a);
      achados.push(`${c.nome} (${onde})`);
      if (achados.length >= 5) return;
    }
  };
  olhar(crmState.clientes.values(), "CRM");
  if (achados.length < 5) olhar(state.clientes || [], "Torun");
  return achados;
}

// Uma lista só, CRM e Torun juntos, filtrada pelo CNPJ e pelo nome digitados. Cada linha mostra o status do cliente.
function crmWizItens() {
  const n = crmNorm(crmWiz.novo.nome), d = crmDigitos(crmWiz.novo.documento);
  const casa = (c) => {
    const cd = crmDigitos(c.documento);
    const porDoc = d && (d.length >= 11 ? cd === d : cd.includes(d));
    const porNome = n && crmNorm(c.nome).includes(n);
    if (d.length >= 11 && porDoc) return true;
    if (!d && !n) return true;
    return (!d || porDoc) && (!n || porNome);
  };
  const itens = [];
  if (!crmState.clientesIndisponivel) crmState.clientes.forEach(c => { if (casa(c)) itens.push({ fonte: "crm", c }); });
  (state.clientes || []).forEach(c => {
    // quem já foi copiado para o CRM aparece uma vez só, como cliente do CRM
    if (!crmState.clientesIndisponivel && crmAcharNoCrm(c.nome, c.documento)) return;
    if (casa(c)) itens.push({ fonte: "torun", c });
  });
  itens.sort((a, b) => (a.fonte === b.fonte ? 0 : a.fonte === "crm" ? -1 : 1) || a.c.nome.localeCompare(b.c.nome));
  return itens;
}

function crmWizRenderBusca() {
  const lista = document.getElementById("crmWizResultados");
  if (!lista) return;
  const legado = crmState.clientesIndisponivel;
  const outroSis = CRM_SISTEMAS[crmSistemaAtual() === "atacado" ? "encomenda" : "atacado"];
  const prospect = crmWiz.tipo === "prospect";
  const digitou = !!(crmTxt(crmWiz.novo.nome) || crmDigitos(crmWiz.novo.documento));
  // prospect é sempre cadastro novo: o que já existe aparece só como aviso, sem poder escolher
  const itens = (prospect && !digitou) ? [] : crmWizItens().slice(0, 40);
  const nome = crmTxt(crmWiz.novo.nome);
  let html = itens.map(({ fonte, c }) => {
    if (prospect) {
      const selo = fonte === "crm" ? (c.tipo === "prospect" ? "Já é prospect no CRM" : "Já é cliente no CRM") : "Cadastro do Torun";
      const subP = [[c.cidade, c.estado].filter(Boolean).join("/"), c.documento].filter(Boolean).map(escapeHtml).join(" · ");
      return `<div class="crm-add-res crm-add-ocupado crm-add-linha"><span><b>${escapeHtml(c.nome)}</b><div class="muted sv-sub">${subP}</div></span><span class="crm-selo crm-selo-bad">${selo}</span></div>`;
    }
    const sub = [[c.cidade, c.estado].filter(Boolean).join("/"), c.documento].filter(Boolean).map(escapeHtml).join(" · ");
    const dono = crmWiz.ocupados.get(c.nome);
    if (dono) return `<div class="crm-add-res crm-add-ocupado crm-add-linha"><span><b>${escapeHtml(c.nome)}</b><div class="muted sv-sub">${sub}</div></span><span class="crm-selo crm-selo-bad">Na carteira de ${escapeHtml(dono)}</span></div>`;
    const outro = fonte === "crm" && crmWiz.ocupadosOutro.get(c.nome);
    const on = crmWiz.fonte === fonte && crmWiz.selNome === c.nome;
    const selo = fonte === "crm" ? `<span class="crm-selo crm-selo-ok">Já está no CRM</span>` : `<span class="crm-selo crm-selo-tor">${legado ? "Cadastro do Torun" : "Só no Torun · será copiado"}</span>`;
    return `<button type="button" class="crm-add-res crm-add-linha ${on ? "on" : ""}" role="option" aria-selected="${on}" data-wizcli="${escapeAttr(c.nome)}" data-wizfonte="${fonte}"><span><b>${escapeHtml(c.nome)}</b><div class="muted sv-sub">${sub}${outro ? ` · também está no ${escapeHtml(outroSis)}, de ${escapeHtml(outro)}` : ""}</div></span>${selo}</button>`;
  }).join("");
  // não achou: oferece cadastrar o nome digitado (só se não existe no CRM nem no Torun, nem pelo CNPJ)
  if (!legado && nome && !crmAcharNoCrm(nome, crmWiz.novo.documento) && !crmAcharNoTorun(nome, crmWiz.novo.documento)) {
    const on = crmWiz.fonte === "novo";
    html += `<button type="button" class="crm-add-res crm-add-linha crm-add-novo ${on ? "on" : ""}" role="option" aria-selected="${on}" data-wiznovo="1"><span><b>Cadastrar “${escapeHtml(nome)}” como ${prospect ? "prospect novo" : "cliente novo"}</b><div class="muted sv-sub">Não existe no CRM nem no Torun${crmDigitos(crmWiz.novo.documento).length >= 11 ? " (nem pelo CNPJ)" : ""}.</div></span><span class="crm-selo ${prospect ? "crm-selo-pro" : "crm-selo-novo"}">${prospect ? "Prospect novo" : "Cliente novo"}</span></button>`;
  }
  if (!html && prospect) html = `<div class="muted sv-sub">Digite o nome da empresa. O sistema avisa se ela já existe no CRM ou no Torun.</div>`;
  if (!html) html = `<div class="muted sv-sub">${legado ? "Nenhum cliente do Torun com esse nome ou CNPJ." : "Nenhum cliente com esse CNPJ. Informe também a razão social para cadastrar como cliente novo."}</div>`;
  lista.innerHTML = html;
  crmWizRenderNovoCampos();
}

// telefone e cidade do cliente novo: só aparecem quando a linha "cliente novo" está escolhida
function crmWizRenderNovoCampos() {
  const el = document.getElementById("crmWizNovoCampos");
  if (!el) return;
  const mostrar = crmWiz.fonte === "novo";
  if (!mostrar) { el.innerHTML = ""; return; }
  if (el.firstChild) return; // já está na tela: não reconstruir enquanto a pessoa digita
  const n = crmWiz.novo;
  el.innerHTML = `<div class="crm-wiz-grade">
      <div class="field"><label for="crmWizNTel">Telefone</label><input type="text" id="crmWizNTel" data-wn="telefone" value="${escapeAttr(n.telefone)}" placeholder="(00) 00000-0000" autocomplete="off"></div>
      <div class="field"><label for="crmWizNCid">Cidade</label><input type="text" id="crmWizNCid" data-wn="cidade" value="${escapeAttr(n.cidade)}" autocomplete="off"></div>
      <div class="field"><label for="crmWizNUf">UF</label><select id="crmWizNUf" data-wn="estado">${crmOpts(CRM_UFS, n.estado, "—")}</select></div>
    </div>`;
}

// fecha o passo 1: guarda o nome final e carrega os dados para os passos seguintes
function crmWizAplicarEscolha() {
  const f = crmWiz.fonte;
  let nome, info;
  if (f === "crm") {
    nome = crmWiz.selNome;
    info = crmInfoCliente(nome);
    crmWiz.infoNova = null;
  } else if (f === "torun") {
    nome = crmWiz.selNome;
    info = (state.clientes || []).find(x => x.nome === nome) || { nome };
    crmWiz.infoNova = info;
  } else {
    const n = crmWiz.novo;
    nome = crmTxt(n.nome);
    info = { nome, documento: crmTxt(n.documento) || "", telefone: crmTxt(n.telefone) || "", cidade: crmTxt(n.cidade) || "", estado: n.estado || "" };
    crmWiz.infoNova = info;
  }
  crmWiz.cliente = nome;
  const sig = f + "|" + nome;
  if (sig !== crmWiz.escolhaSig) {
    crmWiz.escolhaSig = sig;
    crmWizCarregarCliente(nome, info);
  } else if (f === "novo") {
    // mesmo cliente, dados do passo 1 corrigidos: completa só o que ainda está vazio nos passos seguintes
    if (!crmWiz.d.cnpj) crmWiz.d.cnpj = info.documento;
    if (!crmWiz.d.cidadeUf) crmWiz.d.cidadeUf = [info.cidade, info.estado].filter(Boolean).join(" / ");
  }
}

function crmClienteToRow(info, origem, extra) {
  const doc = crmDigitos(info.documento);
  const tipo = info.tipoPessoa === "PF" || info.tipoPessoa === "PJ" ? info.tipoPessoa : doc.length === 11 ? "PF" : doc.length === 14 ? "PJ" : null;
  return {
    id: "crmcli_" + crypto.randomUUID().replace(/-/g, ""),
    nome: info.nome, tipo_pessoa: tipo, documento: crmTxt(info.documento), razao_social: crmTxt(info.razaoSocial),
    contato: crmTxt(info.contato), telefone: crmTxt(info.telefone), email: crmTxt(info.email), cep: crmTxt(info.cep),
    endereco: crmTxt(info.endereco), cidade: crmTxt(info.cidade), estado: crmTxt(info.estado),
    limite_credito: info.limiteCredito != null ? info.limiteCredito : null, origem, ...(extra || {})
  };
}

function crmWizValidar(chave) {
  if (chave === "carteira") {
    const f = crmWiz.fonte, sel = crmWiz.selNome;
    if (crmWiz.tipo === "prospect" && f !== "novo") return crmTxt(crmWiz.novo.nome) ? "Cadastre o prospect como novo: use a linha “Cadastrar … como prospect novo”." : "Informe o nome do prospect.";
    if (!f) return "Escolha um cliente da lista ou cadastre um novo.";
    if (f === "crm") {
      if (!sel || !crmState.clientes.has(sel)) return "Escolha um cliente que já está no CRM.";
      if (crmWiz.ocupados.has(sel)) return `Esse cliente já está na carteira de ${crmWiz.ocupados.get(sel)}.`;
    } else if (f === "torun") {
      if (!sel) return "Escolha um cliente do cadastro do Torun.";
      if (crmWiz.ocupados.has(sel)) return `Esse cliente já está na carteira de ${crmWiz.ocupados.get(sel)}.`;
      const t = (state.clientes || []).find(x => x.nome === sel);
      if (!crmState.clientesIndisponivel && crmAcharNoCrm(sel, t && t.documento)) return "Esse cliente já está no CRM. Escolha-o na lista.";
    } else {
      if (!crmTxt(crmWiz.novo.nome)) return "Informe o nome do cliente.";
      if (crmAcharNoCrm(crmWiz.novo.nome, crmWiz.novo.documento)) return "Esse cliente já existe no CRM (mesmo nome ou CNPJ). Escolha-o na lista.";
      if (crmAcharNoTorun(crmWiz.novo.nome, crmWiz.novo.documento)) return "Esse cliente já existe no Torun (mesmo nome ou CNPJ). Escolha-o na lista para importar.";
    }
    if (!crmEhExecutivo() && !crmWiz.execs.some(e => e.id === crmWiz.execId)) return "Escolha o executivo responsável.";
  }
  if (chave === "contatos" && crmWiz.tipo === "prospect") {
    if (!crmWiz.contatos.some(c => crmTxt(c.nome) && crmTxt(c.telefone))) return "Informe o nome e o telefone de pelo menos um contato.";
  } else if (chave === "contatos" && !crmWiz.contatos.some(c => crmTxt(c.nome))) return "Informe pelo menos o nome de um contato.";
  if (chave === "cadastro" && crmWiz.modo === "converter" && crmDigitos(crmWiz.d.cnpj).length < 11) return "Informe o CNPJ (ou CPF) para tornar o prospect cliente efetivo.";
  if (chave === "financeiro" && crmTxt(crmWiz.d.limite) && crmNumDeBR(crmWiz.d.limite) === null) return "O limite de crédito precisa ser um valor, como 250.000,00.";
  return "";
}

function crmWizIr(i) {
  if (i === crmWiz.passo) return;
  if (i > crmWiz.passo) {
    for (let k = crmWiz.passo; k < i; k++) {
      const msg = crmWizValidar(crmWiz.passos[k][0]);
      if (msg) { crmWiz.passo = k; crmWizRender(); crmWizErro(msg); return; }
      if (crmWiz.passos[k][0] === "carteira") crmWizAplicarEscolha();
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
    if (chave === "carteira" && crmWiz.modo === "novo") crmWizAplicarEscolha();
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
    if (crmWiz.modo === "converter") { await crmWizSalvarConversao(); return; }
    await crmWizSalvarNovo();
  } finally {
    crmWiz.salvando = false;
    botao.disabled = false;
  }
}

async function crmWizSalvarConversao() {
  const cliente = crmWiz.cliente, d = crmWiz.d;
  const doc = crmDigitos(d.cnpj);
  const up = await sb.from("crm_clientes").update({
    tipo: "cliente", documento: crmTxt(d.cnpj), razao_social: crmTxt(d.razaoSocial),
    tipo_pessoa: doc.length === 11 ? "PF" : doc.length === 14 ? "PJ" : null
  }).eq("nome", cliente).eq("tipo", "prospect").select();
  if (up.error) {
    crmWizErro(up.error.code === "23505" ? "Já existe um cliente com esse CNPJ no CRM." : "Erro ao tornar cliente efetivo: " + up.error.message);
    return;
  }
  if (!up.data || !up.data[0]) { crmWizErro("Não foi possível converter (sem permissão, ou ele já é cliente efetivo)."); return; }
  crmState.clientes.set(cliente, crmClienteFromRow(up.data[0]));
  const erroPerfil = await crmGravarPerfil(cliente, d, crmWiz.filiais, crmWiz.pneus);
  if (erroPerfil) toast("Virou cliente efetivo, mas o perfil não foi salvo: " + erroPerfil + ". Abra a ficha e use Editar.");
  crmFecharAdicionar();
  crmRender();
  toast("Pronto: " + cliente + " agora é cliente efetivo.");
}

async function crmWizSalvarNovo() {
  const s = crmSistemaAtual();
  const cliente = crmWiz.cliente;

  // cliente que ainda não está no cadastro do CRM (importado do Torun ou novo): entra agora, só no fim do assistente,
  // para quem desistiu no meio não deixar cadastro solto
  if (crmWiz.fonte !== "crm" && !crmState.clientesIndisponivel) {
    const extra = crmWiz.tipo === "prospect"
      ? { tipo: "prospect", origem_lead: crmTxt(crmWiz.p.origem), interesse_tipos: crmWiz.p.tipos.length ? crmWiz.p.tipos : null, observacao: crmTxt(crmWiz.p.obs) }
      : null;
    const ins = await sb.from("crm_clientes").insert(crmClienteToRow(crmWiz.infoNova, crmWiz.fonte === "torun" ? "torun" : "novo", extra)).select();
    if (ins.error) {
      crmWizErro(ins.error.code === "23505"
        ? "Já existe um cliente com esse nome ou CNPJ no CRM. Use a aba “Já está no CRM”."
        : "Erro ao cadastrar o cliente: " + ins.error.message);
      return;
    }
    if (!ins.data || !ins.data[0]) { crmWizErro("Não foi possível cadastrar o cliente (sem permissão)."); return; }
    crmState.clientes.set(cliente, crmClienteFromRow(ins.data[0]));
    // se a carteira falhar daqui em diante, tentar de novo não cadastra o cliente outra vez
    crmWiz.fonte = "crm";
    crmWiz.selNome = cliente;
    crmWiz.escolhaSig = "crm|" + cliente;
  }

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
    tambem_outro_sistema: crmWiz.tipo === "prospect" ? false : crmWiz.outro, primeiro_followup: todayISO()
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

  // prospect não tem perfil: ele só é gravado quando virar cliente efetivo
  if (crmWiz.tipo !== "prospect") {
    const erroPerfil = await crmGravarPerfil(cliente, crmWiz.d, crmWiz.filiais, crmWiz.pneus);
    if (erroPerfil) toast("O cliente entrou na carteira, mas o perfil não foi salvo: " + erroPerfil + ". Abra a ficha e use Editar.");
  }

  crmReindexar();
  crmFecharAdicionar();
  crmRender();
  toast(crmWiz.tipo === "prospect" ? "Prospect adicionado à carteira." : "Cliente adicionado à carteira.");
}

/* eventos do assistente */
function crmWizInit() {
  const corpo = document.getElementById("crmWizCorpo");

  corpo.addEventListener("input", (e) => {
    const t = e.target;
    crmWiz.sujo = true;
    if (t.dataset.wn) {
      const campo = t.dataset.wn;
      crmWiz.novo[campo] = t.value;
      crmWizErro("");
      if (campo === "nome" || campo === "documento") {
        // mudou o que se procura: a escolha anterior deixa de valer
        crmWiz.fonte = null; crmWiz.selNome = null;
        // CNPJ completo que só pode ser de um cliente: já traz o nome
        if (campo === "nome") crmWiz.nomeAuto = false;
        if (campo === "documento" && (!crmTxt(crmWiz.novo.nome) || crmWiz.nomeAuto) && crmDigitos(t.value).length >= 11) {
          crmWiz.novo.nome = "";
          const achados = crmWizItens();
          if (achados.length === 1) {
            crmWiz.novo.nome = achados[0].c.nome;
            crmWiz.nomeAuto = true;
            document.getElementById("crmWizNNome").value = achados[0].c.nome;
          }
        }
        crmWizRenderBusca();
      }
      return;
    }
    if (t.dataset.wp) crmWiz.p[t.dataset.wp] = t.value;
    else if (t.dataset.w) crmWiz.d[t.dataset.w] = t.value;
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
    if (t.dataset.wn) { crmWiz.novo[t.dataset.wn] = t.value; crmWizErro(""); }
    else if (t.id === "crmWizExec") { crmWiz.execId = t.value; crmWizErro(""); }
    else if (t.id === "crmWizOutro") crmWiz.outro = t.checked;
    else if (t.dataset.wp) crmWiz.p[t.dataset.wp] = t.value;
    else if (t.dataset.w) {
      crmWiz.d[t.dataset.w] = t.value;
      if (t.dataset.wrender) crmWizRender();
    } else if (t.dataset.wdec !== undefined) crmWiz.contatos.forEach((c, i) => { c.decisor = i === Number(t.dataset.wdec); });
  });
  corpo.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.wizcli || b.dataset.wiznovo || b.dataset.wseg || b.dataset.wuf || b.dataset.wadd || b.dataset.wdel) crmWiz.sujo = true;
    if (b.dataset.wtipo) {
      if (crmWiz.tipo !== b.dataset.wtipo) {
        crmWiz.tipo = b.dataset.wtipo;
        crmWiz.passos = (crmWiz.tipo === "prospect" ? CRM_WIZ_PASSOS_PROSPECT : CRM_WIZ_PASSOS).slice();
        // prospect é sempre cadastro novo: a escolha de um cliente existente não vale mais
        if (crmWiz.tipo === "prospect" && crmWiz.fonte !== "novo") { crmWiz.fonte = null; crmWiz.selNome = null; }
        crmWiz.sujo = true;
        crmWizErro("");
        crmWizRender();
      }
    } else if (b.dataset.wptipo) {
      const k = crmWiz.p.tipos.indexOf(b.dataset.wptipo);
      if (k >= 0) crmWiz.p.tipos.splice(k, 1); else crmWiz.p.tipos.push(b.dataset.wptipo);
      crmWiz.sujo = true;
      b.classList.toggle("on", k < 0);
      b.setAttribute("aria-pressed", String(k < 0));
    } else if (b.dataset.wiznovo) {
      crmWiz.fonte = "novo"; crmWiz.selNome = null;
      crmWizErro("");
      crmWizRenderBusca();
    } else if (b.dataset.wizcli) {
      crmWiz.fonte = b.dataset.wizfonte; crmWiz.selNome = b.dataset.wizcli;
      // os campos de cima passam a mostrar o cliente escolhido
      const cl = b.dataset.wizfonte === "torun" ? (state.clientes || []).find(x => x.nome === b.dataset.wizcli) : crmInfoCliente(b.dataset.wizcli);
      crmWiz.novo.nome = b.dataset.wizcli;
      crmWiz.novo.documento = (cl && cl.documento) || "";
      document.getElementById("crmWizNNome").value = crmWiz.novo.nome;
      document.getElementById("crmWizNDoc").value = crmWiz.novo.documento;
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
    const conv = e.target.closest("[data-crmconverter]");
    if (conv) { crmConverterProspect(conv.dataset.crmconverter); return; }
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
  const c = crmCarteiraPorId(crmUi.fichaId);
  const prospect = !!c && crmEhProspect(c.cliente);
  return `<div class="crm-abas" role="tablist">${CRM_ABAS.map(([k, rot]) => {
    // prospect só tem a aba Atividade; as outras abrem quando virar cliente efetivo
    if (prospect && k !== "atividade") return `<button type="button" role="tab" class="fora" disabled title="Disponível depois de tornar cliente efetivo">${rot}</button>`;
    return `<button type="button" role="tab" class="${crmUi.fichaAba === k ? "on" : ""}" aria-selected="${crmUi.fichaAba === k}" data-crmaba="${k}">${rot}</button>`;
  }).join("")}</div>`;
}

// ficha do prospect: o que foi dito no cadastro curto
function crmProspectCardHtml(c) {
  if (!crmEhProspect(c.cliente)) return "";
  const i = crmInfoCliente(c.cliente);
  return `<div class="card">
    <div class="card-head"><h2>Prospect</h2><div class="note">Vira cliente efetivo em “Tornar cliente efetivo”</div></div>
    ${crmDl([["Origem do contato", escapeHtml(i.origemLead)], ["O que compra", escapeHtml((i.interesseTipos || []).join(", "))], ["Observação", escapeHtml(i.observacao)], ["CNPJ", escapeHtml(i.documento), true]])}
  </div>`;
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

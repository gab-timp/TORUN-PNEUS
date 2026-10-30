/* ---------------- CRM: Faturamento da Beth (Financeiro > Faturamento) ---------------- */
/* A Beth (papel financeiro) lança o faturamento por PERÍODO (De/Até, dentro de um mês): quanto cada cliente da
   carteira faturou naquele intervalo. O faturamento do mês é a soma dos lançamentos; a comissão é o total do mês de cada
   cliente vezes o % do executivo (um por executivo e por mês). Cliente que vem por representante entra normalmente e o
   representante só soma. A gestão lê, mas não edita. Dados em sql/crm_faturamento.sql; quem grava é a função
   crm_salvar_lancamento. Usa os helpers do crm.js e do crm-perfil.js (crmNumDeBR, crmNumParaBR, crmTipoDe...). */

const CRM_MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const crmFat = {
  mes: null,          // "2026-10"
  de: "", ate: "",    // período do lançamento novo (AAAA-MM-DD)
  lanc: [],           // lançamentos já salvos do mês, no sistema aberto
  itens: [],          // itens desses lançamentos
  pct: new Map(),     // executivo -> % do mês (o do mês, ou o último de meses anteriores)
  pctNovo: new Map(), // executivo -> % digitado agora
  aberto: new Set(),  // executivos com a lista de clientes aberta
  indisponivel: false,
  carregando: false,
  salvando: false,
  editando: null,     // id do lançamento em correção (null = lançamento novo)
  execs: []         // estrutura montada na tela (executivo > clientes e representantes)
};

function crmPodeVerFaturamento() { const p = crmPapelEfetivo(); return currentUserIsAdmin || p === "financeiro" || p === "gestao"; }
function crmPodeLancarFaturamento() { return crmPapelEfetivo() === "financeiro" && crmPodeEscrever(); }

/* ---------------- datas ---------------- */

function crmFatMeses() {
  const h = todayISO();
  let a = Number(h.slice(0, 4)), m = Number(h.slice(5, 7));
  const r = [];
  for (let i = 0; i < 12; i++) {
    r.push(`${a}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return r;
}
const crmFatRotuloMes = (mes) => `${CRM_MESES_NOME[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const crmFatUltimoDia = (mes) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
const crmFatData = (mes, dia) => `${mes}-${String(dia).padStart(2, "0")}`;
const crmFatDia = (iso) => Number(String(iso).slice(8, 10)) || 0;
const crmFatDM = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;
const crmFatArred = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------------- carga ---------------- */

async function crmFatCarregar() {
  const s = crmSistemaAtual();
  const mes = crmFat.mes;
  crmFat.carregando = true;
  const ini = crmFatData(mes, 1), fim = crmFatData(mes, crmFatUltimoDia(mes));
  const l = await sb.from("crm_faturamento_lancamentos").select("*").eq("sistema", s).gte("periodo_de", ini).lte("periodo_de", fim).order("periodo_de");
  let itens = { data: [], error: null };
  if (!l.error && (l.data || []).length) {
    itens = await sb.from("crm_faturamento_itens").select("*").in("lancamento_id", l.data.map(x => x.id));
  }
  const p = await sb.from("crm_comissao_percentual").select("*").lte("mes", ini).order("mes", { ascending: false });
  crmFat.carregando = false;
  const erro = l.error || itens.error || p.error;
  if (erro) { crmFat.indisponivel = erro.message; return false; }
  crmFat.indisponivel = false;
  crmFat.lanc = (l.data || []).map(x => ({ id: x.id, de: x.periodo_de, ate: x.periodo_ate, total: Number(x.total), por: x.created_by_nome || "", quando: x.created_at }));
  crmFat.itens = (itens.data || []).map(x => ({ lanc: x.lancamento_id, cliente: x.cliente, exec: x.executivo_user_id, valor: Number(x.valor) }));
  // % do mês: a linha mais recente de cada executivo até este mês
  crmFat.pct = new Map();
  (p.data || []).forEach(x => { if (!crmFat.pct.has(x.executivo_user_id)) crmFat.pct.set(x.executivo_user_id, Number(x.percentual)); });
  crmFat.pctNovo = new Map(crmFat.pct);
  return true;
}

// quem aparece na tela: clientes efetivos da carteira do sistema aberto, por executivo (prospect e representante não faturam)
function crmFatEstrutura() {
  const s = crmSistemaAtual();
  const mapa = new Map();
  crmState.carteira.filter(c => c.sistema === s && crmTipoDe(c.cliente) === "cliente").forEach(c => {
    if (!mapa.has(c.executivoId)) mapa.set(c.executivoId, { id: c.executivoId, nome: c.executivoNome || "(sem nome)", clientes: [] });
    mapa.get(c.executivoId).clientes.push(c.cliente);
  });
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map(e => {
    e.clientes.sort((a, b) => a.localeCompare(b));
    // clientes soltos e, depois, um grupo por representante
    const grupos = new Map();
    const soltos = [];
    e.clientes.forEach(n => {
      const rep = crmRepresentanteDe(n);
      if (rep) { if (!grupos.has(rep)) grupos.set(rep, []); grupos.get(rep).push(n); } else soltos.push(n);
    });
    e.soltos = soltos;
    e.grupos = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([rep, clientes]) => ({ rep, clientes }));
    return e;
  });
}

// o que já está salvo para o cliente; na correção, o lançamento aberto não conta (os valores dele estão nos campos)
const crmFatJaLancado = (cliente, ignorar) => crmFat.itens.filter(i => i.cliente === cliente && i.lanc !== ignorar).reduce((t, i) => t + i.valor, 0);
const crmFatLancTrecho = (l) => `${crmFatDM(l.de)} a ${crmFatDM(l.ate)}`;
// lançamentos que contam como "já lançado" para dias, legenda e sobreposição
const crmFatOutros = () => crmFat.lanc.filter(l => l.id !== crmFat.editando);

/* ---------------- tela ---------------- */

async function crmRenderFaturamento() {
  const corpo = document.getElementById("crmFatCorpo");
  if (!corpo) return;
  const meses = crmFatMeses();
  if (!crmFat.mes || !meses.includes(crmFat.mes)) crmFat.mes = meses[0];
  const sel = document.getElementById("crmFatMes");
  sel.innerHTML = meses.map(m => `<option value="${m}" ${m === crmFat.mes ? "selected" : ""}>${crmFatRotuloMes(m)}</option>`).join("");
  document.getElementById("crmFatSub").textContent = crmPodeLancarFaturamento()
    ? "Escolha o período que está lançando e informe quanto cada cliente faturou nele. O faturamento do mês é a soma dos lançamentos, e o relatório de comissão sai pronto ao salvar."
    : "Faturamento lançado pelo financeiro, por período. A gestão só consulta.";
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando o faturamento…</div></div>`;
  const mesPedido = crmFat.mes;
  const ok = await crmFatCarregar();
  if (mesPedido !== crmFat.mes) return;
  if (!ok) {
    corpo.innerHTML = `<div class="card"><div class="empty-state">O faturamento ainda não está disponível: rode o SQL <b>sql/crm_faturamento.sql</b> no Supabase. (${escapeHtml(String(crmFat.indisponivel))})</div></div>`;
    return;
  }
  crmFat.execs = crmFatEstrutura();
  if (!crmFat.execs.length) {
    corpo.innerHTML = `<div class="card"><div class="empty-state">Nenhum cliente efetivo na carteira ${CRM_SISTEMAS[crmSistemaAtual()] ? "do " + CRM_SISTEMAS[crmSistemaAtual()] : ""} ainda. Prospects e representantes não faturam.</div></div>`;
    return;
  }
  if (!crmFat.aberto.size) crmFat.aberto.add(crmFat.execs[0].id);
  const emCorrecao = crmFat.editando && crmFat.lanc.find(l => l.id === crmFat.editando);
  if (emCorrecao) { crmFat.de = emCorrecao.de; crmFat.ate = emCorrecao.ate; }
  else { crmFat.editando = null; crmFatSugerirPeriodo(false); }
  corpo.innerHTML = crmFatHtml();
  crmFatAtualizarPeriodo();
  crmFatCalcular();
}

// "Depois do último lançamento": De = dia seguinte ao último lançado; Até = hoje (ou o fim do mês)
function crmFatSugerirPeriodo(avisar) {
  const mes = crmFat.mes, ultimo = crmFatUltimoDia(mes);
  const maxAte = crmFat.lanc.reduce((m, l) => Math.max(m, crmFatDia(l.ate)), 0);
  if (maxAte >= ultimo) {
    if (avisar) toast("O mês já está lançado até o último dia. Escolha o período à mão.");
    crmFat.de = crmFatData(mes, 1); crmFat.ate = crmFatData(mes, ultimo);
    return;
  }
  const de = maxAte + 1;
  const hoje = todayISO();
  const ateDia = hoje.slice(0, 7) === mes ? Math.max(de, Math.min(crmFatDia(hoje), ultimo)) : ultimo;
  crmFat.de = crmFatData(mes, de); crmFat.ate = crmFatData(mes, ateDia);
}

function crmFatHtml() {
  const edita = crmPodeLancarFaturamento();
  const mes = crmFat.mes, ultimo = crmFatUltimoDia(mes);
  const dias = Array.from({ length: ultimo }, (_, i) => `<i data-fatdia="${i + 1}">${String(i + 1).padStart(2, "0")}</i>`).join("");
  const lanc = crmFat.lanc.length
    ? crmFat.lanc.map(l => `<span class="crm-fat-lanc"><b class="k1"></b>${l.id === crmFat.editando ? "Em correção" : "Já lançado"}: ${crmFatLancTrecho(l)} · ${escapeHtml(formatMoney(l.total))} · salvo em ${crmFatDM(crmDiaLocal(l.quando))} às ${crmHoraLocal(l.quando)}${l.por ? ", por " + escapeHtml(l.por) : ""}${edita ? ` <button type="button" class="btn small outline" data-fatabrir="${escapeAttr(l.id)}" ${l.id === crmFat.editando ? "disabled" : ""}>Abrir</button> <button type="button" class="btn small outline" data-fatexcluir="${escapeAttr(l.id)}">Excluir</button>` : ""}</span>`).join("")
    : `<span class="muted">Nenhum lançamento neste mês ainda.</span>`;
  const emCorrecao = crmFat.editando && crmFat.lanc.find(l => l.id === crmFat.editando);
  const faixa = emCorrecao ? `
    <div class="crm-fat-faixa" role="status"><span>Corrigindo o lançamento de <b>${crmFatLancTrecho(emCorrecao)}</b>. Ao salvar, ele é substituído pelos valores abaixo. “Já lançado no mês” não conta este lançamento.</span><button type="button" class="btn small outline" id="crmFatCancelar">Cancelar correção</button></div>` : "";
  const periodo = faixa + `
    <div class="card crm-fat-periodo">
      <div class="crm-fat-prow">
        <div class="field"><label for="crmFatDe">Lançar de</label><input type="date" id="crmFatDe" class="crm-fat-data" value="${crmFat.de}" min="${crmFatData(mes, 1)}" max="${crmFatData(mes, ultimo)}" ${edita ? "" : "disabled"}></div>
        <div class="field"><label for="crmFatAte">Até</label><input type="date" id="crmFatAte" class="crm-fat-data" value="${crmFat.ate}" min="${crmFatData(mes, 1)}" max="${crmFatData(mes, ultimo)}" ${edita ? "" : "disabled"}></div>
        ${edita ? `<button type="button" class="btn small outline" id="crmFatUlt">Depois do último lançamento</button><button type="button" class="btn small outline" id="crmFatMesTodo">Mês todo</button>` : ""}
        <div class="note crm-fat-ajuda">${edita ? "Você decide o período: pode ser de 01 a 05, de 06 a 07, o que fizer sentido para o lançamento." : "Só o financeiro lança e edita o faturamento."}</div>
      </div>
      <div class="crm-fat-dias-t">Dias de ${CRM_MESES_NOME[Number(mes.slice(5, 7)) - 1].toLowerCase()}</div>
      <div class="crm-fat-dias" id="crmFatDias" aria-label="Dias do mês">${dias}</div>
      <div class="crm-fat-leg">${lanc}${edita ? `<span><b class="k2"></b><span id="crmFatLegNovo"></span></span>` : ""}<span><b></b>Sem lançamento</span></div>
      <div class="note" id="crmFatSobr"></div>
    </div>`;

  const blocos = crmFat.execs.map((e, i) => {
    const aberto = crmFat.aberto.has(e.id);
    const linha = (nome, filho) => {
      const ja = crmFatJaLancado(nome, crmFat.editando);
      const atual = crmFat.editando ? crmFat.itens.find(i => i.lanc === crmFat.editando && i.cliente === nome) : null;
      return `<tr class="${filho ? "crm-fat-filho" : ""}" data-fatcli="${escapeAttr(nome)}" data-ja="${ja}" data-exec="${escapeAttr(e.id)}" data-rep="${escapeAttr(filho || "")}">
        <td>${escapeHtml(nome)}</td>
        <td class="num mono">${formatMoney(ja)}</td>
        <td class="num"><input type="text" inputmode="decimal" class="crm-fat-in" data-fatin="${escapeAttr(nome)}" value="${atual ? escapeAttr(crmNumParaBR(atual.valor)) : ""}" placeholder="0,00" aria-label="Faturado por ${escapeAttr(nome)} neste lançamento" ${edita ? "" : "disabled"}></td>
        <td class="num mono crm-fat-tot"></td>
        <td class="num mono crm-fat-com"></td>
      </tr>`;
    };
    const rows = e.soltos.map(n => linha(n, "")).join("") + e.grupos.map(g => `
      <tr class="crm-fat-grupo" data-fatgrp="${escapeAttr(g.rep)}" data-exec="${escapeAttr(e.id)}">
        <td>${escapeHtml(g.rep)} <span class="crm-selo crm-selo-rep">Representante</span></td>
        <td class="num mono g-ja"></td><td class="num mono g-novo"></td><td class="num mono g-tot"></td><td class="num mono g-com"></td>
      </tr>` + g.clientes.map(n => linha(n, g.rep)).join("")).join("");
    const pctVal = crmFat.pctNovo.has(e.id) ? String(crmFat.pctNovo.get(e.id)).replace(".", ",") : "0";
    return `
      <div class="card crm-fat-exec ${aberto ? "aberto" : ""}" data-fatexec="${escapeAttr(e.id)}">
        <div class="crm-fat-ehead">
          <div class="crm-fat-av">${escapeHtml(e.nome.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase())}</div>
          <div class="crm-fat-en"><b>${escapeHtml(e.nome)}</b><span>${e.clientes.length} ${e.clientes.length === 1 ? "cliente" : "clientes"}</span></div>
          <div class="crm-fat-kv"><label for="crmFatPct${i}">% de comissão</label>
            ${edita ? `<span class="crm-fat-pc"><input type="text" inputmode="decimal" class="crm-fat-pct" id="crmFatPct${i}" data-fatpct="${escapeAttr(e.id)}" value="${escapeAttr(pctVal)}" aria-label="% de comissão de ${escapeAttr(e.nome)}"> %</span>` : `<b>${escapeHtml(pctVal)} %</b>`}</div>
          <div class="crm-fat-kv"><label>Neste lançamento</label><b class="g crm-fat-nl"></b></div>
          <div class="crm-fat-kv"><label>Faturamento do mês</label><b class="crm-fat-fm"></b></div>
          <div class="crm-fat-kv"><label>Comissão</label><b class="o crm-fat-cs"></b></div>
          <button type="button" class="btn small outline" data-fattoggle="${escapeAttr(e.id)}" aria-expanded="${aberto}">${aberto ? "Ocultar clientes" : "Mostrar clientes"}</button>
        </div>
        <div class="crm-fat-tabela table-wrap"><table>
          <thead><tr><th>Cliente</th><th class="num">Já lançado no mês<small class="crm-fat-pja"></small></th><th class="num">Faturado neste lançamento<small class="crm-fat-pnl"></small></th><th class="num">Total do mês<small class="crm-fat-ptot"></small></th><th class="num">Comissão <span class="crm-fat-ppct"></span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).join("");

  const rodape = `
    <div class="crm-fat-rodape">
      <div class="crm-fat-kv"><label>Total geral do mês</label><b id="crmFatTg"></b></div>
      <div class="crm-fat-kv"><label>Comissão total</label><b class="o" id="crmFatCt"></b></div>
      <div class="note crm-fat-nt">${edita ? "Só a Beth edita esta tela. Gestores e executivos veem o resultado no Dashboard." : "Só o financeiro edita esta tela."}</div>
      <div class="note crm-fat-erro" id="crmFatErro" role="alert"></div>
      <button type="button" class="btn outline" id="crmFatRelatorio">Relatório do mês</button>
      ${edita ? `<button type="button" class="btn outline" id="crmFatSalvar">${crmFat.editando ? "Salvar correção" : "Salvar lançamento"}</button><button type="button" class="btn primary" id="crmFatSalvarRel">${crmFat.editando ? "Salvar correção e gerar relatório" : "Salvar e gerar relatório"}</button>` : ""}
    </div>`;
  return periodo + blocos + rodape;
}

/* ---------------- cálculo ao vivo ---------------- */

// valor digitado: vazio = 0; texto que não é número = null (inválido)
function crmFatLerValor(texto) {
  let t = String(texto || "").trim().replace(/[R$\s]/g, "");
  if (!t) return 0;
  // "7.400" é sete mil e quatrocentos (ponto de milhar); "7,40" e "7.4" são decimais
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function crmFatCalcular() {
  const raiz = document.getElementById("crmFatCorpo");
  if (!raiz || crmFat.indisponivel) return;
  const ate = crmFat.ate, de = crmFat.de;
  const perNovo = de && ate ? `${crmFatDM(de)} a ${crmFatDM(ate)}` : "—";
  const maxSalvo = crmFatOutros().reduce((m, l) => l.ate > m ? l.ate : m, "");
  const maxTotal = maxSalvo > (ate || "") ? maxSalvo : (ate || maxSalvo);
  const mm = crmFat.mes.slice(5, 7);
  const perJa = maxSalvo ? `01/${mm} a ${crmFatDM(maxSalvo)}` : "";
  const perTot = maxTotal ? `01/${mm} a ${crmFatDM(maxTotal)}` : "";
  let totalGeral = 0, comTotal = 0;
  raiz.querySelectorAll(".crm-fat-exec").forEach(bloco => {
    const id = bloco.dataset.fatexec;
    const pct = crmFat.pctNovo.has(id) ? crmFat.pctNovo.get(id) : 0;
    let nl = 0, fm = 0;
    const grupos = new Map();
    bloco.querySelectorAll("tr[data-fatcli]").forEach(tr => {
      const ja = Number(tr.dataset.ja) || 0;
      const inp = tr.querySelector(".crm-fat-in");
      const v = crmFatLerValor(inp.value);
      inp.classList.toggle("invalido", v === null);
      const novo = v === null ? 0 : v;
      const tot = ja + novo;
      const com = crmFatArred(tot * pct / 100);
      tr.querySelector(".crm-fat-tot").textContent = formatMoney(tot);
      tr.querySelector(".crm-fat-com").textContent = formatMoney(com);
      nl += novo; fm += tot;
      if (tr.dataset.rep) {
        const g = grupos.get(tr.dataset.rep) || { ja: 0, novo: 0, tot: 0, com: 0 };
        g.ja += ja; g.novo += novo; g.tot += tot; g.com += com;
        grupos.set(tr.dataset.rep, g);
      }
    });
    bloco.querySelectorAll("tr[data-fatgrp]").forEach(tr => {
      const g = grupos.get(tr.dataset.fatgrp) || { ja: 0, novo: 0, tot: 0, com: 0 };
      tr.querySelector(".g-ja").textContent = formatMoney(g.ja);
      tr.querySelector(".g-novo").textContent = (g.novo ? "+ " : "") + formatMoney(g.novo);
      tr.querySelector(".g-tot").textContent = formatMoney(g.tot);
      tr.querySelector(".g-com").textContent = formatMoney(crmFatArred(g.com));
    });
    const cs = crmFatArred(fm * pct / 100);
    bloco.querySelector(".crm-fat-nl").textContent = (nl ? "+ " : "") + formatMoney(nl);
    bloco.querySelector(".crm-fat-fm").textContent = formatMoney(fm);
    bloco.querySelector(".crm-fat-cs").textContent = formatMoney(cs);
    bloco.querySelector(".crm-fat-pja").textContent = perJa;
    bloco.querySelector(".crm-fat-pnl").textContent = perNovo;
    bloco.querySelector(".crm-fat-ptot").textContent = perTot;
    bloco.querySelector(".crm-fat-ppct").textContent = `(${String(pct).replace(".", ",")}%)`;
    totalGeral += fm; comTotal += cs;
  });
  document.getElementById("crmFatTg").textContent = formatMoney(totalGeral);
  document.getElementById("crmFatCt").textContent = formatMoney(crmFatArred(comTotal));
}

// faixa de dias, legenda e o aviso de sobreposição (só avisa: quem decide é a Beth)
function crmFatAtualizarPeriodo() {
  const mes = crmFat.mes, ultimo = crmFatUltimoDia(mes);
  const a = crmFatDia(crmFat.de), b = crmFatDia(crmFat.ate);
  const valido = a > 0 && b >= a && crmFat.de.slice(0, 7) === mes && crmFat.ate.slice(0, 7) === mes;
  const outros = crmFatOutros();
  const sobrepoe = valido && outros.some(l => a <= crmFatDia(l.ate) && b >= crmFatDia(l.de));
  document.querySelectorAll("#crmFatDias i").forEach(el => {
    const d = Number(el.dataset.fatdia);
    const lancado = outros.some(l => d >= crmFatDia(l.de) && d <= crmFatDia(l.ate));
    const novo = valido && d >= a && d <= b;
    el.className = lancado && novo ? "c" : lancado ? "j" : novo ? "n" : "";
  });
  const leg = document.getElementById("crmFatLegNovo");
  if (leg) leg.textContent = "Este lançamento: " + (valido ? `${crmFatDM(crmFat.de)} a ${crmFatDM(crmFat.ate)}` : "—");
  const s = document.getElementById("crmFatSobr");
  if (!s) return;
  if (!crmPodeLancarFaturamento()) { s.className = "note"; s.textContent = ""; return; }
  if (!valido) { s.className = "note crm-fat-alerta"; s.textContent = `Escolha um período dentro de ${CRM_MESES_NOME[Number(mes.slice(5, 7)) - 1].toLowerCase()}, com o "Até" depois do "De".`; return; }
  if (sobrepoe) { s.className = "note crm-fat-alerta"; s.textContent = "Atenção: esse período se sobrepõe a um lançamento já salvo (dias em vermelho). O sistema avisa de novo antes de salvar, para o mesmo dia não entrar duas vezes."; return; }
  s.className = "note";
  s.textContent = "Se o período escolhido se sobrepuser a um lançamento já salvo (por exemplo, 02 a 05 depois de 01 a 05), o sistema avisa antes de salvar, para o mesmo dia não entrar duas vezes.";
}

/* ---------------- salvar ---------------- */

function crmFatErro(msg) {
  const el = document.getElementById("crmFatErro");
  if (el) { el.textContent = msg; el.style.display = msg ? "block" : "none"; }
}

async function crmFatSalvar(gerarRelatorio) {
  if (crmFat.salvando || !crmPodeLancarFaturamento()) return;
  crmFatErro("");
  const a = crmFatDia(crmFat.de), b = crmFatDia(crmFat.ate);
  if (!(a > 0 && b >= a) || crmFat.de.slice(0, 7) !== crmFat.mes || crmFat.ate.slice(0, 7) !== crmFat.mes) { crmFatErro("Escolha um período válido dentro do mês, com o “Até” depois do “De”."); return; }
  const itens = [];
  for (const inp of document.querySelectorAll("#crmFatCorpo .crm-fat-in")) {
    const v = crmFatLerValor(inp.value);
    if (v === null) { crmFatErro(`Valor inválido em “${inp.dataset.fatin}”. Use números, como 13.500,00.`); inp.focus(); return; }
    if (v > 0) itens.push({ cliente: inp.dataset.fatin, valor: crmFatArred(v) });
  }
  if (!itens.length) { crmFatErro("Informe o faturamento de pelo menos um cliente."); return; }
  for (const [id, p] of crmFat.pctNovo) if (!(p >= 0 && p <= 100)) { crmFatErro("O percentual de comissão tem que ficar entre 0 e 100."); return; }
  if (crmFatOutros().some(l => a <= crmFatDia(l.ate) && b >= crmFatDia(l.de))) {
    const ok = await confirmModal("Período já lançado", `${crmFatDM(crmFat.de)} a ${crmFatDM(crmFat.ate)} se sobrepõe a um lançamento já salvo. Se salvar, o mesmo dia pode entrar duas vezes no faturamento do mês. Salvar mesmo assim?`, "Salvar mesmo assim");
    if (!ok) return;
  }
  const percentuais = crmFat.execs.map(e => ({ executivo_user_id: e.id, percentual: crmFat.pctNovo.has(e.id) ? crmFat.pctNovo.get(e.id) : 0 }));
  crmFat.salvando = true;
  document.querySelectorAll("#crmFatSalvar, #crmFatSalvarRel").forEach(b2 => { b2.disabled = true; });
  const corrigindo = crmFat.editando;
  const { error } = corrigindo
    ? await sb.rpc("crm_atualizar_lancamento", { p_id: corrigindo, p_de: crmFat.de, p_ate: crmFat.ate, p_itens: itens, p_percentuais: percentuais })
    : await sb.rpc("crm_salvar_lancamento", { p_sistema: crmSistemaAtual(), p_de: crmFat.de, p_ate: crmFat.ate, p_itens: itens, p_percentuais: percentuais });
  crmFat.salvando = false;
  if (error) {
    document.querySelectorAll("#crmFatSalvar, #crmFatSalvarRel").forEach(b2 => { b2.disabled = false; });
    crmFatErro("Não foi possível salvar: " + error.message);
    return;
  }
  toast(corrigindo ? "Lançamento corrigido." : "Lançamento salvo.");
  crmFat.editando = null;
  await crmRenderFaturamento();
  if (gerarRelatorio) crmFatImprimir();
}

async function crmFatExcluir(id) {
  if (crmFat.salvando || !crmPodeLancarFaturamento()) return;
  const l = crmFat.lanc.find(x => x.id === id);
  if (!l) return;
  const n = new Set(crmFat.itens.filter(i => i.lanc === id).map(i => i.cliente)).size;
  const ok = await confirmModal("Excluir lançamento", `Excluir o lançamento de ${crmFatLancTrecho(l)} (${formatMoney(l.total)}, ${n} ${n === 1 ? "cliente" : "clientes"})? O valor sai do faturamento do mês e da comissão. Não dá para desfazer; para refazer, é só lançar de novo.`, "Excluir");
  if (!ok) return;
  crmFat.salvando = true;
  const { error } = await sb.rpc("crm_excluir_lancamento", { p_id: id });
  crmFat.salvando = false;
  if (error) { crmFatErro("Não foi possível excluir: " + error.message); return; }
  toast("Lançamento excluído.");
  if (crmFat.editando === id) crmFat.editando = null;
  await crmRenderFaturamento();
}

function crmFatAbrir(id) {
  crmFat.editando = id;
  crmRenderFaturamento();
}

/* ---------------- relatório de comissão (PDF) ---------------- */

// resumo por executivo com o que está salvo (valores digitados e ainda não salvos não entram)
function crmFatRelatorioHtml() {
  const s = crmSistemaAtual();
  const mes = crmFat.mes;
  const linhas = crmFat.execs.map(e => {
    const pct = crmFat.pct.has(e.id) ? crmFat.pct.get(e.id) : 0;
    const comFat = e.clientes.filter(n => crmFatJaLancado(n) > 0).length;
    const fm = e.clientes.reduce((t, n) => t + crmFatJaLancado(n), 0);
    return { nome: e.nome, clientes: comFat, fm, pct, com: crmFatArred(fm * pct / 100) };
  });
  const totFm = linhas.reduce((t, l) => t + l.fm, 0);
  const totCom = crmFatArred(linhas.reduce((t, l) => t + l.com, 0));
  const ultimoLanc = crmFat.lanc.reduce((m, l) => l.ate > m ? l.ate : m, "");
  const fechado = ultimoLanc && crmFatDia(ultimoLanc) >= crmFatUltimoDia(mes);
  const periodo = crmFat.lanc.length ? `lançamentos de ${crmFatDM(crmFat.lanc.reduce((m, l) => l.de < m ? l.de : m, crmFat.lanc[0].de))} a ${crmFatDM(ultimoLanc)} (${fechado ? "mês fechado" : "mês parcial"})` : "sem lançamentos";
  const pctTxt = (p) => String(p).replace(".", ",") + "%";
  return `
    <div class="print-comissao">
      <div class="pc-topo"><h1>Relatório de comissão</h1>
        <div class="pc-sub">${escapeHtml(CRM_SISTEMAS[s])} · ${escapeHtml(crmFatRotuloMes(mes).replace("/", " de "))} · ${escapeHtml(periodo)}</div></div>
      <table class="pc-tabela">
        <thead><tr><th>Executivo</th><th class="num">Clientes que faturaram</th><th class="num">Faturamento do mês</th><th class="num">% comissão</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhas.map(l => `<tr><td>${escapeHtml(l.nome)}</td><td class="num">${fmt(l.clientes)}</td><td class="num">${escapeHtml(formatMoney(l.fm))}</td><td class="num">${pctTxt(l.pct)}</td><td class="num">${escapeHtml(formatMoney(l.com))}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${escapeHtml(formatMoney(totFm))}</td><td></td><td class="num">${escapeHtml(formatMoney(totCom))}</td></tr></tfoot>
      </table>
      <div class="pc-rodape">Comissão = faturamento do mês de cada cliente × % do executivo. Gerado por ${escapeHtml(currentUserNome || "—")} em ${formatDateBR(todayISO())}.</div>
    </div>`;
}

function crmFatLimparImpressao() {
  document.body.classList.remove("imprimindo-doc");
  document.getElementById("reportPrintArea").innerHTML = "";
}

function crmFatImprimir() {
  const area = document.getElementById("reportPrintArea");
  document.body.classList.remove("imprimindo-doc");
  document.body.classList.add("imprimindo-doc");
  area.innerHTML = crmFatRelatorioHtml();
  window.addEventListener("afterprint", crmFatLimparImpressao, { once: true });
  window.print();
}

/* ---------------- eventos ---------------- */

function crmFatInit() {
  const raiz = document.getElementById("crmFatCorpo");
  if (!raiz) return;
  document.getElementById("crmFatMes").addEventListener("change", (e) => { crmFat.mes = e.target.value; crmFat.editando = null; crmFat.aberto.clear(); crmRenderFaturamento(); });
  raiz.addEventListener("input", (e) => {
    const t = e.target;
    if (t.classList.contains("crm-fat-in")) { crmFatErro(""); crmFatCalcular(); }
    else if (t.classList.contains("crm-fat-pct")) {
      const v = crmFatLerValor(t.value);
      t.classList.toggle("invalido", v === null || v > 100);
      if (v !== null && v <= 100) crmFat.pctNovo.set(t.dataset.fatpct, v);
      crmFatCalcular();
    } else if (t.classList.contains("crm-fat-data")) {
      if (t.id === "crmFatDe") crmFat.de = t.value; else crmFat.ate = t.value;
      crmFatErro("");
      crmFatAtualizarPeriodo();
      crmFatCalcular();
    }
  });
  // ao sair do campo de valor, mostra no formato da moeda
  raiz.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t.classList.contains("crm-fat-in")) {
      const v = crmFatLerValor(t.value);
      if (v !== null && v > 0) t.value = crmNumParaBR(v);
      else if (v === 0) t.value = "";
    }
  });
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.fatabrir) crmFatAbrir(b.dataset.fatabrir);
    else if (b.dataset.fatexcluir) crmFatExcluir(b.dataset.fatexcluir);
    else if (b.id === "crmFatCancelar") { crmFat.editando = null; crmRenderFaturamento(); }
    else if (b.dataset.fattoggle) {
      const id = b.dataset.fattoggle;
      if (crmFat.aberto.has(id)) crmFat.aberto.delete(id); else crmFat.aberto.add(id);
      const aberto = crmFat.aberto.has(id);
      b.closest(".crm-fat-exec").classList.toggle("aberto", aberto);
      b.textContent = aberto ? "Ocultar clientes" : "Mostrar clientes";
      b.setAttribute("aria-expanded", String(aberto));
    } else if (b.id === "crmFatUlt") {
      crmFatSugerirPeriodo(true);
      document.getElementById("crmFatDe").value = crmFat.de; document.getElementById("crmFatAte").value = crmFat.ate;
      crmFatAtualizarPeriodo(); crmFatCalcular();
    } else if (b.id === "crmFatMesTodo") {
      crmFat.de = crmFatData(crmFat.mes, 1); crmFat.ate = crmFatData(crmFat.mes, crmFatUltimoDia(crmFat.mes));
      document.getElementById("crmFatDe").value = crmFat.de; document.getElementById("crmFatAte").value = crmFat.ate;
      crmFatAtualizarPeriodo(); crmFatCalcular();
    } else if (b.id === "crmFatSalvar") crmFatSalvar(false);
    else if (b.id === "crmFatSalvarRel") crmFatSalvar(true);
    else if (b.id === "crmFatRelatorio") crmFatImprimir();
  });
}

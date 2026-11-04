/* ---------------- CRM: painel do representante e comissão dele lançada pela Beth ---------------- */
/* Duas partes, as duas em sql/crm_representante_painel.sql:
   1) Faturamento (Financeiro): em cada representante, a Beth define o % do mês e a comissão de cada cliente que vem por
      ele (o valor nasce do %, mas cada linha pode ser ajustada à mão). Quem grava é a função crm_salvar_comissao_representante.
   2) Painel do representante: o login do representante (user_roles.crm_representante) vê só o dele, pela função
      crm_painel_representante: faturamento e comissão do mês, por cliente, mês a mês e os lançamentos. Financeiro, gestão e
      administrador abrem o painel de qualquer representante para conferir o que ele vê.
   Usa os helpers do crm.js e do crm-faturamento.js (crmFatMeses, crmFatRotuloMes, crmFatLerValor, crmFatArred, crmNumParaBR). */

/* ---------------- Faturamento: comissão dos representantes (Beth) ---------------- */

const crmRepCom = {
  chave: "",          // sistema|mês dos dados abaixo
  pct: new Map(),     // representante -> % em vigor no mês (o do mês, ou o último de meses anteriores)
  pctDoMes: new Set(),// representantes que já têm % salvo neste mês
  linhas: new Map(),  // representante|cliente -> { valor, ajustado } salvos no mês
  indisponivel: false,
  salvando: false
};

const crmRepComChave = (rep, cliente) => rep + "|" + cliente;

function crmRepComDesenhar() {
  const corpo = document.getElementById("crmFatCorpo");
  if (!corpo || crmFat.indisponivel) return;
  const s = crmSistemaAtual();
  if (!crmRepresentantesDoSistema(s).length) return;
  let secao = document.getElementById("crmRepComSecao");
  if (!secao) {
    secao = document.createElement("div");
    secao.id = "crmRepComSecao";
    corpo.appendChild(secao);
  }
  secao.innerHTML = `<div class="card"><div class="empty-state">Carregando a comissão dos representantes…</div></div>`;
  crmRepComBuscar().then(ok => { if (document.getElementById("crmRepComSecao") === secao) crmRepComMontar(secao, ok); });
}

async function crmRepComBuscar() {
  const s = crmSistemaAtual(), mes = crmFat.mes;
  const ini = mes + "-01";
  const [p, c] = await Promise.all([
    sb.from("crm_representante_percentual").select("*").eq("sistema", s).lte("mes", ini).order("mes", { ascending: false }),
    sb.from("crm_representante_comissao").select("*").eq("sistema", s).eq("mes", ini)
  ]);
  if (mes !== crmFat.mes || s !== crmSistemaAtual()) return false;
  const erro = p.error || c.error;
  crmRepCom.indisponivel = erro ? erro.message : false;
  crmRepCom.chave = s + "|" + mes;
  crmRepCom.pct = new Map();
  crmRepCom.pctDoMes = new Set();
  crmRepCom.linhas = new Map();
  if (erro) return true;
  (p.data || []).forEach(x => {
    if (!crmRepCom.pct.has(x.representante)) crmRepCom.pct.set(x.representante, Number(x.percentual));
    if (x.mes === ini) crmRepCom.pctDoMes.add(x.representante);
  });
  (c.data || []).forEach(x => crmRepCom.linhas.set(crmRepComChave(x.representante, x.cliente), { valor: Number(x.valor), ajustado: !!x.ajustado }));
  return true;
}

// o que o cliente faturou no mês, pelos lançamentos já salvos
const crmRepComFaturado = (cliente) => crmFat.itens.filter(i => i.cliente === cliente).reduce((t, i) => t + i.valor, 0);
const crmRepComPct = (v) => String(v).replace(".", ",");

function crmRepComMontar(secao, ok) {
  if (!ok) return;
  if (crmRepCom.indisponivel) {
    secao.innerHTML = `<div class="card"><div class="empty-state">A comissão dos representantes ainda não está disponível: rode o SQL <b>sql/crm_representante_painel.sql</b> no Supabase. (${escapeHtml(String(crmRepCom.indisponivel))})</div></div>`;
    return;
  }
  const s = crmSistemaAtual();
  const edita = crmPodeLancarFaturamento();
  const reps = crmRepresentantesDoSistema(s).map(c => c.cliente).sort((a, b) => a.localeCompare(b));
  const blocos = reps.map((rep, i) => {
    const clientes = crmClientesDoRepresentante(rep, s).map(c => c.cliente).sort((a, b) => a.localeCompare(b));
    const pct = crmRepCom.pct.has(rep) ? crmRepCom.pct.get(rep) : 0;
    const salvoMes = crmRepCom.pctDoMes.has(rep);
    const linhas = clientes.map(n => {
      const fat = crmRepComFaturado(n);
      const salvo = crmRepCom.linhas.get(crmRepComChave(rep, n));
      const ajustado = !!(salvo && salvo.ajustado);
      const valor = salvo ? salvo.valor : crmFatArred(fat * pct / 100);
      return `<tr data-repcli="${escapeAttr(n)}" data-fat="${fat}" data-ajustado="${ajustado ? "1" : ""}">
        <td>${escapeHtml(n)}</td>
        <td class="num mono">${formatMoney(fat)}</td>
        <td class="num"><input type="text" inputmode="decimal" class="crm-rep-in ${ajustado ? "ajustado" : ""}" data-repval="${escapeAttr(n)}" value="${escapeAttr(crmNumParaBR(valor))}" aria-label="Comissão de ${escapeAttr(n)}" ${edita ? "" : "disabled"}>${ajustado ? ' <span class="crm-rep-aj">ajustado</span>' : ""}</td>
      </tr>`;
    }).join("");
    return `
      <div class="card crm-rep-bloco" data-repbloco="${escapeAttr(rep)}">
        <div class="crm-fat-ehead">
          <div class="crm-fat-av">${escapeHtml(rep.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase())}</div>
          <div class="crm-fat-en"><b>${escapeHtml(rep)} <span class="crm-selo crm-selo-rep">Representante</span></b><span>${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}${salvoMes ? " · comissão deste mês já lançada" : " · comissão deste mês ainda não lançada"}</span></div>
          <div class="crm-fat-kv"><label for="crmRepPct${i}">% de comissão</label>
            ${edita ? `<span class="crm-fat-pc"><input type="text" inputmode="decimal" class="crm-fat-pct" id="crmRepPct${i}" data-reppct="${escapeAttr(rep)}" value="${escapeAttr(crmRepComPct(pct))}" aria-label="% de comissão de ${escapeAttr(rep)}"> %</span>` : `<b>${escapeHtml(crmRepComPct(pct))} %</b>`}</div>
          <div class="crm-fat-kv"><label>Faturamento do mês</label><b class="crm-rep-ft"></b></div>
          <div class="crm-fat-kv"><label>Comissão</label><b class="o crm-rep-ct"></b></div>
        </div>
        ${clientes.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th class="num">Faturado no mês</th><th class="num">Comissão (R$)</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        ${edita ? `<div class="crm-rep-acoes"><div class="note">O percentual preenche a comissão de cada cliente. Cada valor continua editável: se você mudar um, ele fica marcado como ajustado. O representante vê o valor assim que você salvar.</div><button type="button" class="btn primary" data-repsalvar="${escapeAttr(rep)}">Salvar comissão de ${escapeHtml(rep)}</button></div>` : ""}` : `<div class="empty-state">Nenhum cliente da carteira vem por este representante ainda.</div>`}
      </div>`;
  }).join("");
  secao.innerHTML = `
    <div class="page-head crm-rep-titulo"><div><h2>Comissão dos representantes</h2><div class="sub">O representante entra com o próprio login e vê só o faturamento e a comissão dele, deste mês e dos anteriores.</div></div></div>
    ${blocos}`;
  secao.querySelectorAll(".crm-rep-bloco").forEach(crmRepComTotais);
}

function crmRepComTotais(bloco) {
  let ft = 0, ct = 0;
  bloco.querySelectorAll("tr[data-repcli]").forEach(tr => {
    const v = crmFatLerValor(tr.querySelector(".crm-rep-in").value);
    tr.querySelector(".crm-rep-in").classList.toggle("invalido", v === null);
    ft += Number(tr.dataset.fat) || 0;
    ct += v === null ? 0 : v;
  });
  const a = bloco.querySelector(".crm-rep-ft"), b = bloco.querySelector(".crm-rep-ct");
  if (a) a.textContent = formatMoney(ft);
  if (b) b.textContent = formatMoney(crmFatArred(ct));
}

// mudou o %: recalcula todas as linhas e tira a marca de ajustado
function crmRepComMudouPct(inp) {
  const bloco = inp.closest(".crm-rep-bloco");
  const pct = crmFatLerValor(inp.value);
  inp.classList.toggle("invalido", pct === null || pct > 100);
  if (pct === null || pct > 100) return;
  bloco.querySelectorAll("tr[data-repcli]").forEach(tr => {
    const campo = tr.querySelector(".crm-rep-in");
    campo.value = crmNumParaBR(crmFatArred((Number(tr.dataset.fat) || 0) * pct / 100));
    campo.classList.remove("ajustado");
    tr.dataset.ajustado = "";
    const marca = tr.querySelector(".crm-rep-aj");
    if (marca) marca.remove();
  });
  crmRepComTotais(bloco);
}

function crmRepComMudouValor(inp) {
  const tr = inp.closest("tr");
  tr.dataset.ajustado = "1";
  inp.classList.add("ajustado");
  if (!tr.querySelector(".crm-rep-aj")) inp.insertAdjacentHTML("afterend", ' <span class="crm-rep-aj">ajustado</span>');
  crmRepComTotais(inp.closest(".crm-rep-bloco"));
}

async function crmRepComSalvar(rep, botao) {
  if (crmRepCom.salvando || !crmPodeLancarFaturamento()) return;
  const bloco = botao.closest(".crm-rep-bloco");
  const pct = crmFatLerValor(bloco.querySelector(".crm-fat-pct").value);
  if (pct === null || pct > 100) { toast("O percentual de comissão tem que ficar entre 0 e 100."); return; }
  const itens = [];
  for (const tr of bloco.querySelectorAll("tr[data-repcli]")) {
    const v = crmFatLerValor(tr.querySelector(".crm-rep-in").value);
    if (v === null) { toast("Há uma comissão com valor inválido. Corrija o campo em vermelho."); return; }
    itens.push({ cliente: tr.dataset.repcli, valor: v, ajustado: tr.dataset.ajustado === "1" });
  }
  crmRepCom.salvando = true;
  botao.disabled = true;
  try {
    const { error } = await sb.rpc("crm_salvar_comissao_representante", {
      p_sistema: crmSistemaAtual(), p_representante: rep, p_mes: crmFat.mes + "-01", p_percentual: pct, p_itens: itens
    });
    if (error) { toast("Erro ao salvar a comissão: " + error.message); return; }
    crmRepCom.pct.set(rep, pct);
    crmRepCom.pctDoMes.add(rep);
    itens.forEach(x => crmRepCom.linhas.set(crmRepComChave(rep, x.cliente), { valor: x.valor, ajustado: x.ajustado }));
    toast(`Comissão de ${rep} salva. Ele já vê o novo valor.`);
    const secao = document.getElementById("crmRepComSecao");
    if (secao) crmRepComMontar(secao, true);
  } finally {
    crmRepCom.salvando = false;
    botao.disabled = false;
  }
}

document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t || !t.closest || !t.closest("#crmRepComSecao")) return;
  if (t.matches("[data-reppct]")) crmRepComMudouPct(t);
  else if (t.matches("[data-repval]")) crmRepComMudouValor(t);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest ? e.target.closest("[data-repsalvar]") : null;
  if (b && b.closest("#crmRepComSecao")) crmRepComSalvar(b.dataset.repsalvar, b);
});

/* ---------------- Painel do representante ---------------- */

const crmRep = { mes: null, escolhido: "", carregando: false };

function crmEhLoginRepresentante() { return !!crmRepresentante; }
function crmPodeVerPainelRep() { return currentUserIsAdmin || crmEhLoginRepresentante() || ["financeiro", "gestao"].includes(crmPapelEfetivo()); }

async function crmRepPainelRender() {
  const corpo = document.getElementById("crmRepCorpo");
  if (!corpo) return;
  const login = crmEhLoginRepresentante();
  const meses = crmFatMeses();
  if (!crmRep.mes || !meses.includes(crmRep.mes)) crmRep.mes = meses[0];
  document.getElementById("crmRepMes").innerHTML = meses.map(m => `<option value="${m}" ${m === crmRep.mes ? "selected" : ""}>${crmFatRotuloMes(m)}</option>`).join("");

  // financeiro, gestão e administrador escolhem de qual representante conferir o painel
  const campo = document.getElementById("crmRepEscolhaCampo");
  campo.style.display = login ? "none" : "";
  let alvo = null;
  if (!login) {
    const lista = [...new Set(crmState.carteira.filter(c => crmEhRepresentante(c.cliente)).map(c => c.cliente))].sort((a, b) => a.localeCompare(b));
    if (!lista.includes(crmRep.escolhido)) crmRep.escolhido = lista[0] || "";
    document.getElementById("crmRepEscolha").innerHTML = lista.map(n => `<option value="${escapeAttr(n)}" ${n === crmRep.escolhido ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
    alvo = crmRep.escolhido;
    if (!alvo) {
      document.getElementById("crmRepTitulo").textContent = "Painel do representante";
      document.getElementById("crmRepSub").textContent = "Escolha um representante para ver o que ele enxerga.";
      corpo.innerHTML = `<div class="card"><div class="empty-state">Nenhum representante cadastrado ainda. Cadastre em Clientes, com o tipo Representante.</div></div>`;
      return;
    }
  }
  const pedido = crmRep.mes + "|" + (alvo || "");
  crmRep.pedido = pedido;
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando o painel…</div></div>`;
  const { data, error } = await sb.rpc("crm_painel_representante", { p_mes: crmRep.mes + "-01", p_representante: alvo });
  if (crmRep.pedido !== pedido) return;
  if (error || !data) {
    const msg = error ? error.message : "sem resposta";
    corpo.innerHTML = `<div class="card"><div class="empty-state">${/crm_painel_representante|function/i.test(msg)
      ? "O painel ainda não está disponível: rode o SQL <b>sql/crm_representante_painel.sql</b> no Supabase."
      : "Não foi possível abrir o painel."} (${escapeHtml(msg)})</div></div>`;
    return;
  }
  crmRepPainelDesenhar(corpo, data, login);
}

function crmRepPainelDesenhar(corpo, d, login) {
  const primeiro = String(d.nome || d.representante || "").trim().split(/\s+/)[0] || "";
  document.getElementById("crmRepTitulo").textContent = login ? `Olá, ${primeiro}` : "Painel do representante";
  document.getElementById("crmRepSub").textContent = login
    ? `${CRM_SISTEMAS[d.sistema] || ""} · seu faturamento e a sua comissão, só com o que é seu.`
    : `Assim o representante ${d.representante} enxerga o painel dele.`;
  const clientes = d.clientes || [];
  const fatTotal = clientes.reduce((t, c) => t + Number(c.faturado), 0);
  const comTotal = clientes.reduce((t, c) => t + Number(c.comissao), 0);
  const lanc = d.lancamentos || [];
  const pctTxt = d.percentual === null || d.percentual === undefined ? "—" : String(d.percentual).replace(".", ",") + "%";
  const maxSerie = Math.max(1, ...(d.serie || []).map(x => Number(x.faturado)));
  const mesAtual = d.mes;
  const linhasCli = clientes.length ? clientes.map(c => `
      <tr><td>${escapeHtml(c.cliente)}</td><td class="num mono">${formatMoney(c.faturado)}</td><td class="num mono">${d.lancada ? formatMoney(c.comissao) : "—"}</td></tr>`).join("")
    : `<tr><td colspan="3"><div class="empty-state">Nenhum cliente seu com faturamento neste mês.</div></td></tr>`;
  const linhasSerie = (d.serie || []).map(x => {
    const mes = String(x.mes).slice(0, 7);
    const atual = String(x.mes) === String(mesAtual);
    return `<tr class="${atual ? "fc-atual" : ""}"><td>${escapeHtml(crmFatRotuloMes(mes))}</td>
      <td><div class="crm-mt-trilho"><i style="display:block;height:100%;width:${Math.round(Number(x.faturado) / maxSerie * 100)}%;background:var(--orange);"></i></div></td>
      <td class="num mono">${formatMoney(x.faturado)}</td><td class="num mono">${Number(x.comissao) ? formatMoney(x.comissao) : "—"}</td></tr>`;
  }).join("");
  const linhasLanc = lanc.length ? lanc.map(l => `
      <tr><td>${crmFatDM(l.de)} a ${crmFatDM(l.ate)}</td><td>${escapeHtml(l.cliente)}</td><td class="num mono">${formatMoney(l.valor)}</td></tr>`).join("")
    : `<tr><td colspan="3"><div class="empty-state">Nenhum lançamento neste mês ainda.</div></td></tr>`;
  corpo.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Faturamento do mês</div><div class="val">${formatMoney(fatTotal)}</div>
        <div class="kpi-sub">${clientes.filter(c => Number(c.faturado) > 0).length} ${clientes.filter(c => Number(c.faturado) > 0).length === 1 ? "cliente" : "clientes"} · ${lanc.length} ${lanc.length === 1 ? "lançamento" : "lançamentos"}</div></div>
      <div class="kpi"><div class="lbl">Percentual de comissão</div><div class="val">${pctTxt}</div>
        <div class="kpi-sub">${d.lancada ? "definido para este mês" : "ainda não definido para este mês"}</div></div>
      <div class="kpi accent"><div class="lbl">Comissão do mês</div><div class="val">${d.lancada ? formatMoney(comTotal) : "—"}</div>
        <div class="kpi-sub">${d.lancada ? `acumulado no ano: ${escapeHtml(formatMoney(d.comissao_ano))}` : "a comissão deste mês ainda não foi lançada"}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Faturamento por cliente</h2><div class="note">${escapeHtml(crmFatRotuloMes(crmRep.mes))}</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th class="num">Faturado</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhasCli}</tbody>
        ${clientes.length ? `<tfoot><tr class="fc-total"><td>Total</td><td class="num mono">${formatMoney(fatTotal)}</td><td class="num mono">${d.lancada ? formatMoney(comTotal) : "—"}</td></tr></tfoot>` : ""}
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Mês a mês</h2><div class="note">Últimos 6 meses</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th>Faturamento</th><th class="num">Faturado</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhasSerie}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Lançamentos de ${escapeHtml(crmFatRotuloMes(crmRep.mes).toLowerCase())}</h2><div class="note">Lançado pelo financeiro. Se algum valor parecer errado, fale com o seu executivo.</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Período</th><th>Cliente</th><th class="num">Valor</th></tr></thead>
        <tbody>${linhasLanc}</tbody>
      </table></div>
    </div>`;
}

function crmRepPainelIniciar() {
  const mes = document.getElementById("crmRepMes");
  const esc = document.getElementById("crmRepEscolha");
  if (!mes || !esc) return;
  mes.addEventListener("change", () => { crmRep.mes = mes.value; crmRepPainelRender(); });
  esc.addEventListener("change", () => { crmRep.escolhido = esc.value; crmRepPainelRender(); });
}
crmRepPainelIniciar();

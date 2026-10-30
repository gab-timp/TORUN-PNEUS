/* ---------------- CRM: Dashboard (mensal e anual) ---------------- */
/* Telas 13 a 16 do mockup do CRM. Uma tela só: a gestão vê o time todo (e filtra por executivo); o executivo vê só os números
   dele. Cruza o faturamento lançado pela Beth (funções de sql/crm_dashboard.sql), a meta anual (crm_meta_executivo), a comissão
   (faturamento de cada cliente no mês x % do executivo naquele mês) e as ligações já carregadas em crmState.
   Regras (definidas com o usuário):
   - meta do mês = a que a gestão digita mês a mês (crm_metas_mensais.sql); meta do time no mês = meta da equipe digitada;
   - meta do ano = a meta anual (crm_metas.sql), separada das mensais; meta do time no ano = meta anual da equipe;
   - ritmo esperado do mês = parte do mês que já passou (dias); do ano = metas mensais digitadas somadas até hoje (mês atual
     proporcional aos dias; mês sem meta digitada conta zero) dividido pela meta anual;
   - propostas = ligações com resultado "Estimativa enviada"; fechou = "Fechou negócio"; atenderam = tudo menos "Não atendeu";
   - mensal: cliente "comprou" se faturou no mês, "ainda não" se já teve faturamento lançado em qualquer época e não neste mês,
     "nunca" se nunca teve faturamento lançado (crm_dashboard_clientes_historico); ticket médio = faturamento / clientes que compraram;
   - anual: frequência = meses do ano (até o mês atual) com compra; "todo mês" = todos, "maioria" = mais da metade, "de vez em
     quando" = de 1 até a metade, "nunca" = nenhum. */

const crmDash = { modo: "mensal", mes: null, ano: null, exec: "", fat: [], pct: new Map(), metas: new Map(), metasMes: new Map(), equipeMes: new Map(), equipeAno: 0, hist: new Set(), execsMeta: [], metasOk: false, metasMesOk: false, indisponivel: false, carregando: false };

function crmPodeVerDashboard() { return currentUserIsAdmin || crmPapelEfetivo() === "gestao" || crmPapelEfetivo() === "executivo"; }
const crmDashEhGestao = () => crmPapelEfetivo() === "gestao";

/* ---------------- datas e formatos ---------------- */

const crmDashMesRotulo = (k) => `${CRM_DES_MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(0, 4)}`;
const crmDashMesCurto = (k) => CRM_MES_ABREV[Number(k.slice(5, 7)) - 1];
function crmDashMesAdd(k, n) {
  const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
const crmDashMes0 = () => todayISO().slice(0, 7);
const crmDashDiasMes = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
function crmDashCurto(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " mi";
  if (v >= 1e3) return Math.round(v / 1e3) + " mil";
  return String(Math.round(v));
}
const crmDashPctInt = (n) => Math.round(n) + "%";

// o período em análise: lista de meses, limites em dia e o que já passou dele (0 a 1)
function crmDashPeriodo() {
  const hoje = todayISO();
  if (crmDash.modo === "mensal") {
    const m = crmDash.mes;
    const ate = `${m}-${String(crmDashDiasMes(m)).padStart(2, "0")}`;
    let passou = m < crmDashMes0() ? 1 : m > crmDashMes0() ? 0 : Number(hoje.slice(8, 10)) / crmDashDiasMes(m);
    return { meses: [m], de: m + "-01", ate, passou, rotulo: crmDashMesRotulo(m), anterior: crmDashMesAdd(m, -1), divisorMeta: 12 };
  }
  const a = crmDash.ano;
  const meses = Array.from({ length: 12 }, (_, i) => `${a}-${String(i + 1).padStart(2, "0")}`);
  const atual = Number(hoje.slice(0, 4));
  let passou = a < atual ? 1 : a > atual ? 0 : (Number(hoje.slice(5, 7)) - 1 + Number(hoje.slice(8, 10)) / crmDashDiasMes(crmDashMes0())) / 12;
  return { meses, de: `${a}-01-01`, ate: `${a}-12-31`, passou, rotulo: String(a), anterior: String(a - 1), divisorMeta: 1 };
}

/* ---------------- carga ---------------- */

async function crmDashCarregar() {
  const ano = crmDash.modo === "anual" ? crmDash.ano : Number(crmDash.mes.slice(0, 4));
  const gestao = crmDashEhGestao();
  const [f, p, m, ex, mm, em, ea, h] = await Promise.all([
    sb.rpc("crm_dashboard_faturamento", { p_ano: ano }),
    sb.rpc("crm_dashboard_percentuais", { p_ano: ano }),
    sb.from("crm_meta_executivo").select("executivo_user_id, valor").eq("ano", ano),
    gestao ? sb.rpc("crm_executivos_metas") : Promise.resolve({ data: [], error: null }),
    sb.from("crm_meta_mes_executivo").select("mes, executivo_user_id, valor").gte("mes", ano + "-01-01").lte("mes", ano + "-12-01"),
    gestao ? sb.from("crm_meta_mes_equipe").select("mes, valor").gte("mes", ano + "-01-01").lte("mes", ano + "-12-01") : Promise.resolve({ data: [], error: null }),
    gestao ? sb.from("crm_meta_equipe").select("valor").eq("ano", ano).maybeSingle() : Promise.resolve({ data: null, error: null }),
    sb.rpc("crm_dashboard_clientes_historico")
  ]);
  if (f.error || p.error) { crmDash.indisponivel = f.error ? f.error.message : p.error.message; return false; }
  crmDash.indisponivel = false;
  crmDash.fat = (f.data || []).map(r => ({ sistema: r.sistema, cliente: r.cliente, exec: r.executivo_user_id, execNome: r.executivo_nome || "", mes: String(r.mes).slice(0, 7), valor: Number(r.valor) }));
  crmDash.pct = new Map();
  (p.data || []).forEach(r => {
    if (!crmDash.pct.has(r.executivo_user_id)) crmDash.pct.set(r.executivo_user_id, []);
    crmDash.pct.get(r.executivo_user_id).push({ mes: String(r.mes).slice(0, 7), pct: Number(r.percentual) });
  });
  crmDash.pct.forEach(arr => arr.sort((a, b) => a.mes.localeCompare(b.mes)));
  crmDash.metasOk = !m.error;
  crmDash.metas = new Map((m.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  crmDash.metasMesOk = !mm.error && !em.error;
  crmDash.metasMes = new Map((mm.data || []).map(r => [r.executivo_user_id + "|" + String(r.mes).slice(0, 7), Number(r.valor)]));
  crmDash.equipeMes = new Map((em.data || []).map(r => [String(r.mes).slice(0, 7), Number(r.valor)]));
  crmDash.equipeAno = ea.error || !ea.data ? 0 : Number(ea.data.valor);
  crmDash.hist = new Set(h.error ? [] : (h.data || []).map(r => r.sistema + "|" + r.cliente));
  crmDash.execsMeta = ex.error ? [] : (ex.data || []).map(e => ({ id: e.user_id, nome: e.nome, sistemas: e.sistemas || [] }));
  return true;
}

/* ---------------- cálculos ---------------- */

// % do executivo no mês: a linha do mês ou a mais recente antes dele
function crmDashPct(execId, mes) {
  const arr = crmDash.pct.get(execId) || [];
  let v = 0;
  for (const x of arr) { if (x.mes <= mes) v = x.pct; else break; }
  return v;
}

// executivos em análise: gestão = os do sistema aberto (ou só o escolhido); executivo = ele mesmo
function crmDashExecs() {
  const s = crmSistemaAtual();
  if (!crmDashEhGestao()) return [{ id: crmMeuId(), nome: currentUserNome || "Eu" }];
  const mapa = new Map();
  crmState.carteira.filter(c => c.sistema === s).forEach(c => mapa.set(c.executivoId, c.executivoNome || "(sem nome)"));
  crmDash.fat.filter(r => r.sistema === s).forEach(r => { if (!mapa.has(r.exec)) mapa.set(r.exec, r.execNome || "(sem nome)"); });
  let lista = [...mapa.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  if (crmDash.exec) lista = lista.filter(e => e.id === crmDash.exec);
  return lista;
}

function crmDashDados() {
  const s = crmSistemaAtual();
  const per = crmDashPeriodo();
  const execs = crmDashExecs();
  const ids = new Set(execs.map(e => e.id));
  const rows = crmDash.fat.filter(r => r.sistema === s && ids.has(r.exec));
  const doPeriodo = rows.filter(r => per.meses.includes(r.mes));
  const ligs = crmState.ligacoes.filter(l => {
    if (l.sistema !== s || !ids.has(l.executivoId)) return false;
    const dia = crmDiaLocal(l.createdAt);
    return dia >= per.de && dia <= per.ate;
  });
  const soma = (arr) => arr.reduce((t, r) => t + r.valor, 0);
  const comissao = (arr) => crmFatArred(arr.reduce((t, r) => t + r.valor * crmDashPct(r.exec, r.mes) / 100, 0));
  // meta do executivo no período: a do mês digitada (mensal) ou a anual (anual)
  const metaDe = (e) => crmDash.modo === "mensal" ? (crmDash.metasMes.get(e.id + "|" + per.meses[0]) || 0) : (crmDash.metas.get(e.id) || 0);
  // meta do time: a da equipe cadastrada quando a gestão olha todos; senão a soma dos executivos em análise
  const metaTime = () => crmDashEhGestao() && !crmDash.exec
    ? (crmDash.modo === "mensal" ? (crmDash.equipeMes.get(per.meses[0]) || 0) : crmDash.equipeAno)
    : execs.reduce((t, e) => t + metaDe(e), 0);
  // ritmo esperado do ano: metas mensais digitadas somadas até hoje / meta anual
  const ritmoAno = (metaAno) => {
    if (!(metaAno > 0)) return null;
    const hoje = todayISO(), mAtual = hoje.slice(0, 7), frac = Number(hoje.slice(8, 10)) / crmDashDiasMes(mAtual);
    const mensalDe = (m) => crmDashEhGestao() && !crmDash.exec ? (crmDash.equipeMes.get(m) || 0) : execs.reduce((t, e) => t + (crmDash.metasMes.get(e.id + "|" + m) || 0), 0);
    let acum = 0;
    per.meses.forEach(m => { if (m < mAtual) acum += mensalDe(m); else if (m === mAtual) acum += mensalDe(m) * frac; });
    return acum / metaAno * 100;
  };
  return { s, per, execs, ids, rows, doPeriodo, ligs, soma, comissao, metaDe, metaTime, ritmoAno };
}

/* ---------------- peças de tela ---------------- */

function crmDashKpi(rotulo, valor, sub, alerta) {
  return `<div class="kpi ${alerta ? "crm-alerta" : ""}"><div class="lbl">${rotulo}</div><div class="val ${String(valor).length > 9 ? "crm-val-texto" : ""}">${valor}</div>${sub ? `<div class="muted sv-sub">${sub}</div>` : ""}</div>`;
}

function crmDashBarras(meses, valores, titulo, parcialUltimo) {
  const max = Math.max(...valores, 1);
  const cols = meses.map((m, i) => `<div class="crm-fat-col" title="${escapeAttr(crmDashMesRotulo(m) + ": " + formatMoney(valores[i]))}">
      <span class="crm-fat-val mono">${valores[i] > 0 ? crmDashCurto(valores[i]) : "—"}</span>
      <div class="crm-fat-bar ${parcialUltimo && i === meses.length - 1 ? "parcial" : ""}" style="height:${Math.max(Math.round(valores[i] / max * 100), valores[i] > 0 ? 3 : 0)}%"></div>
      <span class="crm-fat-mes">${crmDashMesCurto(m)}</span></div>`).join("");
  return `<div class="card"><div class="card-head"><h2>${titulo}</h2></div><div class="crm-fat-grafico" role="img" aria-label="${escapeAttr(titulo)}">${cols}</div></div>`;
}

const crmDashMedidor = (pct) => `<div class="crm-meter"><div class="crm-meter-barra"><i style="width:${Math.min(Math.max(pct, 0), 100)}%"></i></div></div>`;

function crmRenderDashboardCorpo() {
  const corpo = document.getElementById("crmDashCorpo");
  const d = crmDashDados();
  const { per, execs, rows, doPeriodo, ligs, soma, comissao, metaDe, metaTime, ritmoAno } = d;
  const gestao = crmDashEhGestao();
  const mensal = crmDash.modo === "mensal";
  const nomePer = mensal ? "do mês" : "do ano";

  /* meta */
  const metaTotal = metaTime();
  const fat = soma(doPeriodo);
  const ating = metaTotal > 0 ? fat / metaTotal * 100 : 0;
  const ritmo = mensal ? per.passou * 100 : ritmoAno(metaTotal);
  const metasDisponiveis = mensal ? crmDash.metasMesOk : crmDash.metasOk;
  const fatAnt = mensal ? soma(rows.filter(r => r.mes === per.anterior)) : soma(rows.filter(r => r.mes.startsWith(per.anterior)));
  const parcial = per.passou > 0 && per.passou < 1;
  const metaTxt = !metasDisponiveis ? `<div class="muted sv-sub">As metas ainda não estão disponíveis (rode o SQL das metas${mensal ? " mensais, sql/crm_metas_mensais.sql" : ""}).</div>`
    : metaTotal > 0 ? `
      <div class="crm-dash-meta-num"><b class="mono">${crmPct(ating)}</b> <span class="muted">da meta</span></div>
      ${crmDashMedidor(ating)}
      <div class="muted sv-sub">${formatMoney(fat)} faturados de ${formatMoney(metaTotal)} · faltam ${formatMoney(Math.max(metaTotal - fat, 0))}</div>
      <div class="muted sv-sub">${parcial && ritmo !== null ? `ritmo esperado hoje: ${crmDashPctInt(ritmo)} da meta · ` : ""}${mensal ? crmDashMesRotulo(per.anterior) : per.anterior} fechou em ${formatMoney(fatAnt)}</div>`
    : `<div class="aviso-meta muted sv-sub">${gestao ? (mensal ? `Nenhuma meta cadastrada para ${escapeHtml(crmDashMesRotulo(per.meses[0]))}. A gestão cadastra em Gestão › Metas › Mês a mês.` : "Nenhuma meta anual cadastrada para este ano. A gestão cadastra em Gestão › Metas.") : (mensal ? "A gestão ainda não definiu a sua meta deste mês." : "A gestão ainda não definiu a sua meta deste ano.")}</div>`;
  const cartaoMeta = `<div class="card crm-dash-meta"><div class="card-head"><h2>${gestao && !crmDash.exec ? `Meta ${mensal ? "do mês" : "do ano"} · time` : `Sua meta ${mensal ? "do mês" : "do ano"}`}</h2><div class="note">${escapeHtml(per.rotulo)}${parcial ? " (até hoje)" : ""}</div></div>${metaTxt}</div>`;

  const tabelaMeta = gestao && !crmDash.exec && metasDisponiveis && execs.length ? `
    <div class="card"><div class="card-head"><h2>Meta ${nomePer} por executivo</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Executivo</th><th class="num">Meta ${nomePer}</th><th class="num">Faturamento</th><th class="num">Atingimento</th></tr></thead>
      <tbody>${execs.map(e => { const f = soma(doPeriodo.filter(r => r.exec === e.id)), m = metaDe(e); return `<tr><td><b>${escapeHtml(e.nome)}</b></td><td class="num">${m > 0 ? formatMoney(m) : "—"}</td><td class="num">${formatMoney(f)}</td><td class="num">${m > 0 ? crmPct(f / m * 100) : "—"}</td></tr>`; }).join("")}</tbody></table></div></div>` : "";

  /* números do período */
  const res = crmDesResumo(ligs, 0);
  const comis = comissao(doPeriodo);
  const comisAnt = mensal ? comissao(rows.filter(r => r.mes === per.anterior)) : comissao(rows.filter(r => r.mes.startsWith(per.anterior)));
  const propostas = ligs.filter(l => l.resultado === "Estimativa enviada").length;
  const kpis = `<div class="kpis">
      ${crmDashKpi(gestao && !crmDash.exec ? `Comissão ${nomePer}` : `Sua comissão ${nomePer}`, formatMoney(comis), `${crmDashMesRotuloOuAno(per.anterior, mensal)}: ${formatMoney(comisAnt)}`)}
      ${crmDashKpi("Propostas enviadas", fmt(propostas), `estimativas · ${crmDesPct(propostas, res.total)} das ligações`)}
      ${crmDashKpi(`Fechou ${mensal ? "no mês" : "no ano"}`, fmt(res.fecharam), res.fecharam === 1 ? "negócio" : "negócios")}
      ${crmDashKpi("Taxa de fechamento", crmDesPct(res.fecharam, res.atenderam), `${fmt(res.fecharam)} em ${fmt(res.atenderam)} atendidas`)}
      ${crmDashKpi(`Ligações ${mensal ? "no mês" : "no ano"}`, fmt(res.total), `${crmDesPct(res.atenderam, res.total)} atenderam`)}
    </div>`;

  const tabelaExec = gestao && !crmDash.exec && execs.length ? `
    <div class="card"><div class="card-head"><h2>Comissão, propostas e fechamento por executivo</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Executivo</th><th class="num">Comissão</th><th class="num">Propostas enviadas</th><th class="num">Fechou</th><th class="num">Taxa de fechamento</th></tr></thead>
      <tbody>${execs.map(e => {
        const l = ligs.filter(x => x.executivoId === e.id), r = crmDesResumo(l, 0);
        return `<tr><td><b>${escapeHtml(e.nome)}</b></td><td class="num">${formatMoney(comissao(doPeriodo.filter(x => x.exec === e.id)))}</td><td class="num">${fmt(l.filter(x => x.resultado === "Estimativa enviada").length)}</td><td class="num">${fmt(r.fecharam)}</td><td class="num">${crmDesPct(r.fecharam, r.atenderam)}</td></tr>`;
      }).join("")}</tbody></table></div></div>` : "";

  /* comportamento dos clientes */
  const clientes = crmState.carteira.filter(c => c.sistema === d.s && crmTipoDe(c.cliente) === "cliente" && d.ids.has(c.executivoId));
  const ate = (c) => rows.filter(r => r.cliente === c.cliente);
  const info = clientes.map(c => {
    const r = ate(c);
    const mesesCom = per.meses.filter(m => r.some(x => x.mes === m && x.valor > 0));
    return { c, fatPer: soma(r.filter(x => per.meses.includes(x.mes))), mesesCom: mesesCom.length, jaComprou: r.some(x => x.valor > 0) || crmDash.hist.has(c.sistema + "|" + c.cliente), ant: soma(r.filter(x => x.mes === per.anterior)) };
  });
  const comp = info.filter(x => x.fatPer > 0);
  const ticket = comp.length ? soma(comp.map(x => ({ valor: x.fatPer }))) / comp.length : 0;
  let comportamento = "";
  if (mensal) {
    const ainda = info.filter(x => x.fatPer === 0 && x.jaComprou), nunca = info.filter(x => x.fatPer === 0 && !x.jaComprou);
    const porExec = (e) => { const i = info.filter(x => x.c.executivoId === e.id), c2 = i.filter(x => x.fatPer > 0); return `<tr><td><b>${escapeHtml(e.nome)}</b></td><td class="num">${i.length}</td><td class="num">${c2.length}</td><td class="num">${i.filter(x => x.fatPer === 0 && x.jaComprou).length}</td><td class="num">${i.filter(x => x.fatPer === 0 && !x.jaComprou).length}</td><td class="num">${c2.length ? formatMoney(c2.reduce((t, x) => t + x.fatPer, 0) / c2.length) : "—"}</td></tr>`; };
    const paradosLista = ainda.filter(x => x.ant > 0).sort((a, b) => b.ant - a.ant).slice(0, 5);
    comportamento = `
      <div class="card"><div class="card-head"><h2>Comportamento dos clientes</h2><div class="note">${info.length} ${info.length === 1 ? "cliente" : "clientes"} na carteira</div></div>
        <div class="kpis">${crmDashKpi(`Compraram em ${crmDashMesCurto(per.meses[0])}`, fmt(comp.length), "")}${crmDashKpi(`Ainda não compraram em ${crmDashMesCurto(per.meses[0])}`, fmt(ainda.length), "")}${crmDashKpi("Nunca compraram", fmt(nunca.length), "")}${crmDashKpi("Ticket médio", ticket ? formatMoney(ticket) : "—", "faturamento do mês ÷ clientes que compraram")}</div>
        ${gestao && !crmDash.exec ? `<div class="table-wrap"><table><thead><tr><th>Executivo</th><th class="num">Clientes</th><th class="num">Compraram</th><th class="num">Ainda não</th><th class="num">Nunca</th><th class="num">Ticket médio</th></tr></thead><tbody>${execs.map(porExec).join("")}</tbody></table></div>` : `
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Situação</th><th class="num">${crmDashMesCurto(per.anterior)}</th><th class="num">${crmDashMesCurto(per.meses[0])}</th></tr></thead><tbody>${info.slice().sort((a, b) => b.fatPer - a.fatPer || b.ant - a.ant || a.c.cliente.localeCompare(b.c.cliente)).map(x => `<tr><td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button></td><td>${x.fatPer > 0 ? "Comprou" : x.jaComprou ? "Ainda não comprou" : "Nunca comprou"}</td><td class="num">${x.ant > 0 ? formatMoney(x.ant) : "—"}</td><td class="num">${x.fatPer > 0 ? formatMoney(x.fatPer) : "—"}</td></tr>`).join("")}</tbody></table></div>`}
      </div>
      ${gestao && paradosLista.length ? `<div class="card"><div class="card-head"><h2>Compraram em ${escapeHtml(crmDashMesRotulo(per.anterior))} e ainda não em ${escapeHtml(crmDashMesCurto(per.meses[0]))}</h2><div class="note">os ${paradosLista.length} maiores</div></div>
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Executivo</th><th class="num">${crmDashMesCurto(per.anterior)}</th></tr></thead><tbody>${paradosLista.map(x => `<tr><td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button></td><td>${escapeHtml(x.c.executivoNome || "—")}</td><td class="num">${formatMoney(x.ant)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  } else {
    const elapsed = per.meses.filter(m => m <= crmDashMes0()).length || 12;
    const freq = (x) => x.mesesCom === 0 ? "nunca" : x.mesesCom >= elapsed ? "todo" : x.mesesCom > elapsed / 2 ? "maioria" : "eventual";
    const cont = (lista, k) => lista.filter(x => freq(x) === k).length;
    const porExec = (e) => { const i = info.filter(x => x.c.executivoId === e.id), c2 = i.filter(x => x.fatPer > 0); return `<tr><td><b>${escapeHtml(e.nome)}</b></td><td class="num">${cont(i, "todo")}</td><td class="num">${cont(i, "maioria")}</td><td class="num">${cont(i, "eventual")}</td><td class="num">${cont(i, "nunca")}</td><td class="num">${c2.length ? formatMoney(c2.reduce((t, x) => t + x.fatPer, 0) / c2.length) : "—"}</td></tr>`; };
    const rot = { todo: "Compra todo mês", maioria: "Na maioria dos meses", eventual: "De vez em quando", nunca: "Nunca comprou" };
    comportamento = `
      <div class="card"><div class="card-head"><h2>Comportamento dos clientes</h2><div class="note">frequência: meses com compra em ${per.rotulo}${elapsed < 12 ? ` (${elapsed} ${elapsed === 1 ? "mês" : "meses"})` : ""} · ticket médio = faturamento do ano ÷ clientes que compraram</div></div>
        <div class="kpis">${["todo", "maioria", "eventual", "nunca"].map(k => crmDashKpi(rot[k], fmt(cont(info, k)), "")).join("")}${crmDashKpi("Ticket médio", ticket ? formatMoney(ticket) : "—", "")}</div>
        ${gestao && !crmDash.exec ? `<div class="table-wrap"><table><thead><tr><th>Executivo</th><th class="num">Todo mês</th><th class="num">Maioria</th><th class="num">De vez em quando</th><th class="num">Nunca</th><th class="num">Ticket médio</th></tr></thead><tbody>${execs.map(porExec).join("")}</tbody></table></div>` : `
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="num">Meses com compra</th><th class="num">Faturamento no ano</th><th class="num">Parte da carteira</th></tr></thead><tbody>${info.slice().sort((a, b) => b.fatPer - a.fatPer || a.c.cliente.localeCompare(b.c.cliente)).map(x => `<tr><td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button></td><td class="num">${x.mesesCom} de ${elapsed}</td><td class="num">${formatMoney(x.fatPer)}</td><td class="num">${fat > 0 ? crmPct(x.fatPer / fat * 100) : "—"}</td></tr>`).join("")}</tbody></table></div>`}
      </div>`;
  }

  /* gráficos e ranking */
  const mesesGraf = mensal ? [-5, -4, -3, -2, -1, 0].map(n => crmDashMesAdd(per.meses[0], n)) : per.meses;
  const valsFat = mesesGraf.map(m => soma(rows.filter(r => r.mes === m)));
  const valsCom = mesesGraf.map(m => comissao(rows.filter(r => r.mes === m)));
  const ultimoParcial = mensal ? per.meses[0] === crmDashMes0() : false;
  const graficos = `<div class="crm-dash-par">${crmDashBarras(mesesGraf, valsFat, mensal ? "Faturamento por mês" : "Faturamento por mês em " + per.rotulo, ultimoParcial)}${crmDashBarras(mesesGraf, valsCom, "Comissão por mês", ultimoParcial)}</div>`;

  const topo = info.filter(x => x.fatPer > 0).sort((a, b) => b.fatPer - a.fatPer).slice(0, mensal ? 6 : 5);
  const ranking = topo.length ? `<div class="card"><div class="card-head"><h2>${mensal ? "Por cliente" : "Clientes que mais compraram no ano"}</h2><div class="note">${mensal ? "os maiores do mês" : `os ${topo.length} maiores somam ${crmPct(fat > 0 ? soma(topo.map(x => ({ valor: x.fatPer }))) / fat * 100 : 0)} do faturamento`}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Cliente</th>${gestao ? "<th>Executivo</th>" : ""}<th class="num">Faturamento</th>${mensal ? '<th class="num">Comissão</th>' : '<th class="num">Parte</th>'}</tr></thead>
      <tbody>${topo.map(x => `<tr><td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(x.c.id)}">${escapeHtml(x.c.cliente)}</button></td>${gestao ? `<td>${escapeHtml(x.c.executivoNome || "—")}</td>` : ""}<td class="num">${formatMoney(x.fatPer)}</td><td class="num">${mensal ? formatMoney(comissao(doPeriodo.filter(r => r.cliente === x.c.cliente))) : (fat > 0 ? crmPct(x.fatPer / fat * 100) : "—")}</td></tr>`).join("")}</tbody></table></div></div>` : "";

  corpo.innerHTML = `<div class="crm-dash-topo">${cartaoMeta}</div>${tabelaMeta}${kpis}${tabelaExec}${comportamento}${graficos}${ranking}`;
}

const crmDashMesRotuloOuAno = (k, mensal) => mensal ? crmDashMesCurto(k) + "/" + k.slice(2, 4) : k;

/* ---------------- tela ---------------- */

async function crmRenderDashboard() {
  const corpo = document.getElementById("crmDashCorpo");
  if (!corpo) return;
  const gestao = crmDashEhGestao();
  if (!crmDash.mes) crmDash.mes = crmDashMes0();
  if (!crmDash.ano) crmDash.ano = Number(crmDashMes0().slice(0, 4));
  document.querySelectorAll("#crmDashModo button").forEach(b => b.classList.toggle("on", b.dataset.crmdashmodo === crmDash.modo));
  document.getElementById("crmDashMesCampo").style.display = crmDash.modo === "mensal" ? "" : "none";
  document.getElementById("crmDashAnoCampo").style.display = crmDash.modo === "anual" ? "" : "none";
  document.getElementById("crmDashMes").innerHTML = Array.from({ length: 12 }, (_, i) => crmDashMesAdd(crmDashMes0(), -i)).map(m => `<option value="${m}" ${m === crmDash.mes ? "selected" : ""}>${crmDashMesRotulo(m)}${m === crmDashMes0() ? " (até hoje)" : ""}</option>`).join("");
  const anoAtual = Number(crmDashMes0().slice(0, 4));
  document.getElementById("crmDashAno").innerHTML = [anoAtual, anoAtual - 1, anoAtual - 2].map(a => `<option value="${a}" ${a === crmDash.ano ? "selected" : ""}>${a}</option>`).join("");
  const campoExec = document.getElementById("crmDashExecCampo");
  campoExec.style.display = gestao ? "" : "none";
  document.getElementById("crmDashSub").textContent = gestao
    ? "Meta, comissão, propostas, fechamento e como a carteira está comprando, do time e de cada executivo."
    : "Seus números: faturamento, meta, comissão, propostas, fechamento e como a sua carteira está comprando.";
  if (gestao) {
    const s = crmSistemaAtual();
    const mapa = new Map();
    crmState.carteira.filter(c => c.sistema === s).forEach(c => mapa.set(c.executivoId, c.executivoNome || "(sem nome)"));
    const lista = [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    if (crmDash.exec && !mapa.has(crmDash.exec)) crmDash.exec = "";
    document.getElementById("crmDashExec").innerHTML = `<option value="">Todos</option>` + lista.map(([id, n]) => `<option value="${escapeAttr(id)}" ${id === crmDash.exec ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
  }
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando o dashboard…</div></div>`;
  const pedido = crmDash.modo + crmDash.mes + crmDash.ano;
  const ok = await crmDashCarregar();
  if (pedido !== crmDash.modo + crmDash.mes + crmDash.ano) return;
  if (!ok) {
    corpo.innerHTML = `<div class="card"><div class="empty-state">O dashboard ainda não está disponível: rode o SQL <b>sql/crm_dashboard.sql</b> no Supabase. (${escapeHtml(String(crmDash.indisponivel))})</div></div>`;
    return;
  }
  crmRenderDashboardCorpo();
}

function crmDashInit() {
  const raiz = document.getElementById("crmDashCorpo");
  if (!raiz) return;
  document.getElementById("crmDashModo").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.crmdashmodo === crmDash.modo) return;
    crmDash.modo = b.dataset.crmdashmodo;
    crmRenderDashboard();
  });
  document.getElementById("crmDashMes").addEventListener("change", (e) => { crmDash.mes = e.target.value; crmRenderDashboard(); });
  document.getElementById("crmDashAno").addEventListener("change", (e) => { crmDash.ano = Number(e.target.value); crmRenderDashboard(); });
  document.getElementById("crmDashExec").addEventListener("change", (e) => { crmDash.exec = e.target.value; crmRenderDashboard(); });
}

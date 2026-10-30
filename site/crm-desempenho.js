/* ---------------- CRM: Ligações e desempenho (gestão) ---------------- */
/* Tela 12 do mockup do CRM. Só lê o que já está carregado em crmState (ligações e carteira do sistema aberto); a gestão e o
   administrador veem todos os executivos, e dá para filtrar por período e por executivo.
   Atenderam = qualquer resultado diferente de "Não atendeu". Taxa de contato = atenderam / ligações. Taxa de fechamento =
   "Fechou negócio" / atenderam. "Interesse + proposta" = Interesse + Estimativa enviada. Follow-up atrasado = próximo
   follow-up anterior a hoje na carteira (cliente efetivo ou prospect; representante não tem follow-up). */

const CRM_DES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CRM_DES_ULTIMAS = 25;

const crmDes = { periodo: "mes", exec: "" };

function crmPodeVerDesempenho() { return currentUserIsAdmin || crmPapelEfetivo() === "gestao"; }

function crmDesPct(parte, todo) { return todo > 0 ? Math.round(parte / todo * 100) + "%" : "—"; }

// "AAAA-MM-DD" do primeiro e do último dia do período escolhido
function crmDesIntervalo() {
  const hoje = todayISO();
  const a = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
  if (crmDes.periodo === "7d") {
    const d = new Date(a, m - 1, Number(hoje.slice(8, 10)) - 6);
    return [d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), hoje];
  }
  const ref = new Date(a, m - 1 - (crmDes.periodo === "mesant" ? 1 : 0), 1);
  const ano = ref.getFullYear(), mes = String(ref.getMonth() + 1).padStart(2, "0");
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return [`${ano}-${mes}-01`, `${ano}-${mes}-${String(ultimo).padStart(2, "0")}`];
}

function crmDesOpcoesPeriodo() {
  const hoje = todayISO();
  const m = Number(hoje.slice(5, 7)) - 1;
  const ant = (m + 11) % 12;
  return [
    ["mes", `${CRM_DES_MESES[m]} (até ${crmDataCurta(hoje)})`],
    ["mesant", CRM_DES_MESES[ant]],
    ["7d", "Últimos 7 dias"]
  ];
}

function crmDesExecutivos() {
  const s = crmSistemaAtual();
  const mapa = new Map();
  crmState.carteira.filter(c => c.sistema === s).forEach(c => mapa.set(c.executivoId, c.executivoNome || "(sem nome)"));
  crmState.ligacoes.filter(l => l.sistema === s).forEach(l => { if (!mapa.has(l.executivoId)) mapa.set(l.executivoId, l.executivoNome || "(sem nome)"); });
  return [...mapa.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
}

function crmDesAtrasados(execId) {
  const s = crmSistemaAtual(), hoje = todayISO();
  return crmState.carteira.filter(c => c.sistema === s && !crmEhRepresentante(c.cliente) && (!execId || c.executivoId === execId))
    .filter(c => { const fu = crmResumo(c).fu; return fu && fu < hoje; }).length;
}

function crmDesResumo(ligs, atrasados) {
  const atenderam = ligs.filter(l => l.resultado !== "Não atendeu").length;
  const conta = (r) => ligs.filter(l => l.resultado === r).length;
  return {
    total: ligs.length, atenderam,
    interesse: conta("Interesse") + conta("Estimativa enviada"),
    fecharam: conta("Fechou negócio"), atrasados
  };
}

function crmRenderDesempenho() {
  const corpo = document.getElementById("crmDesCorpo");
  if (!corpo) return;
  const s = crmSistemaAtual();
  const execs = crmDesExecutivos();
  if (crmDes.exec && !execs.some(e => e.id === crmDes.exec)) crmDes.exec = "";
  document.getElementById("crmDesPeriodo").innerHTML = crmDesOpcoesPeriodo().map(([v, t]) => `<option value="${v}" ${v === crmDes.periodo ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
  document.getElementById("crmDesExec").innerHTML = `<option value="">Todos</option>` + execs.map(e => `<option value="${escapeAttr(e.id)}" ${e.id === crmDes.exec ? "selected" : ""}>${escapeHtml(e.nome)}</option>`).join("");

  const [de, ate] = crmDesIntervalo();
  const todas = crmState.ligacoes.filter(l => {
    if (l.sistema !== s) return false;
    const dia = crmDiaLocal(l.createdAt);
    return dia >= de && dia <= ate;
  });
  const ligs = crmDes.exec ? todas.filter(l => l.executivoId === crmDes.exec) : todas;
  const time = crmDesResumo(ligs, crmDesAtrasados(crmDes.exec));

  const kpis = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Ligações</div><div class="val">${fmt(time.total)}</div></div>
      <div class="kpi"><div class="lbl">Taxa de contato</div><div class="val">${crmDesPct(time.atenderam, time.total)}</div><div class="muted sv-sub">${fmt(time.atenderam)} de ${fmt(time.total)} atenderam</div></div>
      <div class="kpi"><div class="lbl">Taxa de fechamento</div><div class="val">${crmDesPct(time.fecharam, time.atenderam)}</div><div class="muted sv-sub">${fmt(time.fecharam)} ${time.fecharam === 1 ? "negócio fechado" : "negócios fechados"} em ${fmt(time.atenderam)} atendidas</div></div>
      <div class="kpi ${time.atrasados ? "crm-alerta" : ""}"><div class="lbl">Follow-ups atrasados</div><div class="val">${fmt(time.atrasados)}</div></div>
    </div>`;

  const linhasExec = (crmDes.exec ? execs.filter(e => e.id === crmDes.exec) : execs).map(e => {
    const r = crmDesResumo(todas.filter(l => l.executivoId === e.id), crmDesAtrasados(e.id));
    return `<tr><td><b>${escapeHtml(e.nome)}</b></td><td class="num">${fmt(r.total)}</td><td class="num">${fmt(r.atenderam)}</td><td class="num">${crmDesPct(r.atenderam, r.total)}</td>
      <td class="num">${fmt(r.interesse)}</td><td class="num">${fmt(r.fecharam)}</td><td class="num">${crmDesPct(r.fecharam, r.atenderam)}</td><td class="num">${fmt(r.atrasados)}</td></tr>`;
  }).join("");
  const tabelaExec = `
    <div class="card">
      <div class="card-head"><h2>Desempenho por executivo</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Executivo</th><th class="num">Ligações</th><th class="num">Atenderam</th><th class="num">Taxa de contato</th><th class="num">Interesse + proposta</th><th class="num">Fecharam</th><th class="num">Taxa de fechamento</th><th class="num">Follow-ups atrasados</th></tr></thead>
        <tbody>${linhasExec}</tbody>
        <tfoot><tr><td><b>Time</b></td><td class="num">${fmt(time.total)}</td><td class="num">${fmt(time.atenderam)}</td><td class="num">${crmDesPct(time.atenderam, time.total)}</td><td class="num">${fmt(time.interesse)}</td><td class="num">${fmt(time.fecharam)}</td><td class="num">${crmDesPct(time.fecharam, time.atenderam)}</td><td class="num">${fmt(time.atrasados)}</td></tr></tfoot>
      </table></div>
    </div>`;

  const maior = Math.max(1, ...CRM_RESULTADOS.map(r => ligs.filter(l => l.resultado === r).length));
  const grafico = `
    <div class="card">
      <div class="card-head"><h2>Como terminaram as ligações</h2><div class="note">${fmt(time.total)} ${time.total === 1 ? "ligação" : "ligações"} no período</div></div>
      <div class="crm-des-barras">${CRM_RESULTADOS.map(r => {
        const n = ligs.filter(l => l.resultado === r).length;
        return `<div class="crm-des-linha"><span class="crm-des-rot">${crmPill(r)}</span>
          <span class="crm-des-trilho"><span class="crm-des-barra" style="width:${Math.round(n / maior * 100)}%"></span></span>
          <span class="crm-des-n mono">${fmt(n)} · ${crmDesPct(n, time.total)}</span></div>`;
      }).join("")}</div>
    </div>`;

  const recentes = ligs.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, CRM_DES_ULTIMAS);
  const idDe = (l) => { const c = crmState.carteira.find(x => x.sistema === l.sistema && x.cliente === l.cliente); return c ? c.id : ""; };
  const ultimas = `
    <div class="card">
      <div class="card-head"><h2>Últimas ligações</h2><div class="note">${crmDes.exec ? "do executivo escolhido" : "de todos os executivos"} · ${recentes.length < ligs.length ? `as ${recentes.length} mais recentes de ${fmt(ligs.length)}` : `${fmt(ligs.length)} no período`}</div></div>
      ${recentes.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Executivo</th><th>Cliente</th><th>Contato</th><th>Resultado</th><th>Próximo</th></tr></thead>
        <tbody>${recentes.map(l => {
          const id = idDe(l);
          return `<tr>
            <td><span class="mono">${crmDataCurta(crmDiaLocal(l.createdAt))}</span> <span class="muted sv-sub">${crmHoraLocal(l.createdAt)}</span></td>
            <td>${escapeHtml(l.executivoNome)}</td>
            <td>${id ? `<button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(id)}">${escapeHtml(l.cliente)}</button>` : escapeHtml(l.cliente)}</td>
            <td>${l.contatoNome ? escapeHtml(l.contatoNome) : '<span class="muted">—</span>'}</td>
            <td>${crmPill(l.resultado)}</td>
            <td>${l.proximoFollowup ? `<span class="mono">${crmDataCurta(l.proximoFollowup)}</span>` : '<span class="muted">—</span>'}</td>
          </tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty-state">Nenhuma ligação registrada neste período.</div>`}
    </div>`;

  corpo.innerHTML = kpis + tabelaExec + `<div class="crm-des-par">${grafico}</div>` + ultimas;
}

function crmDesInit() {
  const sel = document.getElementById("crmDesPeriodo");
  if (!sel) return;
  sel.addEventListener("change", (e) => { crmDes.periodo = e.target.value; crmRenderDesempenho(); });
  document.getElementById("crmDesExec").addEventListener("change", (e) => { crmDes.exec = e.target.value; crmRenderDesempenho(); });
}

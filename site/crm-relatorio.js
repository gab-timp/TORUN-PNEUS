/* ---------------- CRM: Relatório de comissão (Financeiro > Relatório de comissão) ---------------- */
/* Tela 11 do mockup do CRM. Financeiro e gestão (e o administrador) veem, do sistema aberto, a comissão de um mês: cartões por
   executivo (% do executivo naquele mês, faturamento e comissão), o detalhe por cliente com subtotal por executivo e o total
   geral. Só aparecem clientes com faturamento no mês. Cliente que vem por representante fica dentro do executivo, abaixo de
   uma linha de grupo do representante (que soma os clientes dele). Comissão = faturamento do cliente no mês x % do executivo
   no mês (o % de um mês sem linha própria é o último anterior). Os dados são os mesmos da tela Faturamento (lançamentos,
   itens e crm_comissao_percentual); o executivo de cada item é o que estava na carteira quando a Beth lançou. Exporta CSV
   e PDF respeitando os filtros de mês e executivo. Usa os helpers de data de crm-faturamento.js. */

const crmRel = { mes: null, exec: "", lanc: [], itens: [], pct: new Map(), indisponivel: false, linhas: [] };

/* ---------------- carga ---------------- */

async function crmRelCarregar() {
  const s = crmSistemaAtual();
  const mes = crmRel.mes;
  const ini = crmFatData(mes, 1), fim = crmFatData(mes, crmFatUltimoDia(mes));
  const l = await sb.from("crm_faturamento_lancamentos").select("*").eq("sistema", s).gte("periodo_de", ini).lte("periodo_de", fim).order("periodo_de");
  let itens = { data: [], error: null };
  if (!l.error && (l.data || []).length) itens = await sb.from("crm_faturamento_itens").select("*").in("lancamento_id", l.data.map(x => x.id));
  const p = await sb.from("crm_comissao_percentual").select("*").lte("mes", ini).order("mes", { ascending: false });
  const erro = l.error || itens.error || p.error;
  if (erro) { crmRel.indisponivel = erro.message; return false; }
  crmRel.indisponivel = false;
  crmRel.lanc = (l.data || []).map(x => ({ id: x.id, de: x.periodo_de, ate: x.periodo_ate, por: x.created_by_nome || "", quando: x.created_at }));
  crmRel.itens = (itens.data || []).map(x => ({ cliente: x.cliente, exec: x.executivo_user_id, execNome: x.executivo_nome || "", valor: Number(x.valor) }));
  crmRel.pct = new Map();
  (p.data || []).forEach(x => { if (!crmRel.pct.has(x.executivo_user_id)) crmRel.pct.set(x.executivo_user_id, Number(x.percentual)); });
  return true;
}

// uma linha por executivo > cliente, já com % e comissão; o filtro de executivo vale aqui
function crmRelMontar() {
  const porExec = new Map();
  crmRel.itens.forEach(i => {
    if (crmRel.exec && i.exec !== crmRel.exec) return;
    if (!porExec.has(i.exec)) porExec.set(i.exec, { id: i.exec, nome: i.execNome || "(sem nome)", clientes: new Map() });
    const e = porExec.get(i.exec);
    e.clientes.set(i.cliente, (e.clientes.get(i.cliente) || 0) + i.valor);
  });
  return [...porExec.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map(e => {
    const pct = crmRel.pct.has(e.id) ? crmRel.pct.get(e.id) : 0;
    const clientes = [...e.clientes.entries()].map(([nome, valor]) => ({ nome, valor, com: crmFatArred(valor * pct / 100), rep: typeof crmRepresentanteDe === "function" ? crmRepresentanteDe(nome) : null }));
    const soltos = clientes.filter(c => !c.rep).sort((a, b) => a.nome.localeCompare(b.nome));
    const grupos = new Map();
    clientes.filter(c => c.rep).forEach(c => { if (!grupos.has(c.rep)) grupos.set(c.rep, []); grupos.get(c.rep).push(c); });
    const gruposLista = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([rep, cs]) => ({
      rep, clientes: cs.sort((a, b) => a.nome.localeCompare(b.nome)), valor: cs.reduce((t, c) => t + c.valor, 0), com: crmFatArred(cs.reduce((t, c) => t + c.com, 0))
    }));
    const valor = clientes.reduce((t, c) => t + c.valor, 0);
    return { id: e.id, nome: e.nome, pct, soltos, grupos: gruposLista, valor, com: crmFatArred(clientes.reduce((t, c) => t + c.com, 0)), n: clientes.length };
  });
}

const crmRelPctTxt = (p) => String(p).replace(".", ",") + "%";

/* ---------------- tela ---------------- */

async function crmRenderRelatorio() {
  const corpo = document.getElementById("crmRelCorpo");
  if (!corpo) return;
  const meses = crmFatMeses();
  if (!crmRel.mes || !meses.includes(crmRel.mes)) crmRel.mes = meses[0];
  document.getElementById("crmRelMes").innerHTML = meses.map(m => `<option value="${m}" ${m === crmRel.mes ? "selected" : ""}>${crmFatRotuloMes(m)}</option>`).join("");
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando o relatório…</div></div>`;
  const pedido = crmRel.mes;
  const ok = await crmRelCarregar();
  if (pedido !== crmRel.mes) return;
  if (!ok) {
    corpo.innerHTML = `<div class="card"><div class="empty-state">O relatório ainda não está disponível: rode o SQL <b>sql/crm_faturamento.sql</b> no Supabase. (${escapeHtml(String(crmRel.indisponivel))})</div></div>`;
    return;
  }
  // filtro de executivo: quem tem faturamento no mês
  const nomes = new Map();
  crmRel.itens.forEach(i => nomes.set(i.exec, i.execNome || "(sem nome)"));
  if (crmRel.exec && !nomes.has(crmRel.exec)) crmRel.exec = "";
  document.getElementById("crmRelExec").innerHTML = `<option value="">Todos</option>` + [...nomes.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${escapeAttr(id)}" ${id === crmRel.exec ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
  crmRelDesenhar();
}

function crmRelSubtitulo() {
  const s = crmSistemaAtual();
  const rotulo = crmFatRotuloMes(crmRel.mes);
  if (!crmRel.lanc.length) return `${CRM_SISTEMAS[s]} · ${rotulo} · sem lançamentos`;
  const de = crmRel.lanc.reduce((m, l) => l.de < m ? l.de : m, crmRel.lanc[0].de);
  const ate = crmRel.lanc.reduce((m, l) => l.ate > m ? l.ate : m, "");
  const ult = crmRel.lanc.reduce((m, l) => l.quando > m.quando ? l : m, crmRel.lanc[0]);
  return `${CRM_SISTEMAS[s]} · ${rotulo} · lançamentos de ${crmFatDM(de)} a ${crmFatDM(ate)}, atualizado em ${crmFatDM(crmDiaLocal(ult.quando))} às ${crmHoraLocal(ult.quando)}${ult.por ? ", por " + ult.por : ""}`;
}

function crmRelDesenhar() {
  const corpo = document.getElementById("crmRelCorpo");
  crmRel.linhas = crmRelMontar();
  document.getElementById("crmRelSub").textContent = crmRelSubtitulo();
  const linhas = crmRel.linhas;
  const totFat = linhas.reduce((t, e) => t + e.valor, 0), totCom = crmFatArred(linhas.reduce((t, e) => t + e.com, 0));
  document.getElementById("crmRelPdf").disabled = !linhas.length;
  document.getElementById("crmRelCsv").disabled = !linhas.length;
  if (!linhas.length) {
    corpo.innerHTML = `<div class="card"><div class="empty-state">Nenhum faturamento lançado em ${escapeHtml(crmFatRotuloMes(crmRel.mes))}${crmRel.exec ? " para este executivo" : ""}. Só aparecem clientes com faturamento no mês.</div></div>`;
    return;
  }
  const cartoes = `<div class="kpis">${linhas.map(e => `
      <div class="kpi"><div class="lbl">${escapeHtml(e.nome)} · ${crmRelPctTxt(e.pct)}</div><div class="val crm-val-texto">${formatMoney(e.com)}</div><div class="muted sv-sub">sobre ${formatMoney(e.valor)}</div></div>`).join("")}
      <div class="kpi"><div class="lbl">Comissão total</div><div class="val crm-val-texto">${formatMoney(totCom)}</div><div class="muted sv-sub">sobre ${formatMoney(totFat)}</div></div></div>`;
  const linhaCli = (c, filho) => `<tr class="${filho ? "crm-fat-filho" : ""}"><td>${escapeHtml(c.nome)}</td><td class="num">${formatMoney(c.valor)}</td><td class="num">${crmRelPctTxt(c.pct)}</td><td class="num">${formatMoney(c.com)}</td></tr>`;
  const corpoTab = linhas.map(e => {
    const cli = (c, filho) => linhaCli({ ...c, pct: e.pct }, filho);
    return `<tr class="crm-rel-exec"><td colspan="4">${escapeHtml(e.nome)}</td></tr>`
      + e.soltos.map(c => cli(c, false)).join("")
      + e.grupos.map(g => `<tr class="crm-fat-grupo"><td>${escapeHtml(g.rep)} <span class="crm-selo crm-selo-rep">Representante</span></td><td class="num">${formatMoney(g.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${formatMoney(g.com)}</td></tr>` + g.clientes.map(c => cli(c, true)).join("")).join("")
      + `<tr class="crm-rel-sub"><td>Subtotal ${escapeHtml(e.nome)}</td><td class="num">${formatMoney(e.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${formatMoney(e.com)}</td></tr>`;
  }).join("");
  corpo.innerHTML = cartoes + `
    <div class="card">
      <div class="card-head"><h2>Detalhe por executivo e cliente</h2><div class="note">só aparecem clientes com faturamento no mês</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th class="num">Faturamento do mês</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
        <tbody>${corpoTab}</tbody>
        <tfoot><tr><td><b>Total geral</b></td><td class="num">${formatMoney(totFat)}</td><td></td><td class="num">${formatMoney(totCom)}</td></tr></tfoot>
      </table></div>
      <div class="note" style="margin-top:10px;">Comissão = faturamento do cliente no mês × % do executivo naquele mês.</div>
    </div>`;
}

/* ---------------- exportar ---------------- */

const crmRelNum = (n) => Number(n).toFixed(2).replace(".", ",");
const crmRelCsvCelula = (v) => { const t = String(v == null ? "" : v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };

function crmRelExportarCsv() {
  const s = crmSistemaAtual();
  const cab = ["Sistema", "Mês", "Executivo", "Representante", "Cliente", "Faturamento do mês", "% comissão", "Comissão"];
  const linhas = [];
  crmRel.linhas.forEach(e => {
    const todos = [...e.soltos.map(c => ({ ...c, rep: "" })), ...e.grupos.flatMap(g => g.clientes.map(c => ({ ...c, rep: g.rep })))];
    todos.forEach(c => linhas.push([CRM_SISTEMAS[s], crmFatRotuloMes(crmRel.mes), e.nome, c.rep, c.nome, crmRelNum(c.valor), crmRelNum(e.pct), crmRelNum(c.com)]));
  });
  const totFat = crmRel.linhas.reduce((t, e) => t + e.valor, 0), totCom = crmFatArred(crmRel.linhas.reduce((t, e) => t + e.com, 0));
  linhas.push([CRM_SISTEMAS[s], crmFatRotuloMes(crmRel.mes), "Total geral", "", "", crmRelNum(totFat), "", crmRelNum(totCom)]);
  const texto = "﻿" + [cab, ...linhas].map(l => l.map(crmRelCsvCelula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `comissao-${s}-${crmRel.mes}${crmRel.exec ? "-" + (crmRel.linhas[0] ? crmRel.linhas[0].nome.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "executivo") : ""}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crmRelPdfHtml() {
  const linhas = crmRel.linhas;
  const totFat = linhas.reduce((t, e) => t + e.valor, 0), totCom = crmFatArred(linhas.reduce((t, e) => t + e.com, 0));
  const dinheiro = (n) => escapeHtml(formatMoney(n));
  const resumo = linhas.map(e => `<tr><td>${escapeHtml(e.nome)}</td><td class="num">${fmt(e.n)}</td><td class="num">${dinheiro(e.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${dinheiro(e.com)}</td></tr>`).join("");
  const detalhe = linhas.map(e => {
    const cli = (c, filho) => `<tr><td${filho ? ' style="padding-left:22px"' : ""}>${escapeHtml(c.nome)}</td><td class="num">${dinheiro(c.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${dinheiro(c.com)}</td></tr>`;
    return `<tr class="pc-exec"><td colspan="4">${escapeHtml(e.nome)}</td></tr>`
      + e.soltos.map(c => cli(c, false)).join("")
      + e.grupos.map(g => `<tr class="pc-grupo"><td>${escapeHtml(g.rep)} (representante)</td><td class="num">${dinheiro(g.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${dinheiro(g.com)}</td></tr>` + g.clientes.map(c => cli(c, true)).join("")).join("")
      + `<tr class="pc-sub"><td>Subtotal ${escapeHtml(e.nome)}</td><td class="num">${dinheiro(e.valor)}</td><td class="num">${crmRelPctTxt(e.pct)}</td><td class="num">${dinheiro(e.com)}</td></tr>`;
  }).join("");
  return `
    <div class="print-comissao">
      <div class="pc-topo"><h1>Relatório de comissão</h1><div class="pc-sub">${escapeHtml(crmRelSubtitulo())}${crmRel.exec && linhas[0] ? " · " + escapeHtml(linhas[0].nome) : ""}</div></div>
      <table class="pc-tabela">
        <thead><tr><th>Executivo</th><th class="num">Clientes</th><th class="num">Faturamento do mês</th><th class="num">% comissão</th><th class="num">Comissão</th></tr></thead>
        <tbody>${resumo}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${dinheiro(totFat)}</td><td></td><td class="num">${dinheiro(totCom)}</td></tr></tfoot>
      </table>
      <h2 class="pc-h2">Detalhe por executivo e cliente</h2>
      <table class="pc-tabela pc-detalhe">
        <thead><tr><th>Cliente</th><th class="num">Faturamento do mês</th><th class="num">%</th><th class="num">Comissão</th></tr></thead>
        <tbody>${detalhe}</tbody>
        <tfoot><tr><td>Total geral</td><td class="num">${dinheiro(totFat)}</td><td></td><td class="num">${dinheiro(totCom)}</td></tr></tfoot>
      </table>
      <div class="pc-rodape">Comissão = faturamento do cliente no mês × % do executivo naquele mês. Gerado por ${escapeHtml(currentUserNome || "—")} em ${formatDateBR(todayISO())}.</div>
    </div>`;
}

function crmRelImprimir() {
  const area = document.getElementById("reportPrintArea");
  document.body.classList.remove("imprimindo-doc");
  document.body.classList.add("imprimindo-doc");
  area.innerHTML = crmRelPdfHtml();
  window.addEventListener("afterprint", crmFatLimparImpressao, { once: true });
  window.print();
}

/* ---------------- eventos ---------------- */

function crmRelInit() {
  if (!document.getElementById("crmRelCorpo")) return;
  document.getElementById("crmRelMes").addEventListener("change", (e) => { crmRel.mes = e.target.value; crmRenderRelatorio(); });
  document.getElementById("crmRelExec").addEventListener("change", (e) => { crmRel.exec = e.target.value; crmRelDesenhar(); });
  document.getElementById("crmRelCsv").addEventListener("click", crmRelExportarCsv);
  document.getElementById("crmRelPdf").addEventListener("click", crmRelImprimir);
}

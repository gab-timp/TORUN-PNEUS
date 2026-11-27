/* ---------------- CRM: Fornecedores (Carteira > Fornecedores) ---------------- */
/* Consulta rápida para o atendimento: de quem vem cada marca, como o cliente paga, quem contatar, restrição
   (exclusividade) e se a lista de preços do exportador já foi pedida ou recebida. Igual no Atacado e no Encomenda.
   Dados em sql/crm_fornecedores.sql: crm_fornecedores (uma linha por opção de compra) e crm_fornecedores_lista
   (uma linha por exportador: pedida_em / recebida_em). Todo papel do CRM lê; só a gestão grava (o banco confere).
   O e-mail para vários fornecedores abre o Gmail com todos os endereços em cópia oculta (CCO).
   Usa os helpers do app.js e do crm.js (sb, toast, confirmModal, escapeHtml, escapeAttr, crmPapelEfetivo...). */

const CRM_FORN_TIPOS = ["Passeio", "LT", "Carga", "Agrícola"];
const CRM_FORN_QUANDO = ["para produzir", "na prontidão", "antecipado", "antes do embarque", "antes da chegada", "7 dias antes da chegada", "30 dias após o embarque", "30 dias após a chegada", "60 dias após a chegada"];
const CRM_FORN_OUTRO = "__outro";
const CRM_FORN_LISTA_ROT = { sem: "Sem pedido", ped: "Pedida", rec: "Recebida" };
const CRM_FORN_ASSUNTO = "Updated price list";
const CRM_FORN_CORPO = "Hello,\n\nCould you please send us your updated price list?";

const crmForn = {
  rows: [], lista: new Map(), indisponivel: false, erro: "", carregou: false, carregando: null, ultimaCarga: 0,
  visao: "marca", fTipo: new Set(), fPais: new Set(), fLista: new Set(),
  paisSig: "", fichaKey: null, fichaIdx: 0, fm: null, formSalvando: false,
  mail: { sel: new Set(), busca: "", emails: [], exs: [] }
};

function crmFornPodeEditar() { return crmPapelEfetivo() === "gestao" && crmPodeEscrever(); }
const crmFornEmailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const crmFornNome = (s) => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const crmFornHoje = () => Date.now();
const crmFornDM = (t) => { const d = new Date(t); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
const crmFornRestr = (rows) => Math.max(0, ...rows.map(r => r.rs || 0));
const crmFornPgTxt = (pg) => pg.map(p => `${p[0]}% ${p[1]}`).join(" + ");
const crmFornPaises = (r) => String(r.pa || "").split(" / ").map(s => s.trim()).filter(Boolean);

/* ---------------- dados ---------------- */

function crmFornDerivar(r) {
  r.ent = r.pg.length > 1 ? r.pg[0][0] : (r.pg[0] && /após/.test(r.pg[0][1]) ? 0 : 100);
  r.exc = String(r.ex || "").replace(/[,.]?\s*\b(PTE\.? LTD\.?|CO\.?,? LTD\.?|LTD\.?|LIMITED|INC\.?|LLC|CORP\.?|CORPORATION|PVT\.? LTD\.?|S\.A\.|SA DE CV|CO LTD)\s*$/i, "").replace(/[,.]\s*$/, "");
  return r;
}
function crmFornDeLinha(l) {
  return crmFornDerivar({
    id: l.id, m: l.marca || "", ex: l.exportador || "", fb: l.fabrica || "", pr: l.produto || "Pneu", tp: Array.isArray(l.tipos) ? l.tipos : [],
    po: l.porto || "", pa: l.pais || "", pg: (Array.isArray(l.pagamentos) ? l.pagamentos : []).map(x => [Number(x.p) || 0, String(x.w || "")]),
    pn: l.nota_pagamento || "", rs: l.restricao || 0, ob: l.observacao || "",
    ct: (Array.isArray(l.contatos) ? l.contatos : []).map(c => [String(c.n || ""), String(c.e || "")]), ordem: l.ordem
  });
}

async function crmFornCarregar(forcar) {
  if (crmForn.carregando) return crmForn.carregando;
  if (!forcar && crmForn.carregou && Date.now() - crmForn.ultimaCarga < 3000) return;
  crmForn.carregando = (async () => {
    const [a, b] = await Promise.all([
      sb.from("crm_fornecedores").select("*").order("ordem", { ascending: true, nullsFirst: false }).order("criado_em", { ascending: true }),
      sb.from("crm_fornecedores_lista").select("*")
    ]);
    if (a.error || b.error) {
      crmForn.indisponivel = true;
      crmForn.erro = (a.error || b.error).message || "";
    } else {
      crmForn.indisponivel = false;
      crmForn.rows = (a.data || []).map(crmFornDeLinha);
      crmForn.lista = new Map((b.data || []).map(x => [x.exportador, { ped: x.pedida_em ? Date.parse(x.pedida_em) : 0, rec: x.recebida_em ? Date.parse(x.recebida_em) : 0 }]));
    }
    crmForn.carregou = true;
    crmForn.ultimaCarga = Date.now();
  })().finally(() => { crmForn.carregando = null; });
  return crmForn.carregando;
}

/* ---------------- lista de preços: estado por exportador ---------------- */
// ped = quando pedimos, rec = quando chegou. Vale o mais recente: pedir de novo depois de receber volta a "pedida".

function crmFornSt(ex) {
  const l = crmForn.lista.get(ex) || {};
  return l.rec && (!l.ped || l.rec >= l.ped) ? "rec" : l.ped ? "ped" : "sem";
}
function crmFornStTxt(ex) {
  const l = crmForn.lista.get(ex) || {}, s = crmFornSt(ex);
  return s === "rec" ? "Recebida em " + crmFornDM(l.rec) : s === "ped" ? "Pedida em " + crmFornDM(l.ped) : "Sem pedido";
}
const crmFornPill = (ex) => `<span class="crm-forn-lp ${crmFornSt(ex)}">${crmFornStTxt(ex)}</span>`;
const crmFornExs = () => [...new Set(crmForn.rows.map(r => r.ex))];

async function crmFornMarcarRecebida(ex, on) {
  const l = crmForn.lista.get(ex) || { ped: 0, rec: 0 };
  const antes = { ...l };
  l.rec = on ? Date.now() : 0;
  crmForn.lista.set(ex, l);
  crmRenderFornecedores();
  const { error } = await sb.from("crm_fornecedores_lista").upsert({
    exportador: ex, recebida_em: on ? new Date(l.rec).toISOString() : null, atualizado_em: new Date().toISOString(), atualizado_por: crmMeuId()
  }, { onConflict: "exportador" });
  if (error) {
    crmForn.lista.set(ex, antes);
    crmRenderFornecedores();
    toast("Não foi possível salvar: " + error.message);
    return false;
  }
  toast(on ? "Lista marcada como recebida." : "Lista desmarcada.");
  return true;
}

/* ---------------- filtros e grade ---------------- */

function crmFornFiltrar() {
  const q = (document.getElementById("crmFornBusca").value || "").trim().toLowerCase();
  return crmForn.rows.filter(r => {
    if (crmForn.fTipo.size && ![...crmForn.fTipo].some(t => r.tp.includes(t))) return false;
    if (crmForn.fPais.size && ![...crmForn.fPais].some(p => crmFornPaises(r).includes(p))) return false;
    if (crmForn.fLista.size && !crmForn.fLista.has(crmFornSt(r.ex))) return false;
    if (q && ![r.m, r.ex, r.fb, r.pa, r.po, r.ct.map(c => c[0] + " " + c[1]).join(" ")].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

function crmFornPintaFiltros() {
  const rows = crmForn.rows;
  const cT = new Map(), cP = new Map();
  rows.forEach(r => {
    r.tp.forEach(t => (cT.get(t) || cT.set(t, new Set()).get(t)).add(r.m));
    crmFornPaises(r).forEach(p => (cP.get(p) || cP.set(p, new Set()).get(p)).add(r.m));
  });
  document.getElementById("crmFornGTipo").innerHTML = CRM_FORN_TIPOS.map(t => `<button type="button" class="crm-forn-chip${crmForn.fTipo.has(t) ? " on" : ""}" data-crmfornt="${t}">${t}<em>${(cT.get(t) || []).size}</em></button>`).join("");
  const paises = [...cP.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], "pt-BR"));
  document.getElementById("crmFornGPais").innerHTML = paises.map(([p, s]) => `<button type="button" class="crm-forn-chip${crmForn.fPais.has(p) ? " on" : ""}" data-crmfornp="${escapeAttr(p)}">${escapeHtml(p)}<em>${s.size}</em></button>`).join("");
  const cL = { sem: 0, ped: 0, rec: 0 };
  crmFornExs().forEach(e => cL[crmFornSt(e)]++);
  document.getElementById("crmFornGLista").innerHTML = Object.keys(CRM_FORN_LISTA_ROT).map(k => `<button type="button" class="crm-forn-chip${crmForn.fLista.has(k) ? " on" : ""}" data-crmfornl="${k}">${CRM_FORN_LISTA_ROT[k]}<em>${cL[k]}</em></button>`).join("");
}

function crmFornPill2(n) { return n === 1 ? '<span class="crm-forn-pill rs">Exclusividade</span>' : n === 2 ? '<span class="crm-forn-pill rp">Restrição parcial</span>' : ""; }

function crmFornBlocoPagamento(r) {
  const cor = (p, i) => /após/.test(p[1]) ? "cz" : "c" + Math.min(i, 2);
  return `<div class="crm-forn-ent"><div class="crm-forn-tt">Como se paga</div>
    <div class="crm-forn-seg">${r.pg.map((p, i) => `<i class="${cor(p, i)}" style="flex:${p[0]}"></i>`).join("")}</div>
    <div class="crm-forn-st">${r.pg.map((p, i) => `<div><em class="${cor(p, i)}"></em><b>${p[0]}%</b><span>${escapeHtml(p[1])}</span></div>`).join("")}</div></div>`;
}

function crmFornLinhaListaMarca(rs) {
  // na marca o check não mora aqui: só mostra o que está salvo nos exportadores dela
  const exs = [...new Set(rs.map(x => x.ex))], n = exs.filter(e => crmFornSt(e) === "rec").length;
  const p = exs.length === 1 ? crmFornPill(exs[0])
    : n === exs.length ? '<span class="crm-forn-lp rec">Todas recebidas</span>'
    : (n || exs.some(e => crmFornSt(e) === "ped")) ? `<span class="crm-forn-lp ped">${n} de ${exs.length} listas recebidas</span>`
    : '<span class="crm-forn-lp sem">Sem pedido</span>';
  return `<div class="crm-forn-lst"><span class="tt">Lista de preços</span>${p}</div>`;
}

function crmRenderFornecedores() {
  const corpo = document.getElementById("crmFornGrade");
  if (!corpo) return;
  const podeEditar = crmFornPodeEditar();
  document.getElementById("crmFornBtnNovo").style.display = podeEditar ? "" : "none";
  if (!crmForn.carregou) {
    corpo.innerHTML = '<div class="empty-state">Carregando fornecedores…</div>';
    document.getElementById("crmFornRes").textContent = "";
    crmFornCarregar().then(crmRenderFornecedores);
    return;
  }
  if (crmForn.indisponivel) {
    corpo.innerHTML = `<div class="empty-state">Os fornecedores ainda não estão disponíveis. Rode o arquivo <b>sql/crm_fornecedores.sql</b> no Supabase.<br><span class="muted">${escapeHtml(crmForn.erro)}</span></div>`;
    document.getElementById("crmFornRes").textContent = "";
    return;
  }
  crmFornPintaFiltros();
  const view = crmForn.visao;
  const g = new Map();
  crmFornFiltrar().forEach(r => { const k = view === "marca" ? r.m : r.ex; if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
  let arr = [...g.entries()];
  if (document.getElementById("crmFornSemRest").checked) arr = arr.filter(([, rs]) => crmFornRestr(rs) !== 1);
  const ord = document.getElementById("crmFornOrd").value;
  arr.sort((a, b) => ord === "ent" ? (Math.min(...a[1].map(r => r.ent)) - Math.min(...b[1].map(r => r.ent))) || a[0].localeCompare(b[0], "pt-BR") : a[0].localeCompare(b[0], "pt-BR"));
  const sem = arr.filter(([, rs]) => crmFornRestr(rs)).length;
  document.getElementById("crmFornRes").innerHTML = `<b>${arr.length}</b> ${view === "marca" ? "marcas" : "exportadores"}${sem ? ` · <b>${sem}</b> com restrição` : ""}`;
  if (!arr.length) {
    corpo.innerHTML = `<div class="empty-state">${crmForn.rows.length ? "Nada encontrado. Tente outra marca ou limpe os filtros." : "Nenhum fornecedor cadastrado ainda."}</div>`;
    return;
  }
  corpo.innerHTML = arr.map(([k, rs]) => {
    const n = crmFornRestr(rs), r = rs[0];
    const paises = [...new Set(rs.flatMap(crmFornPaises))].join(" · ") || "origem não informada";
    const cls = n === 1 ? "rs" : n === 2 ? "rp" : "";
    if (view === "marca") {
      const tipos = r.tp.length ? r.tp.map(t => `<span class="crm-forn-tp">${escapeHtml(t)}</span>`).join("") : '<span class="crm-forn-tp vz">tipo não informado</span>';
      return `<div class="crm-forn-card ${cls}" tabindex="0" role="button" data-crmfornabrir="${escapeAttr(k)}">
        <div class="crm-forn-ch"><div><h3>${escapeHtml(k)}</h3><div class="or">${escapeHtml(paises)}</div></div>${crmFornPill2(n)}</div>
        <div><div class="crm-forn-exp">${escapeHtml(crmFornNome(r.exc))}${r.fb && r.fb !== r.ex ? ` <span>· ${escapeHtml(crmFornNome(r.fb))}</span>` : ""}</div><div class="crm-forn-meta">${tipos}${r.pr !== "Pneu" ? `<span class="crm-forn-tp">${escapeHtml(r.pr)}</span>` : ""}</div></div>
        ${crmFornBlocoPagamento(r)}${crmFornLinhaListaMarca(rs)}
        <div class="crm-forn-rod"><span>${rs.length > 1 ? `<b>${rs.length} opções de compra</b>` : "1 opção de compra"}</span><span>Ver ficha →</span></div></div>`;
    }
    const marcas = [...new Set(rs.map(x => x.m))];
    const check = podeEditar
      ? `<label><input type="checkbox" data-crmfornrec="${escapeAttr(k)}"${crmFornSt(k) === "rec" ? " checked" : ""}> Lista recebida</label>`
      : '<span class="tt">Lista de preços</span>';
    return `<div class="crm-forn-card ${cls}" tabindex="0" role="button" data-crmfornabrir="${escapeAttr(k)}">
      <div class="crm-forn-ch"><div><h3 class="peq">${escapeHtml(crmFornNome(r.exc))}</h3><div class="or">${escapeHtml(paises)}</div></div>${crmFornPill2(n)}</div>
      <div class="crm-forn-meta">${marcas.map(m => `<span class="crm-forn-tp neutro">${escapeHtml(m)}</span>`).join("")}</div>
      ${crmFornBlocoPagamento(r)}<div class="crm-forn-lst">${check}${crmFornPill(k)}</div>
      <div class="crm-forn-rod"><span>${marcas.length} marca(s)</span><span>Ver ficha →</span></div></div>`;
  }).join("");
}

/* ---------------- ficha ---------------- */

function crmFornCriarOverlay(id, titulo, extra) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.className = "modal-overlay";
    el.id = id;
    el.innerHTML = `<div class="modal crm-forn-modal ${extra || ""}" role="dialog" aria-label="${escapeAttr(titulo)}"></div>`;
    document.body.appendChild(el);
  }
  return el;
}
const crmFornCaixa = (id) => document.getElementById(id).querySelector(".modal");

function crmFornAssuntoMail(m) { return CRM_FORN_ASSUNTO + " — " + m; }
function crmFornResumoTxt(k, r) {
  return `${k} — ${crmFornNome(r.exc)}${r.fb && r.fb !== r.ex ? " (" + crmFornNome(r.fb) + ")" : ""}\nTipo: ${r.tp.length ? r.tp.join(" + ") : "a confirmar"}\nEmbarque: ${[r.po, r.pa].filter(Boolean).join(" → ") || "a confirmar"}\nPagamento: ${crmFornPgTxt(r.pg)}`;
}

function crmFornAbrirFicha(k, i) {
  const view = crmForn.visao;
  const rs = crmForn.rows.filter(r => (view === "marca" ? r.m : r.ex) === k);
  if (!rs.length) return;
  crmForn.fichaKey = k;
  crmForn.fichaIdx = Math.min(i || 0, rs.length - 1);
  const r = rs[crmForn.fichaIdx], n = crmFornRestr(rs), marca = view === "marca" ? k : r.m;
  const obsR = (rs.find(x => x.rs) || {}).ob || "";
  const resp = n === 1 ? `<div class="crm-forn-resp rs"><i>✕</i><div>Não podemos trazer<small>${escapeHtml(obsR)}</small></div></div>`
    : n === 2 ? `<div class="crm-forn-resp rp"><i>⚠︎</i><div>Pode trazer, com ressalva<small>${escapeHtml(obsR)}</small></div></div>`
    : `<div class="crm-forn-resp ok"><i>✓︎</i><div>Pode trazer<small>Sem restrição registrada.</small></div></div>`;
  const abas = rs.length > 1 ? `<div class="crm-forn-abas">${rs.map((x, j) => `<button type="button" class="${j === crmForn.fichaIdx ? "on" : ""}" data-crmfornaba="${j}">${view === "marca" ? "Opção " + (j + 1) + " · " + escapeHtml([x.po, x.pa].filter(Boolean).join(", ") || crmFornNome(x.exc).split(" ")[0]) : escapeHtml(x.m)}</button>`).join("")}</div>` : "";
  const outras = view === "marca" ? [...new Set(crmForn.rows.filter(x => x.ex === r.ex && x.m !== k).map(x => x.m))] : [];
  const podeEditar = crmFornPodeEditar();
  const contatos = r.ct.length ? r.ct.map(c => {
    const inc = c[1] && !crmFornEmailOk(c[1]);
    const gm = c[1] ? `<a class="btn small outline" data-crmfornemail="${escapeAttr(c[1])}" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(c[1])}&su=${encodeURIComponent(crmFornAssuntoMail(marca))}&body=${encodeURIComponent(CRM_FORN_CORPO)}" target="_blank" rel="noopener" title="Abre o Gmail e copia o endereço">✉︎ Abrir no Gmail</a>` : "";
    return `<div class="crm-forn-ct"><div>${escapeHtml(c[0])}<small>${escapeHtml(c[1] || "sem e-mail")}${inc ? ' <span class="inc">e-mail incompleto</span>' : ""}</small></div>${gm}</div>`;
  }).join("") : '<div class="muted">Nenhum contato cadastrado.</div>';
  const exsFicha = [...new Set(rs.map(x => x.ex))];
  const listaHtml = exsFicha.map(e => view === "ex"
    ? (podeEditar ? `<label class="crm-forn-lrow"><input type="checkbox" data-crmfornrec="${escapeAttr(e)}"${crmFornSt(e) === "rec" ? " checked" : ""}><span><b>Lista recebida</b></span>${crmFornPill(e)}</label>`
      : `<div class="crm-forn-lrow"><span><b>Lista de preços</b></span>${crmFornPill(e)}</div>`)
    : `<div class="crm-forn-lrow"><span><b>${escapeHtml(crmFornNome(e))}</b></span>${crmFornPill(e)}<button type="button" class="btn small outline" data-crmfornirex="${escapeAttr(e)}">Abrir exportador</button></div>`).join("");
  const el = crmFornCriarOverlay("crmFornFichaOverlay", "Ficha do fornecedor");
  crmFornCaixa("crmFornFichaOverlay").innerHTML = `<div class="crm-forn-topo"><h2>${escapeHtml(view === "marca" ? k : crmFornNome(r.exc))}</h2>
      <div class="crm-forn-topo-acoes">${podeEditar ? `<button type="button" class="btn small outline" data-crmfornedit="${escapeAttr(r.id)}">✎︎ Editar</button>` : ""}<button type="button" class="btn small outline" data-crmfornfechar="ficha" aria-label="Fechar">×</button></div></div>
    ${resp}${abas}
    <div class="crm-forn-fb">
      <div><div class="crm-forn-rot">Exportador</div><div class="crm-forn-val">${escapeHtml(r.ex)}</div></div>
      <div><div class="crm-forn-rot">Fábrica / grupo</div><div class="crm-forn-val">${escapeHtml(r.fb || "—")}</div></div>
      <div><div class="crm-forn-rot">Tipo</div><div class="crm-forn-val">${escapeHtml(r.tp.join(" + ") || "não informado")}${r.pr !== "Pneu" ? " · " + escapeHtml(r.pr) : ""}</div></div>
      <div><div class="crm-forn-rot">Embarque</div><div class="crm-forn-val">${escapeHtml([r.po, r.pa].filter(Boolean).join(" → ") || "não informado")}</div></div>
      <div class="full"><div class="crm-forn-rot">Como se paga</div><div class="crm-forn-tl">${r.pg.map(p => `<div class="crm-forn-etapa"><div class="pc">${p[0]}%</div><b>${escapeHtml(p[1])}</b></div>`).join("")}</div>${r.pn ? `<div class="note crm-forn-nota">${escapeHtml(r.pn)}</div>` : ""}</div>
      <div class="full"><div class="crm-forn-rot">Contatos</div>${contatos}</div>
      <div class="full"><div class="crm-forn-rot">Lista de preços</div>${listaHtml}
        <div class="note">${view === "ex" ? (podeEditar ? "O check fica salvo no exportador e vale para todas as marcas dele." : "O estado da lista é do exportador.") : "O check é do exportador: abra o exportador para marcar que a lista chegou."}</div></div>
      ${r.ob && !r.rs ? `<div class="full"><div class="crm-forn-rot">Observação</div><div class="note crm-forn-nota">${escapeHtml(r.ob)}</div></div>` : ""}
      <div class="full"><div class="crm-forn-rot">Resumo para copiar (WhatsApp ou e-mail)</div><div class="crm-forn-resumo" id="crmFornResTxt">${escapeHtml(crmFornResumoTxt(marca, r))}</div><button type="button" class="btn primary small" data-crmfornresumo="1">Copiar resumo</button></div>
      ${outras.length ? `<div class="full"><div class="crm-forn-rot">Outras marcas deste exportador</div><div class="crm-forn-irm">${outras.map(m => `<button type="button" data-crmfornmarca="${escapeAttr(m)}">${escapeHtml(m)}</button>`).join("")}</div></div>` : ""}
    </div>`;
  el.classList.add("show");
  el.scrollTop = 0;
}
function crmFornFecharFicha() { const e = document.getElementById("crmFornFichaOverlay"); if (e) e.classList.remove("show"); }

/* ---------------- cadastro / edição ---------------- */

const crmFornPgLinha = (x, i) => {
  const outro = x.w && !CRM_FORN_QUANDO.includes(x.w);
  return `<div class="crm-forn-pgl" data-i="${i}"><div class="pc2"><input type="number" class="n" min="1" max="100" inputmode="numeric" value="${escapeAttr(x.p)}" aria-label="Percentual"><span>%</span></div>
    <div class="qd"><select class="w" aria-label="Quando paga">${CRM_FORN_QUANDO.map(w => `<option${w === x.w ? " selected" : ""}>${w}</option>`).join("")}<option value="${CRM_FORN_OUTRO}"${outro ? " selected" : ""}>Outro (digitar)…</option></select>
    <input class="o" placeholder="Ex.: 45 dias após o BL" value="${outro ? escapeAttr(x.w) : ""}" style="${outro ? "" : "display:none"}"></div>
    <button type="button" class="crm-forn-rm" data-crmfornrmpg="${i}" aria-label="Remover pagamento">×</button></div>`;
};
const crmFornCtLinha = (x, i) => `<div class="crm-forn-ctl" data-i="${i}"><input class="cn" placeholder="Nome" value="${escapeAttr(x.n)}" aria-label="Nome do contato"><input class="ce" type="email" placeholder="e-mail" value="${escapeAttr(x.e)}" aria-label="E-mail do contato"><button type="button" class="crm-forn-rm" data-crmfornrmct="${i}" aria-label="Remover contato">×</button><div class="av"></div></div>`;

function crmFornColhePg() {
  crmForn.fm.pg = [...document.querySelectorAll("#crmFornFmPg .crm-forn-pgl")].map(l => { const s = l.querySelector(".w").value; return { p: l.querySelector(".n").value, w: s === CRM_FORN_OUTRO ? l.querySelector(".o").value : s }; });
}
function crmFornColheCt() {
  crmForn.fm.ct = [...document.querySelectorAll("#crmFornFmCt .crm-forn-ctl")].map(l => ({ n: l.querySelector(".cn").value, e: l.querySelector(".ce").value }));
}

function crmFornAbrirForm(id) {
  if (!crmFornPodeEditar()) return;
  const r = id ? crmForn.rows.find(x => x.id === id) : null;
  crmForn.fm = {
    r, tp: new Set(r ? r.tp : []), rs: r ? (r.rs || 0) : 0, conf: false,
    pg: r ? r.pg.map(p => ({ p: p[0], w: p[1] })) : [{ p: "", w: "para produzir" }, { p: "", w: "antes da chegada" }],
    ct: r && r.ct.length ? r.ct.map(c => ({ n: c[0], e: c[1] })) : [{ n: "", e: "" }]
  };
  const fm = crmForn.fm;
  const v = r || { m: "", ex: "", fb: "", pr: "Pneu", po: "", pa: "", pn: "", ob: "" };
  crmFornFecharFicha();
  const el = crmFornCriarOverlay("crmFornFormOverlay", "Cadastro de fornecedor", "crm-forn-form");
  crmFornCaixa("crmFornFormOverlay").innerHTML = `<div class="crm-forn-topo"><h2>${r ? "Editar fornecedor" : "Novo fornecedor"}</h2><div class="crm-forn-topo-acoes"><button type="button" class="btn small outline" data-crmfornfechar="form" aria-label="Fechar">×</button></div></div>
    <div class="muted sv-sub">${r ? `Você está editando uma opção de compra de <b>${escapeHtml(r.m)}</b>. Para cadastrar outra opção da mesma marca (outro porto ou outro exportador), use “Novo fornecedor” e digite a mesma marca.` : "Preencha o que souber. Só marca, exportador e a forma de pagamento são obrigatórios."}</div>
    <div class="crm-forn-sec first"><div class="crm-forn-rot">Quem é</div><div class="crm-forn-fg2">
      <div class="field"><label for="crmFornFM">Marca *</label><input id="crmFornFM" value="${escapeAttr(v.m)}" placeholder="Ex.: HAOHUA" autocomplete="off"><div id="crmFornFDica"></div></div>
      <div class="field"><label for="crmFornFPr">Produto</label><select id="crmFornFPr">${["Pneu", "Rack", "Rodas"].map(p => `<option${p === v.pr ? " selected" : ""}>${p}</option>`).join("")}</select></div>
      <div class="field"><label for="crmFornFEx">Exportador *</label><input id="crmFornFEx" value="${escapeAttr(v.ex)}" placeholder="Razão social que aparece na proforma" autocomplete="off"></div>
      <div class="field"><label for="crmFornFFb">Fábrica / grupo</label><input id="crmFornFFb" value="${escapeAttr(v.fb || "")}" placeholder="Ex.: HAOHUA" autocomplete="off"></div>
      <div class="field full"><label>Tipo de pneu</label><div class="crm-forn-chips" id="crmFornFTp">${CRM_FORN_TIPOS.map(t => `<button type="button" class="crm-forn-chip${fm.tp.has(t) ? " on" : ""}" data-crmforntipo="${t}">${t}</button>`).join("")}</div></div>
    </div></div>
    <div class="crm-forn-sec"><div class="crm-forn-rot">Embarque</div><div class="crm-forn-fg2">
      <div class="field"><label for="crmFornFPo">Porto de saída</label><input id="crmFornFPo" value="${escapeAttr(v.po)}" placeholder="Ex.: Qingdao"></div>
      <div class="field"><label for="crmFornFPa">País de origem</label><input id="crmFornFPa" value="${escapeAttr(v.pa)}" placeholder="Ex.: China"></div>
      <div class="note full">Mais de um porto ou país? Separe com “ / ”, como em “Ho Chi Minh / Semarang”.</div>
    </div></div>
    <div class="crm-forn-sec"><div class="crm-forn-rot">Como se paga <span class="crm-forn-rot-dica">· uma linha por pagamento, na ordem em que acontecem</span></div>
      <div id="crmFornFmPg">${fm.pg.map(crmFornPgLinha).join("")}</div>
      <button type="button" class="btn small outline" data-crmfornaddpg="1">+ Adicionar pagamento</button>
      <div class="crm-forn-prev"><div class="crm-forn-seg" id="crmFornFmBar"></div><div class="crm-forn-soma" id="crmFornFmSoma"></div></div>
      <div class="field" style="margin-top:12px;"><label for="crmFornFPn">Nota sobre o pagamento (opcional)</label><input id="crmFornFPn" value="${escapeAttr(v.pn || "")}" placeholder="Ex.: Alguns clientes ainda estão em 20% + 80%"></div>
    </div>
    <div class="crm-forn-sec"><div class="crm-forn-rot">Podemos trazer esta marca?</div>
      <div class="crm-forn-rsl" id="crmFornFRs">
        <label class="r0"><input type="radio" name="crmFornRs" value="0"${fm.rs === 0 ? " checked" : ""}><b>✓︎ Sim, sem restrição</b><span>Aparece como “Pode trazer”.</span></label>
        <label class="r2"><input type="radio" name="crmFornRs" value="2"${fm.rs === 2 ? " checked" : ""}><b>⚠︎ Com ressalva</b><span>Pode, mas há uma condição.</span></label>
        <label class="r1"><input type="radio" name="crmFornRs" value="1"${fm.rs === 1 ? " checked" : ""}><b>✕ Exclusividade</b><span>Não podemos trazer.</span></label>
      </div>
      <div class="field" style="margin-top:12px;"><label for="crmFornFOb" id="crmFornFObL">Observação</label><textarea id="crmFornFOb" rows="2" placeholder="Ex.: Após a primeira operação, é possível tentar crédito com a fábrica.">${escapeHtml(v.ob || "")}</textarea></div>
    </div>
    <div class="crm-forn-sec"><div class="crm-forn-rot">Contatos</div><div id="crmFornFmCt">${fm.ct.map(crmFornCtLinha).join("")}</div><button type="button" class="btn small outline" data-crmfornaddct="1">+ Adicionar contato</button></div>
    <div class="note crm-erro" id="crmFornFmErro" style="display:none;"></div>
    <div class="form-actions crm-forn-fmrod">${r ? '<button type="button" class="btn small crm-forn-del" id="crmFornFmDel">Excluir esta opção</button>' : ""}<div class="falta" id="crmFornFmFalta"></div><button type="button" class="btn outline" data-crmfornfechar="form">Cancelar</button><button type="button" class="btn primary" id="crmFornFmOk">Salvar fornecedor</button></div>`;
  el.classList.add("show");
  el.scrollTop = 0;
  crmFornAtualizaForm();
}
function crmFornFecharForm() { const e = document.getElementById("crmFornFormOverlay"); if (e) e.classList.remove("show"); crmForn.fm = null; }

function crmFornValida() {
  const fm = crmForn.fm;
  crmFornColhePg(); crmFornColheCt();
  const falta = [], soma = fm.pg.reduce((s, x) => s + (+x.p || 0), 0);
  if (!document.getElementById("crmFornFM").value.trim()) falta.push("a marca");
  if (!document.getElementById("crmFornFEx").value.trim()) falta.push("o exportador");
  if (!fm.pg.some(x => +x.p > 0)) falta.push("o pagamento");
  else if (soma !== 100) falta.push("o pagamento somar 100% (hoje " + soma + "%)");
  if (fm.pg.some(x => +x.p > 0 && !String(x.w).trim())) falta.push("dizer quando cada pagamento acontece");
  if (fm.rs && !document.getElementById("crmFornFOb").value.trim()) falta.push("explicar a restrição");
  return { falta, soma };
}
function crmFornAtualizaForm() {
  const fm = crmForn.fm;
  if (!fm || !document.getElementById("crmFornFmBar")) return;
  const { falta, soma } = crmFornValida();
  const cor = (x, i) => /após/.test(x.w) ? "cz" : "c" + Math.min(i, 2);
  const ativos = fm.pg.map((x, i) => ({ x, i })).filter(o => +o.x.p > 0);
  document.getElementById("crmFornFmBar").innerHTML = ativos.map(o => `<i class="${cor(o.x, o.i)}" style="flex:${o.x.p}"></i>`).join("") + (soma < 100 ? `<i class="vz" style="flex:${100 - soma}"></i>` : "");
  const so = document.getElementById("crmFornFmSoma");
  so.className = "crm-forn-soma " + (soma === 100 ? "ok" : "no");
  so.textContent = soma === 100 ? "✓︎ Soma 100%" : soma < 100 ? `Soma ${soma}% — faltam ${100 - soma}%` : `Soma ${soma}% — passou ${soma - 100}%`;
  const m = document.getElementById("crmFornFM").value.trim().toUpperCase();
  const ja = m && (!fm.r || fm.r.m !== m) && crmForn.rows.some(x => x.m === m && x !== fm.r);
  document.getElementById("crmFornFDica").innerHTML = ja ? `<div class="crm-forn-dica">Já existe ${escapeHtml(m)}. Esta vai ser mais uma opção de compra dela.</div>` : "";
  document.querySelectorAll("#crmFornFmCt .crm-forn-ctl").forEach((l, i) => { const e = fm.ct[i].e.trim(); l.querySelector(".av").textContent = e && !crmFornEmailOk(e) ? "e-mail incompleto — vai ser salvo assim mesmo e marcado na ficha" : ""; });
  document.getElementById("crmFornFObL").textContent = fm.rs ? "O que a restrição diz * (aparece em destaque na ficha)" : "Observação (opcional)";
  document.getElementById("crmFornFmOk").disabled = falta.length > 0 || crmForn.formSalvando;
  document.getElementById("crmFornFmFalta").innerHTML = falta.length ? `Falta: <b>${falta.join(", ")}</b>.` : "Tudo certo para salvar.";
}

async function crmFornSalvarForm() {
  const fm = crmForn.fm;
  if (!fm || crmForn.formSalvando) return;
  const { falta } = crmFornValida();
  if (falta.length) return;
  const g = (id) => document.getElementById(id).value.trim();
  const reg = {
    marca: g("crmFornFM").toUpperCase(), exportador: g("crmFornFEx").toUpperCase(), fabrica: g("crmFornFFb").toUpperCase(), produto: document.getElementById("crmFornFPr").value,
    tipos: CRM_FORN_TIPOS.filter(t => fm.tp.has(t)), porto: g("crmFornFPo"), pais: g("crmFornFPa"),
    pagamentos: fm.pg.filter(x => +x.p > 0).map(x => ({ p: +x.p, w: String(x.w).trim() })), nota_pagamento: g("crmFornFPn"),
    restricao: fm.rs, observacao: g("crmFornFOb"),
    contatos: fm.ct.filter(c => c.n.trim() || c.e.trim()).map(c => ({ n: c.n.trim() || "Contato", e: c.e.trim() })),
    atualizado_em: new Date().toISOString(), atualizado_por: crmMeuId()
  };
  const erro = document.getElementById("crmFornFmErro");
  erro.style.display = "none";
  crmForn.formSalvando = true;
  document.getElementById("crmFornFmOk").disabled = true;
  let res;
  if (fm.r) res = await sb.from("crm_fornecedores").update(reg).eq("id", fm.r.id).select();
  else {
    const ordens = crmForn.rows.map(x => x.ordem || 0);
    res = await sb.from("crm_fornecedores").insert({ ...reg, ordem: (ordens.length ? Math.max(...ordens) : 0) + 1 }).select();
  }
  crmForn.formSalvando = false;
  if (res.error || !res.data || !res.data[0]) {
    document.getElementById("crmFornFmOk").disabled = false;
    erro.textContent = "Não foi possível salvar: " + (res.error ? res.error.message : "sem permissão.");
    erro.style.display = "block";
    return;
  }
  const novoId = res.data[0].id, marca = reg.marca, ex = reg.exportador;
  crmFornFecharForm();
  await crmFornCarregar(true);
  crmRenderFornecedores();
  const k = crmForn.visao === "marca" ? marca : ex;
  const rs = crmForn.rows.filter(x => (crmForn.visao === "marca" ? x.m : x.ex) === k);
  crmFornAbrirFicha(k, Math.max(0, rs.findIndex(x => x.id === novoId)));
  toast("Fornecedor salvo.");
}

async function crmFornExcluirForm() {
  const fm = crmForn.fm;
  if (!fm || !fm.r) return;
  const ok = await confirmModal("Excluir esta opção de compra?", `${fm.r.m} — ${crmFornNome(fm.r.exc)}. Isso não pode ser desfeito.`, "Excluir", "Cancelar");
  if (!ok) return;
  const { error } = await sb.from("crm_fornecedores").delete().eq("id", fm.r.id);
  if (error) { toast("Não foi possível excluir: " + error.message); return; }
  crmFornFecharForm();
  await crmFornCarregar(true);
  crmRenderFornecedores();
  toast("Opção excluída.");
}

/* ---------------- e-mail para vários fornecedores (CCO) ---------------- */

const crmFornMk = (ex, e) => ex + "|" + e.toLowerCase();
function crmFornContatosEx(ex) {
  const v = new Map();
  crmForn.rows.filter(r => r.ex === ex).forEach(r => r.ct.forEach(c => { const e = (c[1] || "").trim(); if (e && !v.has(e.toLowerCase())) v.set(e.toLowerCase(), { n: c[0], e, inc: !crmFornEmailOk(e) }); }));
  return [...v.values()];
}
const crmFornMarcasEx = (ex) => [...new Set(crmForn.rows.filter(r => r.ex === ex).map(r => r.m))];
function crmFornExsVisiveis() {
  const q = crmForn.mail.busca.trim().toLowerCase();
  return crmFornExs().filter(ex => crmFornContatosEx(ex).length && (!q || (ex + " " + crmFornMarcasEx(ex).join(" ")).toLowerCase().includes(q)))
    .sort((a, b) => crmFornNome(a).localeCompare(crmFornNome(b), "pt-BR"));
}

function crmFornPintaMail() {
  const exs = crmFornExsVisiveis();
  document.getElementById("crmFornMList").innerHTML = exs.length ? exs.map(ex => `<div class="crm-forn-mx"><div class="crm-forn-mxtop"><label class="crm-forn-mxh"><input type="checkbox" data-crmfornmall="${escapeAttr(ex)}"><span class="mxn"><b>${escapeHtml(crmFornNome(ex))}</b><small>${escapeHtml(crmFornMarcasEx(ex).join(" · "))}</small></span>${crmFornPill(ex)}</label><button type="button" class="crm-forn-mcnt" data-crmfornmabre="1" aria-expanded="false"></button></div>
    <div class="crm-forn-mxc">${crmFornContatosEx(ex).map(c => `<label class="crm-forn-mxk${c.inc ? " off" : ""}" title="${c.inc ? "E-mail incompleto: fica de fora" : "Clique para incluir ou tirar este contato"}"><input type="checkbox" data-crmfornmk="${escapeAttr(ex)}" data-e="${escapeAttr(c.e)}"${c.inc ? " disabled" : ""}><i class="ck">✓</i><span class="nm"><b>${escapeHtml(c.n)}</b><small>${escapeHtml(c.e)}</small></span>${c.inc ? '<span class="inc">incompleto, fica de fora</span>' : ""}</label>`).join("")}</div></div>`).join("")
    : '<div class="empty-state">Nenhum fornecedor com e-mail para essa busca.</div>';
  crmFornSincMail();
}

function crmFornSincMail() {
  const m = crmForn.mail, ms = m.sel;
  const lista = document.getElementById("crmFornMList");
  lista.querySelectorAll("[data-crmfornmk]").forEach(i => { i.checked = ms.has(crmFornMk(i.dataset.crmfornmk, i.dataset.e)); });
  lista.querySelectorAll("[data-crmfornmall]").forEach(a => {
    const ks = [...lista.querySelectorAll("[data-crmfornmk]")].filter(i => i.dataset.crmfornmk === a.dataset.crmfornmall && !i.disabled);
    const n = ks.filter(i => i.checked).length;
    a.checked = ks.length > 0 && n === ks.length; a.indeterminate = n > 0 && n < ks.length; a.disabled = !ks.length;
    const b = a.closest(".crm-forn-mx").querySelector(".crm-forn-mcnt");
    b.textContent = `${n}/${ks.length} contato${ks.length > 1 ? "s" : ""} ▾`;
    b.classList.toggle("tem", n > 0);
  });
  const vis = [];
  crmFornExsVisiveis().forEach(ex => crmFornContatosEx(ex).forEach(c => { if (!c.inc) vis.push(crmFornMk(ex, c.e)); }));
  const nv = vis.filter(k => ms.has(k)).length, ab = document.getElementById("crmFornMAllBox");
  ab.checked = vis.length > 0 && nv === vis.length; ab.indeterminate = nv > 0 && nv < vis.length; ab.disabled = !vis.length;
  document.getElementById("crmFornMAllN").textContent = `${nv} de ${vis.length} contatos${m.busca.trim() ? " (da busca)" : ""}`;
  const emails = [], exs = new Set();
  crmFornExs().forEach(ex => crmFornContatosEx(ex).forEach(c => { if (!c.inc && ms.has(crmFornMk(ex, c.e))) { exs.add(ex); if (!emails.includes(c.e.toLowerCase())) emails.push(c.e.toLowerCase()); } }));
  const href = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(emails.join(","))}&su=${encodeURIComponent(document.getElementById("crmFornMAs").value)}&body=${encodeURIComponent(document.getElementById("crmFornMCo").value)}`;
  const go = document.getElementById("crmFornMGo");
  go.href = emails.length ? href : "#";
  go.setAttribute("aria-disabled", emails.length ? "false" : "true");
  document.getElementById("crmFornMCp").disabled = !emails.length;
  document.getElementById("crmFornMSum").innerHTML = emails.length ? `<b>${exs.size}</b> fornecedor${exs.size > 1 ? "es" : ""} · <b>${emails.length}</b> e-mail${emails.length > 1 ? "s" : ""} em cópia oculta` : "Nenhum fornecedor selecionado.";
  document.getElementById("crmFornMLong").hidden = href.length < 1900;
  m.emails = emails; m.exs = [...exs];
}

function crmFornAbrirMail() {
  if (crmForn.indisponivel || !crmForn.carregou) { toast("Os fornecedores ainda não carregaram."); return; }
  crmFornFecharFicha(); crmFornFecharForm();
  crmForn.mail = { sel: new Set(), busca: "", emails: [], exs: [] };
  const el = crmFornCriarOverlay("crmFornMailOverlay", "E-mail para vários fornecedores", "crm-forn-mail");
  crmFornCaixa("crmFornMailOverlay").innerHTML = `<div class="crm-forn-topo"><h2>E-mail para vários fornecedores</h2><div class="crm-forn-topo-acoes"><button type="button" class="btn small outline" data-crmfornfechar="mail" aria-label="Fechar">×</button></div></div>
    <div class="muted sv-sub">Escolha quem recebe. Cada fornecedor vai em <b>cópia oculta (CCO)</b>: nenhum vê o endereço dos outros. Entram todos os contatos do exportador; dá para tirar um a um.</div>
    <div class="crm-forn-mq"><span class="crm-forn-rot" style="margin:0;">Selecionar</span>
      <button type="button" class="crm-forn-chip" data-crmfornmq="all">Todos</button><button type="button" class="crm-forn-chip" data-crmfornmq="sem">Sem pedido</button><button type="button" class="crm-forn-chip" data-crmfornmq="ped">Pedida, sem resposta</button><button type="button" class="crm-forn-chip" data-crmfornmq="none">Limpar</button></div>
    <div class="field"><input type="search" id="crmFornMBusca" placeholder="Buscar exportador ou marca" aria-label="Buscar na lista" autocomplete="off"></div>
    <label class="crm-forn-mall"><input type="checkbox" id="crmFornMAllBox"><b>Selecionar todos os e-mails</b><small id="crmFornMAllN"></small></label>
    <div class="crm-forn-mlist" id="crmFornMList"></div>
    <div class="crm-forn-mmsg"><div class="field"><label for="crmFornMAs">Assunto</label><input id="crmFornMAs" value="${escapeAttr(CRM_FORN_ASSUNTO)}"></div>
      <div class="field"><label for="crmFornMCo">Mensagem</label><textarea id="crmFornMCo" rows="4">${escapeHtml(CRM_FORN_CORPO)}</textarea></div>
      <div class="note crm-erro" id="crmFornMLong" hidden>Muitos endereços para o Gmail aceitar pelo link. Use “Copiar endereços” e cole no campo CCO.</div></div>
    <div class="form-actions crm-forn-fmrod"><div class="falta" id="crmFornMSum"></div><button type="button" class="btn outline" data-crmfornfechar="mail">Cancelar</button><button type="button" class="btn outline" id="crmFornMCp">Copiar endereços</button><a class="btn primary" id="crmFornMGo" href="#" target="_blank" rel="noopener">✉︎ Abrir no Gmail</a></div>
    ${crmFornPodeEditar() ? `<div class="note">Ao abrir o Gmail, os fornecedores selecionados ficam marcados como <b>“Lista pedida em ${crmFornDM(crmFornHoje())}”</b>.</div>` : '<div class="note">Só a gestão marca “Lista pedida”; aqui o e-mail só abre o Gmail.</div>'}`;
  el.classList.add("show");
  el.scrollTop = 0;
  crmFornPintaMail();
}
function crmFornFecharMail() { const e = document.getElementById("crmFornMailOverlay"); if (e) e.classList.remove("show"); }

async function crmFornMarcarPedidas(exs) {
  if (!crmFornPodeEditar() || !exs.length) return;
  const agora = Date.now();
  exs.forEach(ex => { const l = crmForn.lista.get(ex) || { ped: 0, rec: 0 }; l.ped = agora; crmForn.lista.set(ex, l); });
  crmRenderFornecedores();
  const { error } = await sb.from("crm_fornecedores_lista").upsert(
    exs.map(ex => ({ exportador: ex, pedida_em: new Date(agora).toISOString(), atualizado_em: new Date(agora).toISOString(), atualizado_por: crmMeuId() })),
    { onConflict: "exportador" });
  if (error) { toast("O Gmail abriu, mas não foi possível registrar “lista pedida”: " + error.message); await crmFornCarregar(true); crmRenderFornecedores(); return; }
  toast(exs.length + (exs.length > 1 ? " fornecedores marcados" : " fornecedor marcado") + " como “Lista pedida em " + crmFornDM(agora) + "”.");
}

/* ---------------- eventos ---------------- */

function crmFornCopiar(t, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg), () => toast("Selecione e copie o texto."));
}

function crmFornClickGrade(e) {
  if (e.target.closest(".crm-forn-lst")) return; // o check da lista não abre a ficha
  const c = e.target.closest("[data-crmfornabrir]");
  if (c) crmFornAbrirFicha(c.dataset.crmfornabrir);
}

function crmFornClickFicha(e) {
  const t = e.target;
  if (t.id === "crmFornFichaOverlay") return crmFornFecharFicha();
  if (t.closest('[data-crmfornfechar="ficha"]')) return crmFornFecharFicha();
  const ed = t.closest("[data-crmfornedit]"); if (ed) return crmFornAbrirForm(ed.dataset.crmfornedit);
  const ab = t.closest("[data-crmfornaba]"); if (ab) return crmFornAbrirFicha(crmForn.fichaKey, +ab.dataset.crmfornaba);
  const em = t.closest("[data-crmfornemail]"); if (em) { crmFornCopiar(em.dataset.crmfornemail, "Endereço copiado — abrindo o Gmail"); return; }
  if (t.closest("[data-crmfornresumo]")) return crmFornCopiar(document.getElementById("crmFornResTxt").textContent, "Resumo copiado");
  const ex = t.closest("[data-crmfornirex]");
  if (ex) { crmForn.visao = "ex"; crmFornMarcaVisao(); crmRenderFornecedores(); return crmFornAbrirFicha(ex.dataset.crmfornirex); }
  const mm = t.closest("[data-crmfornmarca]");
  if (mm) { crmForn.visao = "marca"; crmFornMarcaVisao(); crmRenderFornecedores(); return crmFornAbrirFicha(mm.dataset.crmfornmarca); }
}
function crmFornMarcaVisao() {
  document.querySelectorAll("#crmFornVisao button").forEach(b => b.classList.toggle("on", b.dataset.crmfornvisao === crmForn.visao));
}

function crmFornClickForm(e) {
  const t = e.target, fm = crmForn.fm;
  if (t.closest('[data-crmfornfechar="form"]')) return crmFornFecharForm();
  if (!fm) return;
  const chip = t.closest("[data-crmforntipo]");
  if (chip) { const k = chip.dataset.crmforntipo; fm.tp.has(k) ? fm.tp.delete(k) : fm.tp.add(k); chip.classList.toggle("on"); return; }
  if (t.closest("[data-crmfornaddpg]")) { crmFornColhePg(); fm.pg.push({ p: "", w: "antes da chegada" }); document.getElementById("crmFornFmPg").innerHTML = fm.pg.map(crmFornPgLinha).join(""); return crmFornAtualizaForm(); }
  if (t.closest("[data-crmfornaddct]")) { crmFornColheCt(); fm.ct.push({ n: "", e: "" }); document.getElementById("crmFornFmCt").innerHTML = fm.ct.map(crmFornCtLinha).join(""); return crmFornAtualizaForm(); }
  const rp = t.closest("[data-crmfornrmpg]");
  if (rp) { crmFornColhePg(); if (fm.pg.length > 1) { fm.pg.splice(+rp.dataset.crmfornrmpg, 1); document.getElementById("crmFornFmPg").innerHTML = fm.pg.map(crmFornPgLinha).join(""); crmFornAtualizaForm(); } return; }
  const rc = t.closest("[data-crmfornrmct]");
  if (rc) { crmFornColheCt(); fm.ct.splice(+rc.dataset.crmfornrmct, 1); if (!fm.ct.length) fm.ct.push({ n: "", e: "" }); document.getElementById("crmFornFmCt").innerHTML = fm.ct.map(crmFornCtLinha).join(""); return crmFornAtualizaForm(); }
  if (t.closest("#crmFornFmOk")) return crmFornSalvarForm();
  const d = t.closest("#crmFornFmDel");
  if (d) {
    if (!fm.conf) { fm.conf = true; d.textContent = "Confirmar: excluir mesmo"; d.classList.add("conf"); return; }
    crmFornExcluirForm();
  }
}

function crmFornClickMail(e) {
  const t = e.target, m = crmForn.mail;
  if (t.id === "crmFornMailOverlay" || t.closest('[data-crmfornfechar="mail"]')) return crmFornFecharMail();
  const q = t.closest("[data-crmfornmq]");
  if (q) {
    const w = q.dataset.crmfornmq;
    m.sel = new Set();
    if (w !== "none") crmFornExsVisiveis().filter(ex => w === "all" || crmFornSt(ex) === w).forEach(ex => crmFornContatosEx(ex).forEach(c => { if (!c.inc) m.sel.add(crmFornMk(ex, c.e)); }));
    return crmFornSincMail();
  }
  const ab = t.closest("[data-crmfornmabre]");
  if (ab) { const o = ab.closest(".crm-forn-mx").classList.toggle("aberto"); ab.setAttribute("aria-expanded", String(o)); return; }
  if (t.closest("#crmFornMCp") && m.emails.length) return crmFornCopiar(m.emails.join(", "), m.emails.length + " endereços copiados");
  if (t.closest("#crmFornMGo")) {
    if (!m.emails.length) { e.preventDefault(); return; }
    const exs = m.exs.slice();
    crmFornMarcarPedidas(exs);
    setTimeout(crmFornFecharMail, 0);
  }
}

function crmFornChangeMail(e) {
  const t = e.target, m = crmForn.mail;
  if (t.id === "crmFornMAllBox") {
    crmFornExsVisiveis().forEach(ex => crmFornContatosEx(ex).forEach(c => { if (!c.inc) t.checked ? m.sel.add(crmFornMk(ex, c.e)) : m.sel.delete(crmFornMk(ex, c.e)); }));
    return crmFornSincMail();
  }
  const all = t.closest("[data-crmfornmall]"), k = t.closest("[data-crmfornmk]");
  if (all) crmFornContatosEx(all.dataset.crmfornmall).forEach(c => { if (!c.inc) all.checked ? m.sel.add(crmFornMk(all.dataset.crmfornmall, c.e)) : m.sel.delete(crmFornMk(all.dataset.crmfornmall, c.e)); });
  if (k) k.checked ? m.sel.add(crmFornMk(k.dataset.crmfornmk, k.dataset.e)) : m.sel.delete(crmFornMk(k.dataset.crmfornmk, k.dataset.e));
  if (all || k) crmFornSincMail();
}

function initCrmFornecedores() {
  const sec = document.getElementById("view-crm-fornecedores");
  if (!sec) return;
  ["crmFornBusca"].forEach(id => document.getElementById(id).addEventListener("input", crmRenderFornecedores));
  ["crmFornOrd", "crmFornSemRest"].forEach(id => document.getElementById(id).addEventListener("change", crmRenderFornecedores));
  document.getElementById("crmFornVisao").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmfornvisao]"); if (!b) return;
    crmForn.visao = b.dataset.crmfornvisao; crmFornMarcaVisao(); crmRenderFornecedores();
  });
  sec.addEventListener("click", (e) => {
    const t = e.target;
    const ti = t.closest("[data-crmfornt]"), pa = t.closest("[data-crmfornp]"), li = t.closest("[data-crmfornl]");
    if (ti) { const k = ti.dataset.crmfornt; crmForn.fTipo.has(k) ? crmForn.fTipo.delete(k) : crmForn.fTipo.add(k); return crmRenderFornecedores(); }
    if (pa) { const k = pa.dataset.crmfornp; crmForn.fPais.has(k) ? crmForn.fPais.delete(k) : crmForn.fPais.add(k); return crmRenderFornecedores(); }
    if (li) { const k = li.dataset.crmfornl; crmForn.fLista.has(k) ? crmForn.fLista.delete(k) : crmForn.fLista.add(k); return crmRenderFornecedores(); }
    if (t.closest("#crmFornBtnMail")) return crmFornAbrirMail();
    if (t.closest("#crmFornBtnNovo")) return crmFornAbrirForm();
  });
  const grade = document.getElementById("crmFornGrade");
  grade.addEventListener("click", crmFornClickGrade);
  grade.addEventListener("keydown", (e) => { if (e.target.closest(".crm-forn-lst")) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); crmFornClickGrade(e); } });
  grade.addEventListener("change", (e) => { const c = e.target.closest("[data-crmfornrec]"); if (c) crmFornMarcarRecebida(c.dataset.crmfornrec, c.checked); });
  // as janelas nascem na primeira vez que abrem; os eventos ficam no body
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("#crmFornFichaOverlay")) crmFornClickFicha(e);
    else if (e.target.closest("#crmFornFormOverlay")) crmFornClickForm(e);
    else if (e.target.closest("#crmFornMailOverlay")) crmFornClickMail(e);
  });
  document.body.addEventListener("change", async (e) => {
    if (e.target.closest("#crmFornFichaOverlay")) {
      const c = e.target.closest("[data-crmfornrec]");
      if (c) { await crmFornMarcarRecebida(c.dataset.crmfornrec, c.checked); crmFornAbrirFicha(crmForn.fichaKey, crmForn.fichaIdx); }
    } else if (e.target.closest("#crmFornFormOverlay")) {
      const w = e.target.closest(".w");
      if (w) { const o = w.parentElement.querySelector(".o"); o.style.display = w.value === CRM_FORN_OUTRO ? "" : "none"; if (w.value === CRM_FORN_OUTRO) o.focus(); }
      if (e.target.name === "crmFornRs" && crmForn.fm) crmForn.fm.rs = +e.target.value;
      crmFornAtualizaForm();
    } else if (e.target.closest("#crmFornMailOverlay")) crmFornChangeMail(e);
  });
  document.body.addEventListener("input", (e) => {
    if (e.target.closest("#crmFornFormOverlay")) crmFornAtualizaForm();
    else if (e.target.id === "crmFornMBusca") { crmForn.mail.busca = e.target.value; crmFornPintaMail(); }
    else if (e.target.id === "crmFornMAs" || e.target.id === "crmFornMCo") crmFornSincMail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const aberto = (id) => { const o = document.getElementById(id); return o && o.classList.contains("show"); };
    if (aberto("crmFornFormOverlay")) crmFornFecharForm();
    else if (aberto("crmFornMailOverlay")) crmFornFecharMail();
    else if (aberto("crmFornFichaOverlay")) crmFornFecharFicha();
  });
}

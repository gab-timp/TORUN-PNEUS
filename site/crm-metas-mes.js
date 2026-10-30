/* ---------------- CRM: Metas mês a mês (Gestão > Metas > aba "Mês a mês") ---------------- */
/* A gestão digita a meta da equipe e a de cada executivo para um mês; a soma dos executivos tem que bater com a da equipe
   (a função crm_salvar_metas_mes confere no banco). A meta anual (aba "Anual", em crm.js) continua separada. Dados em
   crm_meta_mes_equipe / crm_meta_mes_executivo (sql/crm_metas_mensais.sql). Usa crmNumMeta, crmFmtInteiro e crmPct do crm.js. */

const crmMetasMes = { aba: "mensal", mes: null, execs: [], comMeta: new Set(), cache: new Map(), sujo: false, anuais: new Map(), indisponivel: false, salvando: false, copiando: false };

const crmMMRotulo = (k) => `${CRM_DES_MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(0, 4)}`;
function crmMMAdd(k, n) {
  const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function crmMMMeses() {
  const a = Number(todayISO().slice(0, 4));
  const r = [];
  for (const ano of [a, a + 1]) for (let m = 1; m <= 12; m++) r.push(`${ano}-${String(m).padStart(2, "0")}`);
  return r;
}

// mostra a aba escolhida; chamado toda vez que a tela Metas abre
function crmMetasMesRender() {
  const abas = document.getElementById("crmMetasAbas");
  if (!abas) return;
  abas.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.crmmetasaba === crmMetasMes.aba));
  const mensal = crmMetasMes.aba === "mensal";
  document.getElementById("crmMetasCorpo").style.display = mensal ? "none" : "";
  if (mensal) {
    if (!crmMetasMes.mes) crmMetasMes.mes = todayISO().slice(0, 7);
    const selAno = document.getElementById("crmMetasAno");
    if (selAno && [...selAno.options].some(o => o.value === crmMetasMes.mes.slice(0, 4))) selAno.value = crmMetasMes.mes.slice(0, 4);
  }
  document.getElementById("crmMetasMesCorpo").style.display = mensal ? "" : "none";
  if (mensal) crmMetasMesCarregar();
}

async function crmMetasMesCarregar(mesPedido) {
  const corpo = document.getElementById("crmMetasMesCorpo");
  const meses = crmMMMeses();
  if (mesPedido) crmMetasMes.mes = mesPedido;
  if (!crmMetasMes.mes || !meses.includes(crmMetasMes.mes)) crmMetasMes.mes = todayISO().slice(0, 7);
  const mes = crmMetasMes.mes;
  // com o resultado da última vez a tela abre na hora; a busca nova corre por trás
  const cache = crmMetasMes.cache.get(mes);
  if (cache) crmMetasMesAplicar(cache);
  else corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando as metas…</div></div>`;
  const ano = Number(mes.slice(0, 4));
  const [ex, eq, ind, anu, tem] = await Promise.all([
    sb.rpc("crm_executivos_metas"),
    sb.from("crm_meta_mes_equipe").select("valor").eq("mes", mes + "-01").maybeSingle(),
    sb.from("crm_meta_mes_executivo").select("executivo_user_id, valor").eq("mes", mes + "-01"),
    sb.from("crm_meta_executivo").select("executivo_user_id, valor").eq("ano", ano),
    sb.from("crm_meta_mes_equipe").select("mes").gte("mes", ano + "-01-01").lte("mes", ano + "-12-01")
  ]);
  if (mes !== crmMetasMes.mes) return;
  if (ex.error || eq.error || ind.error) {
    if (!cache) {
      crmMetasMes.indisponivel = true;
      corpo.innerHTML = `<div class="card"><div class="empty-state">As metas mês a mês ainda não estão disponíveis: rode o SQL <b>sql/crm_metas_mensais.sql</b> no Supabase. (${escapeHtml((ex.error || eq.error || ind.error).message)})</div></div>`;
    }
    return;
  }
  const salvos = new Map((ind.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  const dados = {
    execs: (ex.data || []).map(e => ({ id: e.user_id, nome: e.nome, sistemas: e.sistemas || [], valor: salvos.get(e.user_id) || 0 })),
    anuais: new Map((anu.data || []).map(r => [r.executivo_user_id, Number(r.valor)])),
    comMeta: new Set((tem.data || []).map(r => String(r.mes).slice(0, 7))),
    equipe: eq.data ? Number(eq.data.valor) : 0
  };
  crmMetasMes.cache.set(mes, dados);
  const assin = (d) => JSON.stringify([d.execs, [...d.anuais], [...d.comMeta], d.equipe]);
  // com a tela já desenhada: só redesenha se mudou e se ninguém digitou nada nela
  if (cache && (assin(cache) === assin(dados) || crmMetasMes.sujo)) return;
  crmMetasMesAplicar(dados);
}

function crmMetasMesAplicar(d) {
  crmMetasMes.indisponivel = false;
  crmMetasMes.execs = d.execs.map(e => ({ ...e }));
  crmMetasMes.anuais = d.anuais;
  crmMetasMes.comMeta = new Set(d.comMeta);
  crmMetasMes.sujo = false;
  crmMetasMesDesenhar(d.equipe);
}

function crmMetasMesCfg(equipe) {
  const mes = crmMetasMes.mes;
  const nomeMes = CRM_DES_MESES[Number(mes.slice(5, 7)) - 1].toLowerCase();
  return {
    p: "crmMM", attr: "data-crmmmexec", ariaMeta: "Meta de " + crmMMRotulo(mes), titulo: "Meta de " + nomeMes + " por executivo",
    rotEq: "Meta da equipe em " + nomeMes, notaEq: crmMMRotulo(mes),
    execs: crmMetasMes.execs, equipe, podeEditar: crmPodeEscrever(),
    ref: { titulo: "Meta anual (referência)", valores: crmMetasMes.execs.map(e => crmMetasMes.anuais.get(e.id) || 0) },
    salvarTxt: "Salvar metas de " + nomeMes
  };
}

function crmMetasMesDesenhar(equipe) {
  const corpo = document.getElementById("crmMetasMesCorpo");
  const mes = crmMetasMes.mes;
  const ano = mes.slice(0, 4);
  const regua = Array.from({ length: 12 }, (_, i) => {
    const k = `${ano}-${String(i + 1).padStart(2, "0")}`;
    return `<button type="button" data-crmmmmes="${k}" aria-pressed="${k === mes}" class="${crmMetasMes.comMeta.has(k) ? "tem" : ""}" title="${escapeAttr(crmMMRotulo(k))}">${CRM_MES_ABREV[i].charAt(0).toUpperCase() + CRM_MES_ABREV[i].slice(1)}<i></i></button>`;
  }).join("");
  crmMtUltimo = -1;
  corpo.innerHTML = `
    <div class="crm-mt-regua" role="group" aria-label="Mês">${regua}</div>
    <div class="crm-mt-regua-rod"><span class="crm-mt-legponto"></span>mês com meta cadastrada
      <button type="button" class="btn outline small" id="crmMMCopiar" ${crmPodeEscrever() ? "" : "disabled"}>Copiar de ${escapeHtml(CRM_DES_MESES[Number(crmMMAdd(mes, -1).slice(5, 7)) - 1].toLowerCase())}</button></div>
    ${crmMtTelaHtml(crmMetasMesCfg(equipe))}`;
  crmMetasMesCalculo();
}

function crmMetasMesLer() {
  const equipe = crmNumMeta((document.getElementById("crmMMEquipe") || {}).value);
  const valores = crmMetasMes.execs.map((e, i) => crmNumMeta(document.querySelector(`[data-crmmmexec="${i}"]`).value));
  return { equipe, valores, soma: valores.reduce((t, v) => t + v, 0) };
}

function crmMetasMesCalculo() {
  if (!document.getElementById("crmMMEquipe") || crmMetasMes.indisponivel) return;
  const { equipe, valores } = crmMetasMesLer();
  crmMtCalcular(crmMetasMesCfg(equipe), equipe, valores, crmMetasMes.salvando);
}

async function crmMetasMesSalvar() {
  if (crmMetasMes.salvando || crmMetasMes.indisponivel) return;
  const { equipe, valores } = crmMetasMesLer();
  const individuais = crmMetasMes.execs.map((e, i) => ({ executivo_user_id: e.id, valor: valores[i] }));
  crmMetasMes.salvando = true;
  crmMetasMesCalculo();
  const { error } = await sb.rpc("crm_salvar_metas_mes", { p_mes: crmMetasMes.mes + "-01", p_equipe: equipe, p_individuais: individuais });
  crmMetasMes.salvando = false;
  if (error) {
    crmMetasMesCalculo();
    const nota = document.getElementById("crmMMNota");
    if (nota) nota.textContent = "Não foi possível salvar: " + error.message;
    return;
  }
  toast("Metas de " + crmMMRotulo(crmMetasMes.mes) + " salvas.");
  crmMetasMes.comMeta.add(crmMetasMes.mes);
  crmMetasMes.cache.delete(crmMetasMes.mes);
  crmMetasMes.sujo = false;
  const btnRegua = document.querySelector(`[data-crmmmmes="${crmMetasMes.mes}"]`);
  if (btnRegua) btnRegua.classList.add("tem");
  crmMetasMesCalculo();
}

// preenche os campos com as metas do mês anterior; nada é gravado até clicar em Salvar
async function crmMetasMesCopiar() {
  if (crmMetasMes.copiando) return;
  crmMetasMes.copiando = true;
  const ant = crmMMAdd(crmMetasMes.mes, -1);
  const [eq, ind] = await Promise.all([
    sb.from("crm_meta_mes_equipe").select("valor").eq("mes", ant + "-01").maybeSingle(),
    sb.from("crm_meta_mes_executivo").select("executivo_user_id, valor").eq("mes", ant + "-01")
  ]);
  crmMetasMes.copiando = false;
  const nota = document.getElementById("crmMMNota");
  if (eq.error || ind.error) { if (nota) nota.textContent = "Não foi possível ler as metas de " + crmMMRotulo(ant) + ": " + (eq.error || ind.error).message; return; }
  if (!eq.data) { toast("Não há metas cadastradas em " + crmMMRotulo(ant) + "."); return; }
  const mapa = new Map((ind.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  document.getElementById("crmMMEquipe").value = crmFmtInteiro(Number(eq.data.valor));
  crmMetasMes.execs.forEach((e, i) => { const v = mapa.get(e.id) || 0; document.querySelector(`[data-crmmmexec="${i}"]`).value = v ? crmFmtInteiro(v) : ""; });
  crmMetasMes.sujo = true;
  crmMetasMesCalculo();
  toast("Metas de " + crmMMRotulo(ant) + " copiadas. Confira e clique em Salvar.");
}

function crmMetasMesInit() {
  const abas = document.getElementById("crmMetasAbas");
  if (!abas) return;
  abas.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.crmmetasaba === crmMetasMes.aba) return;
    crmMetasMes.aba = b.dataset.crmmetasaba;
    crmMetasMesRender();
  });
  const corpo = document.getElementById("crmMetasMesCorpo");
  corpo.addEventListener("input", (e) => {
    if (e.target.classList.contains("crm-meta-in")) {
      crmMascarar(e.target);
      crmMetasMes.sujo = true;
      crmMtUltimo = e.target.dataset.crmmmexec === undefined ? -1 : Number(e.target.dataset.crmmmexec);
      crmMetasMesCalculo();
    }
  });
  document.getElementById("crmMetasAno").addEventListener("change", (e) => {
    if (crmMetasMes.aba !== "mensal") return;
    crmMetasMesCarregar(e.target.value + "-" + (crmMetasMes.mes || todayISO().slice(0, 7)).slice(5, 7));
  });
  corpo.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "crmMMSalvar") crmMetasMesSalvar();
    else if (b.id === "crmMMCopiar") crmMetasMesCopiar();
    else if (b.dataset.crmmmmes) crmMetasMesCarregar(b.dataset.crmmmmes);
  });
}

/* ---------------- CRM: Metas mês a mês (Gestão > Metas > aba "Mês a mês") ---------------- */
/* A gestão digita a meta da equipe e a de cada executivo para um mês; a soma dos executivos tem que bater com a da equipe
   (a função crm_salvar_metas_mes confere no banco). A meta anual (aba "Anual", em crm.js) continua separada. Dados em
   crm_meta_mes_equipe / crm_meta_mes_executivo (sql/crm_metas_mensais.sql). Usa crmNumMeta, crmFmtInteiro e crmPct do crm.js. */

const crmMetasMes = { aba: "anual", mes: null, execs: [], anuais: new Map(), indisponivel: false, salvando: false, copiando: false };

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
  document.querySelector("#view-crm-metas .crm-meta-ano").style.display = mensal ? "none" : "";
  document.getElementById("crmMetasMesCorpo").style.display = mensal ? "" : "none";
  if (mensal) crmMetasMesCarregar();
}

async function crmMetasMesCarregar(mesPedido) {
  const corpo = document.getElementById("crmMetasMesCorpo");
  const meses = crmMMMeses();
  if (mesPedido) crmMetasMes.mes = mesPedido;
  if (!crmMetasMes.mes || !meses.includes(crmMetasMes.mes)) crmMetasMes.mes = todayISO().slice(0, 7);
  const mes = crmMetasMes.mes;
  corpo.innerHTML = `<div class="card"><div class="empty-state">Carregando as metas…</div></div>`;
  const ano = Number(mes.slice(0, 4));
  const [ex, eq, ind, anu] = await Promise.all([
    sb.rpc("crm_executivos_metas"),
    sb.from("crm_meta_mes_equipe").select("valor").eq("mes", mes + "-01").maybeSingle(),
    sb.from("crm_meta_mes_executivo").select("executivo_user_id, valor").eq("mes", mes + "-01"),
    sb.from("crm_meta_executivo").select("executivo_user_id, valor").eq("ano", ano)
  ]);
  if (mes !== crmMetasMes.mes) return;
  if (ex.error || eq.error || ind.error) {
    crmMetasMes.indisponivel = true;
    corpo.innerHTML = `<div class="card"><div class="empty-state">As metas mês a mês ainda não estão disponíveis: rode o SQL <b>sql/crm_metas_mensais.sql</b> no Supabase. (${escapeHtml((ex.error || eq.error || ind.error).message)})</div></div>`;
    return;
  }
  crmMetasMes.indisponivel = false;
  const salvos = new Map((ind.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  crmMetasMes.anuais = new Map((anu.data || []).map(r => [r.executivo_user_id, Number(r.valor)]));
  crmMetasMes.execs = (ex.data || []).map(e => ({ id: e.user_id, nome: e.nome, sistemas: e.sistemas || [], valor: salvos.get(e.user_id) || 0 }));
  crmMetasMesDesenhar(eq.data ? Number(eq.data.valor) : 0);
}

function crmMetasMesDesenhar(equipe) {
  const corpo = document.getElementById("crmMetasMesCorpo");
  const mes = crmMetasMes.mes;
  const podeEditar = crmPodeEscrever();
  const dinheiro = (v) => v ? crmFmtInteiro(v) : "";
  const linhas = crmMetasMes.execs.map((e, i) => `
    <tr>
      <td><div class="crm-nome">${escapeHtml(e.nome)}</div></td>
      <td>${e.sistemas.length ? e.sistemas.map(s => `<span class="crm-selo crm-selo-tor">${escapeHtml(CRM_SISTEMAS[s] || s)}</span>`).join(" ") : '<span class="muted">—</span>'}</td>
      <td class="num"><span class="crm-meta-money"><span>R$</span><input type="text" inputmode="numeric" class="crm-meta-in" data-crmmmexec="${i}" value="${dinheiro(e.valor)}" aria-label="Meta de ${escapeAttr(crmMMRotulo(mes))} de ${escapeAttr(e.nome)}" ${podeEditar ? "" : "disabled"}></span></td>
      <td class="num muted">${crmMetasMes.anuais.get(e.id) ? crmFmtInteiro(crmMetasMes.anuais.get(e.id)) : "—"}</td>
    </tr>`).join("");
  const meses = crmMMMeses();
  corpo.innerHTML = `
    <div class="card">
      <div class="crm-meta-topo">
        <div class="field"><label for="crmMMMes">Mês</label><select id="crmMMMes">${meses.map(m => `<option value="${m}" ${m === mes ? "selected" : ""}>${crmMMRotulo(m)}</option>`).join("")}</select></div>
        <div class="field"><label for="crmMMEquipe">Meta da equipe em ${escapeHtml(CRM_DES_MESES[Number(mes.slice(5, 7)) - 1].toLowerCase())}</label>
          <span class="crm-meta-money crm-meta-grande"><span>R$</span><input type="text" inputmode="numeric" id="crmMMEquipe" class="crm-meta-in" value="${dinheiro(equipe)}" ${podeEditar ? "" : "disabled"}></span></div>
        <div class="field"><button type="button" class="btn outline" id="crmMMCopiar" ${podeEditar ? "" : "disabled"}>Copiar de ${escapeHtml(CRM_DES_MESES[Number(crmMMAdd(mes, -1).slice(5, 7)) - 1].toLowerCase())}</button></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Meta de ${escapeHtml(crmMMRotulo(mes))} por executivo</h2><div class="note">A soma das metas individuais tem que bater com a meta da equipe.</div></div>
      ${crmMetasMes.execs.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Executivo</th><th>Sistemas</th><th class="num">Meta do mês</th><th class="num">Meta anual (referência)</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="2">Soma das metas individuais</td><td class="num" id="crmMMSoma"></td><td><span class="crm-selo" id="crmMMStatus"></span></td></tr></tfoot>
      </table></div>` : `<div class="empty-state">Nenhum executivo cadastrado. Marque o papel Executivo em Administração > Usuários.</div>`}
      <div class="crm-meta-rodape">
        <div class="note" id="crmMMNota"></div>
        <button type="button" class="btn primary" id="crmMMSalvar" ${podeEditar ? "" : "disabled"}>Salvar metas de ${escapeHtml(CRM_DES_MESES[Number(mes.slice(5, 7)) - 1].toLowerCase())}</button>
      </div>
    </div>`;
  crmMetasMesCalculo();
}

function crmMetasMesLer() {
  const equipe = crmNumMeta((document.getElementById("crmMMEquipe") || {}).value);
  const valores = crmMetasMes.execs.map((e, i) => crmNumMeta(document.querySelector(`[data-crmmmexec="${i}"]`).value));
  return { equipe, valores, soma: valores.reduce((t, v) => t + v, 0) };
}

function crmMetasMesCalculo() {
  if (!document.getElementById("crmMMEquipe") || crmMetasMes.indisponivel) return;
  const { equipe, soma } = crmMetasMesLer();
  const dif = equipe - soma;
  const fecha = dif === 0 && equipe > 0 && crmMetasMes.execs.length > 0;
  const somaEl = document.getElementById("crmMMSoma");
  if (somaEl) somaEl.textContent = "R$ " + crmFmtInteiro(soma);
  const st = document.getElementById("crmMMStatus");
  if (st) {
    st.className = "crm-selo " + (fecha ? "crm-selo-ok" : dif === 0 ? "" : dif > 0 ? "crm-selo-warn" : "crm-selo-bad");
    st.textContent = fecha ? "bate com a equipe" : dif > 0 ? `faltam R$ ${crmFmtInteiro(dif)}` : dif < 0 ? `passa R$ ${crmFmtInteiro(-dif)}` : "informe as metas";
  }
  const nota = document.getElementById("crmMMNota");
  if (nota) nota.textContent = fecha ? "Tudo certo para salvar." : equipe === 0 ? "Informe a meta da equipe do mês." : dif === 0 ? "Informe a meta de pelo menos um executivo." : `A soma dos executivos (R$ ${crmFmtInteiro(soma)}) não bate com a meta da equipe (R$ ${crmFmtInteiro(equipe)}).`;
  const btn = document.getElementById("crmMMSalvar");
  if (btn) btn.disabled = !fecha || !crmPodeEscrever() || crmMetasMes.salvando;
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
      crmMetasMesCalculo();
    }
  });
  corpo.addEventListener("change", (e) => { if (e.target.id === "crmMMMes") crmMetasMesCarregar(e.target.value); });
  corpo.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "crmMMSalvar") crmMetasMesSalvar();
    else if (b.id === "crmMMCopiar") crmMetasMesCopiar();
  });
}

/* ---------------- CRM: visual das telas de Metas (aba Anual e aba Mês a mês) ---------------- */
/* Só a aparência: resumo em três blocos (meta da equipe, distribuído, situação), uma barra única com a divisão entre os
   executivos e a tabela de metas. A lógica (soma tem que bater, salvar, copiar) continua em crm.js e crm-metas-mes.js, que
   montam o HTML por crmMtTelaHtml e atualizam os números por crmMtCalcular. Cada tela passa o prefixo dos seus ids:
   anual = crmMeta, mês a mês = crmMM. */

const CRM_MT_CORES = ["#FF6A13", "#161616", "#0E6560", "#2B4C7E", "#B45309", "#7A3E9D", "#6B6B6B", "#B91C1C"];
let crmMtUltimo = -1; // último executivo mexido: é nele que aparece o vermelho quando a soma passa da equipe

const crmMtCor = (i) => CRM_MT_CORES[i % CRM_MT_CORES.length];

/* cfg: { p, attr, titulo, rotEq, notaEq, execs:[{nome, sistemas, valor}], equipe, podeEditar, ref:{titulo, valores}|null, salvarTxt } */
function crmMtTelaHtml(cfg) {
  const { p } = cfg;
  const dinheiro = (v) => v ? crmFmtInteiro(v) : "";
  const linhas = cfg.execs.map((e, i) => `
    <tr>
      <td><span class="crm-mt-ponto" style="background:${crmMtCor(i)}"></span><b>${escapeHtml(e.nome)}</b></td>
      <td>${e.sistemas.length ? e.sistemas.map(s => `<span class="crm-selo crm-selo-tor">${escapeHtml(CRM_SISTEMAS[s] || s)}</span>`).join(" ") : '<span class="muted">—</span>'}</td>
      <td><label class="crm-mt-campo" id="${p}Campo${i}"><span>R$</span><input type="text" inputmode="numeric" class="crm-meta-in" ${cfg.attr}="${i}" value="${dinheiro(e.valor)}" aria-label="${escapeAttr(cfg.ariaMeta)} de ${escapeAttr(e.nome)}" ${cfg.podeEditar ? "" : "disabled"}></label></td>
      <td><div class="crm-mt-parte"><div class="crm-mt-trilho"><i id="${p}Barra${i}" style="background:${crmMtCor(i)}"></i></div><b id="${p}Pct${i}"></b></div></td>
      ${cfg.ref ? `<td class="num crm-mt-ref">${cfg.ref.valores[i] ? crmFmtInteiro(cfg.ref.valores[i]) : "—"}</td>` : ""}
    </tr>`).join("");
  return `
    <div class="crm-mt-resumo">
      <div class="crm-mt-bloco"><div class="crm-mt-rot">${escapeHtml(cfg.rotEq)}</div>
        <label class="crm-mt-eq"><span>R$</span><input type="text" inputmode="numeric" id="${p}Equipe" class="crm-meta-in" value="${dinheiro(cfg.equipe)}" aria-label="${escapeAttr(cfg.rotEq)}" ${cfg.podeEditar ? "" : "disabled"}></label>
        <div class="crm-mt-sub">${escapeHtml(cfg.notaEq)}</div></div>
      <div class="crm-mt-bloco"><div class="crm-mt-rot">Distribuído aos executivos</div><div class="crm-mt-num" id="${p}Dist"></div><div class="crm-mt-sub" id="${p}DistPct"></div></div>
      <div class="crm-mt-bloco"><div class="crm-mt-rot">Situação</div><div><span class="crm-mt-estado" id="${p}Estado"></span></div><div class="crm-mt-sub" id="${p}EstadoTxt"></div></div>
    </div>
    <div class="card crm-mt-barra"><div class="crm-mt-tit"><span>Divisão da meta entre os executivos</span><span id="${p}BarraPct"></span></div>
      <div class="crm-mt-pilha" id="${p}Pilha"></div><div class="crm-mt-leg" id="${p}Leg"></div></div>
    <div class="card crm-mt-tab">
      <div class="card-head"><h2>${escapeHtml(cfg.titulo)}</h2><div class="note">A soma das metas individuais tem que bater com a meta da equipe.</div></div>
      ${cfg.execs.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Executivo</th><th>Sistemas</th><th>Meta</th><th>Parte da equipe</th>${cfg.ref ? `<th class="num">${escapeHtml(cfg.ref.titulo)}</th>` : ""}</tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="2">Soma das metas individuais</td><td class="mono" id="${p}Soma"></td><td ${cfg.ref ? 'colspan="2"' : ""}><span class="crm-selo" id="${p}Status"></span></td></tr></tfoot>
      </table></div>
      <div class="crm-mt-aviso" id="${p}Aviso" hidden></div>` : `<div class="empty-state">Nenhum executivo cadastrado. Marque o papel Executivo em Administração > Usuários.</div>`}
      <div class="crm-mt-acoes">
        <div class="note" id="${p}Nota"></div>
        <button type="button" class="btn primary" id="${p}Salvar" ${cfg.podeEditar ? "" : "disabled"}>${escapeHtml(cfg.salvarTxt)}</button>
      </div>
    </div>`;
}

// atualiza números, barra, status e botão sem refazer os campos (o foco não se perde); devolve se a soma fecha
function crmMtCalcular(cfg, equipe, valores, salvando) {
  const { p } = cfg;
  const soma = valores.reduce((a, b) => a + b, 0);
  const dif = equipe - soma;
  const fecha = dif === 0 && equipe > 0 && cfg.execs.length > 0;
  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set(p + "Soma", "R$ " + crmFmtInteiro(soma));
  set(p + "Dist", "R$ " + crmFmtInteiro(soma));
  set(p + "DistPct", equipe ? Math.round(soma / equipe * 100) + "% da meta da equipe" : "Informe a meta da equipe");
  set(p + "BarraPct", equipe ? Math.round(soma / equipe * 100) + "% distribuído" : "");
  valores.forEach((v, i) => {
    const pc = equipe ? v / equipe * 100 : 0;
    const barra = document.getElementById(p + "Barra" + i);
    if (barra) barra.style.width = Math.min(100, pc) + "%";
    set(p + "Pct" + i, crmPct(pc));
    const campo = document.getElementById(p + "Campo" + i);
    if (campo) campo.classList.toggle("erro", dif < 0 && v > 0 && i === crmMtUltimo);
  });
  // barra única: a parte de cada um e, se faltar, o pedaço que sobra listrado
  const base = Math.max(equipe, soma, 1);
  const pilha = document.getElementById(p + "Pilha");
  if (pilha) pilha.innerHTML = valores.map((v, i) => `<i style="width:${v / base * 100}%;background:${crmMtCor(i)}"></i>`).join("") + (dif > 0 ? `<i class="falta" style="width:${dif / base * 100}%"></i>` : "");
  const leg = document.getElementById(p + "Leg");
  if (leg) leg.innerHTML = cfg.execs.map((e, i) => `<span><b style="background:${crmMtCor(i)}"></b>${escapeHtml(e.nome.split(" ")[0])} ${equipe ? Math.round(valores[i] / equipe * 100) : 0}%</span>`).join("")
    + (dif > 0 && equipe ? `<span class="crm-mt-ruim">falta ${Math.round(dif / equipe * 100)}%</span>` : "") + (dif < 0 && equipe ? `<span class="crm-mt-ruim">passa ${Math.round(-dif / equipe * 100)}%</span>` : "");
  // situação
  const est = document.getElementById(p + "Estado");
  const estTxt = !equipe ? ["ne", "Aguardando a meta da equipe", "Digite a meta da equipe."]
    : fecha ? ["ok", "Fecha com a equipe", "Pode salvar."]
    : dif > 0 ? ["no", "Faltam " + formatMoney(dif), "Distribua o restante entre os executivos."]
    : dif < 0 ? ["no", "Passou " + formatMoney(-dif), "Reduza as metas dos executivos."]
    : ["ne", "Informe as metas", "Digite a meta de cada executivo."];
  if (est) { est.className = "crm-mt-estado crm-mt-" + estTxt[0]; est.textContent = "● " + estTxt[1]; }
  set(p + "EstadoTxt", estTxt[2]);
  const st = document.getElementById(p + "Status");
  if (st) {
    st.className = "crm-selo " + (fecha ? "crm-selo-ok" : dif === 0 ? "" : dif > 0 ? "crm-selo-warn" : "crm-selo-bad");
    st.textContent = fecha ? "bate com a equipe" : dif === 0 ? "informe as metas" : dif > 0 ? `faltam ${formatMoney(dif)}` : `passou ${formatMoney(-dif)}`;
  }
  const av = document.getElementById(p + "Aviso");
  if (av) {
    av.hidden = !(equipe && soma && dif !== 0);
    av.textContent = `A soma das metas dos executivos (R$ ${crmFmtInteiro(soma)}) não bate com a meta da equipe (R$ ${crmFmtInteiro(equipe)}).`;
  }
  set(p + "Nota", fecha ? "Tudo certo para salvar." : "Só dá para salvar quando a soma das individuais for igual à meta da equipe.");
  const btn = document.getElementById(p + "Salvar");
  if (btn) btn.disabled = !fecha || !crmPodeEscrever() || !!salvando;
  return fecha;
}

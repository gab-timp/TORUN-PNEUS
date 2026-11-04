/* ---------------- CRM: Ligações em kanban (vários contatos por cliente), cotações, obs do cartão e Arquivados ---------------- */
/* Cada "contato" com o cliente é um cartão (uma negociação, tabela crm_negociacoes, sql/crm_negociacoes.sql). Quando o contato
   termina (etapa Fechado ou Declinou) ele sai do quadro e fica em Arquivados; o cliente pode começar outro contato depois.
   Sem o SQL rodado, esta tela avisa e o resto do CRM segue como antes (a etapa volta a ser a da carteira). */

const CRM_ETAPAS_FINAIS = ["Fechado", "Declinou"];
const crmLg = { visao: "kanban", busca: "", atrasados: false, montado: false, sortables: [] };
let crmLgCotNegId = null;
let crmLgCotValor = 0;
let crmLgObsNegId = null;

crmState.negociacoes = [];
crmState.negDisponivel = false;
crmIdx.neg = new Map();

// quem tem carteira própria (executivo; gestão que ligou a carteira dela) abre a tela Ligações
function crmPodeVerLigacoes() { return currentUserIsAdmin || crmTemCarteiraPropria(); }

/* ---------------- dados ---------------- */

function crmNegFromRow(r) {
  return {
    id: r.id, sistema: r.sistema, cliente: r.cliente, numero: r.numero || 1, etapa: r.etapa || null, etapaDesde: r.etapa_desde || null,
    obs: r.obs || "", cotEnviadas: r.cot_enviadas || 0, cotAprovadas: r.cot_aprovadas || 0, finalizadaEm: r.finalizada_em || null,
    createdAt: r.created_at
  };
}

function crmReindexarNeg() {
  const m = new Map();
  crmState.negociacoes.forEach(n => {
    const k = crmChave(n.sistema, n.cliente);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  });
  m.forEach(a => a.sort((x, y) => y.numero - x.numero));
  crmIdx.neg = m;
}

// chamado no fim da carga do CRM; sem a tabela (SQL não rodado) as telas antigas continuam valendo
async function crmCarregarNegociacoes() {
  const r = await selectTudoPaginado("crm_negociacoes", "created_at");
  if (r.error) {
    crmState.negDisponivel = false;
    crmState.negociacoes = [];
    crmIdx.neg = new Map();
    console.warn("Contatos do kanban (crm_negociacoes) indisponíveis:", r.error.message);
    return;
  }
  crmState.negDisponivel = true;
  crmState.negociacoes = (r.data || []).map(crmNegFromRow);
  crmReindexarNeg();
}

function crmNegsDe(c) { return crmIdx.neg.get(crmChave(c.sistema, c.cliente)) || []; }
function crmNegAberta(c) { return crmNegsDe(c).find(n => !n.finalizadaEm) || null; }
function crmNegPorId(id) { return crmState.negociacoes.find(n => n.id === id) || null; }

// etapa que a ficha mostra: a do contato aberto (ou, sem ele, a da carteira no modo antigo)
function crmEtapaAtual(c) {
  if (!crmState.negDisponivel) return { etapa: c.etapa, desde: c.etapaDesde, aberto: true };
  const n = crmNegAberta(c);
  return { etapa: n ? n.etapa : null, desde: n ? n.etapaDesde : null, aberto: !!n };
}

/* ---------------- gravar ---------------- */

async function crmHistoricoEtapa(c, n, de, para, origem) {
  const h = await sb.from("crm_etapa_historico").insert({
    sistema: c.sistema, cliente: c.cliente, de: de || null, para, origem, por_user_id: currentUser.id, por_nome: currentUserNome,
    negociacao_id: n ? n.id : null
  }).select();
  if (h.error) { toast("A etapa mudou, mas o histórico não foi gravado: " + h.error.message); return null; }
  if (h.data && h.data[0] && typeof crmHistFromRow === "function") { crmState.historico.push(crmHistFromRow(h.data[0])); crmReindexar(); }
  return h.data && h.data[0] ? h.data[0] : null;
}

// cria um contato novo (cartão) do cliente. etapa vazia = entra em "Sem etapa". Devolve o contato ou null.
async function crmCriarNeg(c, etapa, origem, extra) {
  const numero = crmNegsDe(c).reduce((m, n) => Math.max(m, n.numero), 0) + 1;
  const agora = new Date().toISOString();
  const final = !!etapa && CRM_ETAPAS_FINAIS.includes(etapa);
  const linha = {
    sistema: c.sistema, cliente: c.cliente, numero, etapa: etapa || null, etapa_desde: etapa ? agora : null,
    finalizada_em: final ? agora : null
  };
  if (extra && extra.obs) linha.obs = extra.obs;
  const { data, error } = await sb.from("crm_negociacoes").insert(linha).select();
  if (error) { toast("Erro ao criar o contato: " + error.message); return null; }
  if (!data || !data[0]) { toast("Não foi possível criar o contato (sem permissão)."); return null; }
  const n = crmNegFromRow(data[0]);
  crmState.negociacoes.push(n);
  crmReindexarNeg();
  if (etapa) await crmHistoricoEtapa(c, n, null, etapa, origem || "kanban");
  return n;
}

// muda a etapa do contato; Fechado e Declinou terminam o contato (vai para Arquivados). Devolve true se gravou.
async function crmMoverNeg(n, c, nova, origem) {
  const agora = new Date().toISOString();
  const final = CRM_ETAPAS_FINAIS.includes(nova);
  const { data, error } = await sb.from("crm_negociacoes").update({ etapa: nova, etapa_desde: agora, finalizada_em: final ? agora : null }).eq("id", n.id).select();
  if (error) { toast("Erro ao mudar a etapa: " + error.message); return false; }
  if (!data || data.length === 0) { toast("Não foi possível mudar a etapa (sem permissão)."); return false; }
  const de = n.etapa;
  n.etapa = nova;
  n.etapaDesde = agora;
  n.finalizadaEm = final ? agora : null;
  crmReindexarNeg();
  await crmHistoricoEtapa(c, n, de, nova, origem);
  return true;
}

// usado pela ficha e pelo modo antigo: muda a etapa do contato aberto (cria um contato novo se não houver)
async function crmGravarEtapaNeg(c, nova, origem) {
  const aberto = crmNegAberta(c);
  if (aberto) return crmMoverNeg(aberto, c, nova, origem);
  const n = await crmCriarNeg(c, nova, origem);
  return !!n;
}

async function crmAtualizarNeg(n, campos) {
  const { data, error } = await sb.from("crm_negociacoes").update(campos).eq("id", n.id).select();
  if (error) return error.message;
  if (!data || !data[0]) return "sem permissão";
  const novo = crmNegFromRow(data[0]);
  n.obs = novo.obs; n.cotEnviadas = novo.cotEnviadas; n.cotAprovadas = novo.cotAprovadas;
  return null;
}

/* ---------------- tela Ligações ---------------- */

function crmLgMeusClientes() {
  const s = crmSistemaAtual();
  return crmState.carteira.filter(c => c.sistema === s && !crmEhRepresentante(c.cliente) && (crmEhExecutivo() || crmEhMinha(c)));
}

function crmLgLigsPorNeg() {
  const m = new Map();
  crmState.ligacoes.forEach(l => {
    if (!l.negociacaoId) return;
    if (!m.has(l.negociacaoId)) m.set(l.negociacaoId, []);
    m.get(l.negociacaoId).push(l);
  });
  m.forEach(a => a.sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || "")));
  return m;
}

function crmLgFiltro(c) {
  const busca = crmLg.busca.trim().toLowerCase();
  if (busca) {
    const ct = crmContatoRapido(c);
    const obs = crmNegsDe(c).map(n => n.obs).join(" ");
    if (![c.cliente, crmCidadeUF(c.cliente), ct.nome, obs].join(" ").toLowerCase().includes(busca)) return false;
  }
  if (crmLg.atrasados) { const fu = crmResumo(c).fu; if (!(fu && fu < todayISO())) return false; }
  return true;
}

function crmLgKpis(meus) {
  const mes = todayISO().slice(0, 7);
  const ligsMes = crmState.ligacoes.filter(l => l.sistema === crmSistemaAtual() && l.executivoId === crmMeuId() && crmDiaLocal(l.createdAt).slice(0, 7) === mes);
  const hoje = todayISO();
  const atrasados = meus.filter(c => { const fu = crmResumo(c).fu; return fu && fu < hoje; }).length;
  const r = crmDesResumo(ligsMes, atrasados);
  // cotações: dos contatos que tiveram ligação neste mês (enviadas e aprovadas na mesma base, para a taxa fazer sentido)
  const ids = new Set(ligsMes.map(l => l.negociacaoId).filter(Boolean));
  let env = 0, apr = 0;
  crmState.negociacoes.forEach(n => { if (ids.has(n.id)) { env += n.cotEnviadas; apr += n.cotAprovadas; } });
  document.getElementById("crmLgKpis").innerHTML = `
    <div class="kpi"><div class="lbl">Ligações no mês</div><div class="val">${fmt(r.total)}</div></div>
    <div class="kpi"><div class="lbl">Taxa de contato</div><div class="val">${crmDesPct(r.atenderam, r.total)}</div><div class="muted sv-sub">${fmt(r.atenderam)} de ${fmt(r.total)} atenderam</div></div>
    <div class="kpi"><div class="lbl">Cotações enviadas</div><div class="val">${fmt(env)}</div><div class="muted sv-sub">dos contatos com ligação no mês</div></div>
    <div class="kpi"><div class="lbl">Cotações aprovadas</div><div class="val">${fmt(apr)}</div><div class="muted sv-sub">${crmDesPct(apr, env)} das enviadas</div></div>
    <div class="kpi ${atrasados ? "crm-alerta" : ""}"><div class="lbl">Follow-ups atrasados</div><div class="val">${fmt(atrasados)}</div></div>`;
}

function crmLgTagContato(n) { return n && n.numero > 1 ? `<span class="crm-selo crm-selo-contato">${n.numero}º contato</span>` : ""; }

function crmLgCartao(x) {
  const { c, n, ligs } = x;
  const ct = crmContatoRapido(c);
  const ult = ligs[0] || null;
  const fu = ult ? ult.proximoFollowup : (ligs.length ? null : c.primeiroFollowup);
  const dias = n.etapaDesde ? diasDesde(crmDiaLocal(n.etapaDesde)) : null;
  const rodape = `${ligs.length} ${ligs.length === 1 ? "ligação" : "ligações"}` + (dias !== null ? ` · há ${dias} ${dias === 1 ? "dia" : "dias"} nesta etapa` : "");
  const pct = n.cotEnviadas ? Math.round(n.cotAprovadas / n.cotEnviadas * 100) : 0;
  const podeEditar = crmPodeGerirCarteira();
  const acoes = [crmAtalhosHtml(ct)];
  if (crmPodeLigarPara(c)) acoes.push(`<button type="button" class="btn small primary" data-crmligar="${escapeAttr(c.id)}">Registrar ligação</button>`);
  return `
    <div class="kanban-card crm-cartao ${crmEhMinha(c) ? "crm-minha-cartao" : ""}" data-id="${escapeAttr(c.id)}" data-neg="${escapeAttr(n.id)}">
      <div><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button> ${crmTipoSelo(c.cliente)}${crmLgTagContato(n)}</div>
      <div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}</div>
      <div class="crm-cartao-contato">${ct.nome ? escapeHtml(ct.nome) : '<span class="muted">sem contato</span>'}${ct.cargo ? ` <span class="muted">· ${escapeHtml(ct.cargo)}</span>` : ""}</div>
      <div class="crm-cartao-linha"><span class="crm-rot">Última ligação</span><div>${crmUltimaHtml({ ultima: ult })}</div></div>
      <div class="crm-cartao-linha"><span class="crm-rot">Próximo follow-up</span><div>${crmFollowupHtml(fu)}</div></div>
      <div class="crm-cartao-linha"><span class="crm-rot">Cotações</span>
        <div class="crm-cot-linha"><span><b class="mono">${n.cotEnviadas}</b> enviadas · <b class="mono crm-cot-ok">${n.cotAprovadas}</b> aprovadas</span>
          ${podeEditar ? `<button type="button" class="btn small outline" data-crmlgcot="${escapeAttr(n.id)}">Marcar aprovadas</button>` : ""}</div>
        <div class="crm-cot-barra"><span style="width:${pct}%"></span></div></div>
      <div class="crm-cartao-linha"><span class="crm-rot">Obs.</span>
        ${podeEditar
          ? `<button type="button" class="crm-obs" data-crmlgobs="${escapeAttr(n.id)}">${n.obs ? escapeHtml(n.obs) : '<span class="muted">Clique para escrever…</span>'}</button>`
          : `<div class="crm-obs crm-obs-ler">${n.obs ? escapeHtml(n.obs) : '<span class="muted">—</span>'}</div>`}</div>
      <div class="crm-cartao-rodape">${escapeHtml(rodape)}</div>
      <div class="crm-cartao-acoes">${acoes.filter(Boolean).join(" ")}</div>
    </div>`;
}

function crmLgChip(x) {
  const { c, n, ligs } = x;
  const ct = crmContatoRapido(c);
  const ult = ligs[0] || null;
  return `<div class="crm-chip-cliente" data-id="${escapeAttr(c.id)}" data-neg="${n ? escapeAttr(n.id) : ""}">
      <button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button>${crmLgTagContato(n)}
      <span class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${ct.nome ? " · " + escapeHtml(ct.nome) : ""}</span>
      ${ult ? crmPill(ult.resultado) : '<span class="muted sv-sub">Nunca ligado</span>'}
    </div>`;
}

function crmLgMontar() {
  const board = document.getElementById("crmLgBoard");
  board.innerHTML = CRM_ETAPAS.map((e, i) => {
    const final = CRM_ETAPAS_FINAIS.includes(e.nome);
    return `
    <div class="kanban-col ${final ? "crm-col-final" : ""}" style="--col-accent:${e.accent}; --col-deep:${e.deep}; --col-pale:${e.pale};">
      <div class="kanban-col-head"><span>${escapeHtml(e.nome)}</span><span class="kanban-count" id="crmLgCount${i}">0</span></div>
      <div class="kanban-cards" id="crmLgCol${i}" data-etapa="${escapeAttr(e.nome)}"></div>
    </div>`;
  }).join("");
  initKanbanBoardDragScroll("crmLgBoard");
  const opcoes = { group: "crm-lg-kanban", animation: 150, filter: "button, a", preventOnFilter: false, onEnd: crmLgSoltar };
  crmLg.sortables = CRM_ETAPAS.map((_, i) => Sortable.create(document.getElementById("crmLgCol" + i), opcoes));
  crmLg.sortables.push(Sortable.create(document.getElementById("crmLgBandeja"), { ...opcoes, sort: false }));
  crmLg.montado = true;
}

function crmRenderLigacoes() {
  const view = document.getElementById("view-crm-ligacoes");
  if (!view) return;
  const gestaoComCarteira = crmGestaoComCarteira();
  document.getElementById("crmLgGestaoSeg").style.display = gestaoComCarteira ? "" : "none";
  document.querySelectorAll("#crmLgVisaoSeg button").forEach(b => b.classList.toggle("on", b.dataset.crmlgvisao === crmLg.visao));
  document.getElementById("crmLgNova").style.display = crmPodeGerirCarteira() ? "" : "none";
  document.getElementById("crmLgSub").textContent = crmLg.visao === "arquivados"
    ? "Contatos que terminaram em Fechado ou Declinou. Ficam guardados aqui, com cotações e observações."
    : "Arraste o cartão para mudar a etapa. Cada cartão é um contato com o cliente; quando ele termina, vai para Arquivados e o cliente pode ter um novo contato depois.";

  const quadro = document.getElementById("crmLgKanbanWrap");
  const arq = document.getElementById("crmLgArquivadosWrap");
  const vazio = document.getElementById("crmLgVazio");
  const rodape = document.getElementById("crmLgRodape");
  const kpis = document.getElementById("crmLgKpis");
  if (!crmState.negDisponivel) {
    quadro.style.display = "none"; arq.style.display = "none"; kpis.innerHTML = "";
    vazio.style.display = "block";
    vazio.textContent = "O banco ainda não tem os contatos do kanban (sql/crm_negociacoes.sql). Rode o SQL no Supabase para usar esta tela.";
    rodape.textContent = "";
    return;
  }
  const meus = crmLgMeusClientes();
  const porNeg = crmLgLigsPorNeg();
  crmLgKpis(meus);
  document.getElementById("crmLgAtrasados").classList.toggle("on", crmLg.atrasados);
  document.getElementById("crmLgAtrasados").setAttribute("aria-pressed", crmLg.atrasados ? "true" : "false");

  const visiveis = meus.filter(crmLgFiltro);
  const abertos = [], semNeg = [], arquivados = [];
  visiveis.forEach(c => {
    const negs = crmNegsDe(c);
    if (!negs.length) { semNeg.push({ c, n: null, ligs: [] }); return; }
    negs.forEach(n => {
      const x = { c, n, ligs: porNeg.get(n.id) || [] };
      if (n.finalizadaEm) arquivados.push(x);
      else abertos.push(x);
    });
  });

  const emArquivados = crmLg.visao === "arquivados";
  quadro.style.display = emArquivados ? "none" : "";
  arq.style.display = emArquivados ? "" : "none";
  const totalAbertos = abertos.length + semNeg.length;
  vazio.style.display = "none";
  if (meus.length === 0) {
    vazio.style.display = "block";
    vazio.textContent = crmPodeGerirCarteira() ? "Nenhum cliente na carteira ainda. Adicione clientes em Clientes." : "Nenhum cliente na carteira ainda.";
  }
  rodape.textContent = `${meus.length} ${meus.length === 1 ? "cliente" : "clientes"} na carteira · ${abertos.length} ${abertos.length === 1 ? "contato aberto" : "contatos abertos"} · ${arquivados.length} ${arquivados.length === 1 ? "arquivado" : "arquivados"}`;

  if (emArquivados) { crmLgRenderArquivados(arquivados); return; }
  if (!crmLg.montado) crmLgMontar();
  CRM_ETAPAS.forEach((e, i) => {
    const col = document.getElementById("crmLgCol" + i);
    const final = CRM_ETAPAS_FINAIS.includes(e.nome);
    if (final) {
      const n = arquivados.filter(x => x.n.etapa === e.nome).length;
      document.getElementById("crmLgCount" + i).textContent = n;
      col.innerHTML = `<div class="crm-col-vazia">Solte aqui para finalizar o contato. ${n ? `${n} ${n === 1 ? "arquivado" : "arquivados"}.` : "Os finalizados ficam em Arquivados."}</div>`;
      return;
    }
    const daEtapa = abertos.filter(x => x.n.etapa === e.nome);
    document.getElementById("crmLgCount" + i).textContent = daEtapa.length;
    col.innerHTML = daEtapa.map(crmLgCartao).join("");
  });
  const semEtapa = abertos.filter(x => !x.n.etapa).concat(semNeg);
  document.getElementById("crmLgBandejaCount").textContent = semEtapa.length;
  document.getElementById("crmLgBandeja").innerHTML = semEtapa.map(crmLgChip).join("");
  const podeMover = crmPodeGerirCarteira();
  crmLg.sortables.forEach(s => s.option("disabled", !podeMover));
  if (totalAbertos === 0 && meus.length) { vazio.style.display = "block"; vazio.textContent = "Nenhum contato com esses filtros."; }
}

// Soltar o cartão em outra coluna = mudar a etapa. Fechado e Declinou terminam o contato e o levam para Arquivados.
async function crmLgSoltar(evt) {
  const nova = evt.to.dataset.etapa || null;
  const antiga = evt.from.dataset.etapa || null;
  if (!nova || nova === antiga) { crmRenderLigacoes(); return; }
  const c = crmCarteiraPorId(evt.item.dataset.id);
  if (!c) { crmRenderLigacoes(); return; }
  const n = evt.item.dataset.neg ? crmNegPorId(evt.item.dataset.neg) : null;
  let ok;
  if (n) ok = await crmMoverNeg(n, c, nova, "kanban");
  else ok = !!(await crmCriarNeg(c, nova, "kanban"));
  crmRenderLigacoes();
  if (ok && CRM_ETAPAS_FINAIS.includes(nova)) toast("Contato finalizado. Está em Arquivados.");
}

/* ---------------- Arquivados ---------------- */

function crmLgRenderArquivados(arquivados) {
  const alvo = document.getElementById("crmLgArquivadosWrap");
  const linhas = arquivados.slice().sort((a, b) => (b.n.finalizadaEm || "").localeCompare(a.n.finalizadaEm || ""));
  if (!linhas.length) { alvo.innerHTML = `<div class="empty-state">Nenhum contato arquivado.</div>`; return; }
  alvo.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Cliente</th><th>Contato</th><th>Terminou em</th><th>Cotações</th><th>Obs. do cartão</th><th class="num">Ligações</th><th></th></tr></thead>
    <tbody>${linhas.map(({ c, n, ligs }) => {
      const temAberto = !!crmNegAberta(c);
      return `<tr>
        <td><button type="button" class="sv-link crm-nome" data-crmficha="${escapeAttr(c.id)}">${escapeHtml(c.cliente)}</button><div class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}</div></td>
        <td>${n.numero}º contato</td>
        <td><span class="mono">${formatDateBR(crmDiaLocal(n.finalizadaEm))}</span> <span class="status-pill ${n.etapa === "Fechado" ? "pill-normal" : "pill-esgotado"}">${escapeHtml(n.etapa || "")}</span></td>
        <td><b class="mono">${n.cotEnviadas}</b> enviadas · <b class="mono crm-cot-ok">${n.cotAprovadas}</b> aprovadas</td>
        <td>${n.obs ? escapeHtml(n.obs) : '<span class="muted">—</span>'}</td>
        <td class="num mono">${ligs.length}</td>
        <td class="crm-acoes">${crmPodeGerirCarteira() ? `<button type="button" class="btn small outline" data-crmlgnovo="${escapeAttr(c.id)}" ${temAberto ? 'disabled title="Este cliente já tem um contato aberto"' : ""}>Iniciar novo contato</button>` : ""}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

async function crmLgIniciarNovoContato(carteiraId) {
  const c = crmCarteiraPorId(carteiraId);
  if (!c || crmNegAberta(c)) return;
  const n = await crmCriarNeg(c, null, "kanban");
  if (!n) return;
  crmLg.visao = "kanban";
  crmRenderLigacoes();
  toast(`${n.numero}º contato criado para ${c.cliente}. Ele está em Sem etapa.`);
}

/* ---------------- cotações aprovadas e obs do cartão ---------------- */

function crmLgAbrirCot(negId) {
  const n = crmNegPorId(negId);
  if (!n) return;
  crmLgCotNegId = negId;
  crmLgCotValor = n.cotAprovadas;
  document.getElementById("crmCotSub").textContent = `${n.cliente} · ${n.numero}º contato`;
  document.getElementById("crmCotEnv").textContent = n.cotEnviadas;
  document.getElementById("crmCotErro").style.display = "none";
  crmLgAtualizarCot();
  document.getElementById("crmCotOverlay").classList.add("show");
}

function crmLgAtualizarCot() {
  const n = crmNegPorId(crmLgCotNegId);
  if (!n) return;
  document.getElementById("crmCotN").textContent = crmLgCotValor;
  document.getElementById("crmCotAprTxt").textContent = crmLgCotValor;
  document.getElementById("crmCotPct").textContent = n.cotEnviadas ? `${crmDesPct(crmLgCotValor, n.cotEnviadas)} das enviadas` : "nenhuma cotação enviada ainda";
  document.getElementById("crmCotNota").textContent = `Não pode passar das ${n.cotEnviadas} enviadas. Dá para corrigir depois.`;
  document.getElementById("crmCotMenos").disabled = crmLgCotValor <= 0;
  document.getElementById("crmCotMais").disabled = crmLgCotValor >= n.cotEnviadas;
}

async function crmLgSalvarCot() {
  const n = crmNegPorId(crmLgCotNegId);
  if (!n) return;
  const botao = document.getElementById("crmCotSalvar");
  botao.disabled = true;
  const erro = await crmAtualizarNeg(n, { cot_aprovadas: crmLgCotValor });
  botao.disabled = false;
  if (erro) { const el = document.getElementById("crmCotErro"); el.textContent = "Não foi possível salvar: " + erro; el.style.display = "block"; return; }
  document.getElementById("crmCotOverlay").classList.remove("show");
  crmLgCotNegId = null;
  crmRenderLigacoes();
  toast("Cotações aprovadas atualizadas.");
}

function crmLgAbrirObs(negId) {
  const n = crmNegPorId(negId);
  if (!n) return;
  crmLgObsNegId = negId;
  document.getElementById("crmObsSub").textContent = `${n.cliente} · ${n.numero}º contato`;
  document.getElementById("crmObsTexto").value = n.obs;
  document.getElementById("crmObsErro").style.display = "none";
  document.getElementById("crmObsOverlay").classList.add("show");
  document.getElementById("crmObsTexto").focus();
}

async function crmLgSalvarObs() {
  const n = crmNegPorId(crmLgObsNegId);
  if (!n) return;
  const botao = document.getElementById("crmObsSalvar");
  botao.disabled = true;
  const texto = document.getElementById("crmObsTexto").value.trim();
  const erro = await crmAtualizarNeg(n, { obs: texto || null });
  botao.disabled = false;
  if (erro) { const el = document.getElementById("crmObsErro"); el.textContent = "Não foi possível salvar: " + erro; el.style.display = "block"; return; }
  document.getElementById("crmObsOverlay").classList.remove("show");
  crmLgObsNegId = null;
  crmRenderLigacoes();
}

/* ---------------- ligação: peças que o modal de crm.js usa ---------------- */

let crmLigNeg = null;       // contato aberto do cliente escolhido (null = esta ligação cria um novo)
let crmLigCot = 0;          // cotações enviadas nesta ligação
let crmLigApr = 0;          // cotações aprovadas (só no resultado Fechou negócio)

function crmLigAtualizarCot() {
  const total = (crmLigNeg ? crmLigNeg.cotEnviadas : 0) + crmLigCot;
  if (crmLigApr > total) crmLigApr = total;
  document.getElementById("crmLigCotN").textContent = crmLigCot;
  document.getElementById("crmLigCotMenos").disabled = crmLigCot <= 0;
  document.getElementById("crmLigCotNota").textContent = crmLigNeg
    ? `Soma no cartão (hoje: ${crmLigNeg.cotEnviadas} enviadas, ${crmLigNeg.cotAprovadas} aprovadas).`
    : "Soma no cartão do contato novo.";
  document.getElementById("crmLigAprN").textContent = crmLigApr;
  document.getElementById("crmLigAprMenos").disabled = crmLigApr <= 0;
  document.getElementById("crmLigAprMais").disabled = crmLigApr >= total;
  document.getElementById("crmLigAprNota").textContent = `Não passa das ${total} enviadas (${crmLigNeg ? crmLigNeg.cotEnviadas : 0} de antes + ${crmLigCot} desta ligação).`;
}

// depois de preencher o modal para um cliente: contato aberto, aviso de contato novo, cotações e obs do cartão
function crmLigDepoisDeAbrir(c) {
  const ok = crmState.negDisponivel;
  crmLigNeg = ok ? crmNegAberta(c) : null;
  crmLigCot = 0;
  crmLigApr = crmLigNeg ? crmLigNeg.cotAprovadas : 0;
  document.getElementById("crmLigCotCampo").style.display = ok ? "" : "none";
  document.getElementById("crmLigAprCampo").style.display = "none";
  document.getElementById("crmLigObsCartaoCampo").style.display = ok ? "" : "none";
  document.getElementById("crmLigObsCartao").value = crmLigNeg ? crmLigNeg.obs : "";
  const info = document.getElementById("crmLigNegInfo");
  if (ok && !crmLigNeg) {
    const antigos = crmNegsDe(c);
    const num = antigos.reduce((m, n) => Math.max(m, n.numero), 0) + 1;
    info.textContent = antigos.length
      ? `${num}º contato. O contato anterior deste cliente já foi finalizado. Esta ligação cria um novo cartão no kanban; o antigo continua em Arquivados.`
      : "Primeiro contato. Esta ligação cria o cartão deste cliente no kanban.";
    info.style.display = "";
  } else {
    info.style.display = "none";
  }
  if (ok) crmLigAtualizarCot();
}

function crmLigAoEscolherResultado(resultado) {
  if (!crmState.negDisponivel) return;
  document.getElementById("crmLigAprCampo").style.display = resultado === "Fechou negócio" ? "" : "none";
  crmLigAtualizarCot();
}

// lista de clientes da "Nova ligação"
function crmLgRenderResCli() {
  const alvo = document.getElementById("crmLigResCli");
  alvo.style.display = "";
  const busca = document.getElementById("crmLigBuscaCli").value.trim().toLowerCase();
  const itens = crmLgMeusClientes().filter(c => crmPodeLigarPara(c) && (!busca || [c.cliente, crmCidadeUF(c.cliente)].join(" ").toLowerCase().includes(busca)))
    .sort((a, b) => a.cliente.localeCompare(b.cliente)).slice(0, 8);
  if (!itens.length) { alvo.innerHTML = `<div class="muted sv-sub">Nenhum cliente da sua carteira com esse nome.</div>`; return; }
  alvo.innerHTML = itens.map(c => {
    const aberto = crmState.negDisponivel ? crmNegAberta(c) : null;
    const ultimo = crmNegsDe(c)[0];
    const estado = !crmState.negDisponivel ? "" : aberto ? `${aberto.numero}º contato aberto${aberto.etapa ? " · " + aberto.etapa : ""}`
      : ultimo ? `contato anterior finalizado em ${formatDateBR(crmDiaLocal(ultimo.finalizadaEm || ultimo.createdAt))} · cria o ${ultimo.numero + 1}º contato` : "primeiro contato";
    return `<button type="button" class="crm-chip-cliente crm-lg-pick" data-crmligpick="${escapeAttr(c.id)}"><b>${escapeHtml(c.cliente)}</b>
      <span class="muted sv-sub">${escapeHtml(crmCidadeUF(c.cliente))}${estado ? " · " + escapeHtml(estado) : ""}</span></button>`;
  }).join("");
}

/* ---------------- ligações dos eventos ---------------- */

function crmLgInit() {
  const g = (id) => document.getElementById(id);
  if (!g("view-crm-ligacoes")) return;
  g("view-crm-ligacoes").addEventListener("click", (e) => {
    const t = e.target.closest("[data-crmligar],[data-crmficha],[data-crmcopiar],[data-crmlgcot],[data-crmlgobs],[data-crmlgnovo],[data-crmlgvisao],[data-crmlggestao]");
    if (!t) return;
    if (t.dataset.crmlgcot) crmLgAbrirCot(t.dataset.crmlgcot);
    else if (t.dataset.crmlgobs) crmLgAbrirObs(t.dataset.crmlgobs);
    else if (t.dataset.crmlgnovo) crmLgIniciarNovoContato(t.dataset.crmlgnovo);
    else if (t.dataset.crmlgvisao) { crmLg.visao = t.dataset.crmlgvisao; crmRenderLigacoes(); }
    else if (t.dataset.crmlggestao) setView("crm-desempenho");
    else crmClickDelegado(e);
  });
  g("crmLgBusca").addEventListener("input", (e) => { crmLg.busca = e.target.value; crmRenderLigacoes(); });
  g("crmLgAtrasados").addEventListener("click", () => { crmLg.atrasados = !crmLg.atrasados; crmRenderLigacoes(); });
  g("crmLgNova").addEventListener("click", () => crmAbrirLigacao(null, { escolher: true }));
  const desSeg = g("crmDesVisaoSeg");
  if (desSeg) desSeg.addEventListener("click", (e) => { if (e.target.closest("[data-crmdesvisao='kanban']")) setView("crm-ligacoes"); });

  // modal de cotações aprovadas
  g("crmCotMenos").addEventListener("click", () => { if (crmLgCotValor > 0) { crmLgCotValor--; crmLgAtualizarCot(); } });
  g("crmCotMais").addEventListener("click", () => { const n = crmNegPorId(crmLgCotNegId); if (n && crmLgCotValor < n.cotEnviadas) { crmLgCotValor++; crmLgAtualizarCot(); } });
  g("crmCotCancelar").addEventListener("click", () => g("crmCotOverlay").classList.remove("show"));
  g("crmCotSalvar").addEventListener("click", crmLgSalvarCot);
  // modal de obs do cartão
  g("crmObsCancelar").addEventListener("click", () => g("crmObsOverlay").classList.remove("show"));
  g("crmObsSalvar").addEventListener("click", crmLgSalvarObs);

  // pedaços do modal de ligação
  g("crmLigCotMenos").addEventListener("click", () => { if (crmLigCot > 0) { crmLigCot--; crmLigAtualizarCot(); } });
  g("crmLigCotMais").addEventListener("click", () => { crmLigCot++; crmLigAtualizarCot(); });
  g("crmLigAprMenos").addEventListener("click", () => { if (crmLigApr > 0) { crmLigApr--; crmLigAtualizarCot(); } });
  g("crmLigAprMais").addEventListener("click", () => { crmLigApr++; crmLigAtualizarCot(); });
  g("crmLigBuscaCli").addEventListener("input", crmLgRenderResCli);
  g("crmLigResCli").addEventListener("click", (e) => {
    const b = e.target.closest("[data-crmligpick]");
    if (b) crmLigEscolherCliente(b.dataset.crmligpick);
  });
}

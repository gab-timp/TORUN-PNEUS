/* Seletores dos dashboards (Varejo, Sem Venda e CRM): botão do mês com painel de meses e botão
   "Dashboards" com interruptores. O <select> original continua na tela, escondido, e é ele que manda:
   o painel só lê as opções dele e dispara o "change" quando alguém escolhe. */

const SD_ICONE_CAL = '<svg class="sd-ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12.5" rx="2.5"/><path d="M3 8.5h14M7 3v3M13 3v3"/></svg>';
const SD_ICONE_GRADE = '<svg class="sd-ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>';
const SD_ICONE_SETA = '<svg class="sd-chev" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>';
const SD_MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const sdFechadores = [];
function sdFecharTodos(exceto) { sdFechadores.forEach(f => f(exceto)); }
document.addEventListener("click", (e) => { if (!e.target.closest(".sd-wrap")) sdFecharTodos(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") sdFecharTodos(); });

function sdEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sdRegistrarPopover(wrap, trigger, painel) {
  const fechar = (exceto) => {
    if (exceto === wrap) return;
    painel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  sdFechadores.push(fechar);
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const abrir = painel.hidden;
    sdFecharTodos();
    if (abrir) {
      painel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      wrap.dispatchEvent(new CustomEvent("sd-abriu"));
    }
  });
}

/* ---------------- período (um ou vários meses) ---------------- */

const sdMesAdd = (k, n) => {
  const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};
const sdMesLabel = (k) => `${SD_MESES_ABREV[Number(k.slice(5, 7)) - 1]} de ${k.slice(0, 4)}`;
const sdMesCurto = (k) => `${SD_MESES_ABREV[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`;
const sdContiguos = (l) => l.every((k, i) => i === 0 || sdMesAdd(l[i - 1], 1) === k);

/* Texto do período: "Nov de 2026", "Set/26 a Nov/26" (meses seguidos) ou "3 meses". */
function sdTextoMeses(l) {
  if (!l.length) return "";
  if (l.length === 1) return sdMesLabel(l[0]);
  return sdContiguos(l) ? `${sdMesCurto(l[0])} a ${sdMesCurto(l[l.length - 1])}` : `${l.length} meses`;
}

/* Monta o botão Período dentro de `mount`. opcoes:
   disponiveis(): meses ("AAAA-MM") que podem ser escolhidos; padrao(disponiveis): meses marcados de início;
   aoMudar(): refaz a tela depois de aplicar.
   Devolve { meses(), texto(), atualizar(), anteriores() }:
   meses() = meses escolhidos em ordem (sempre ao menos um, só entre os disponíveis);
   anteriores() = o período imediatamente anterior, com o mesmo número de meses (cada mês recuado pelo tamanho do período). */
function sdCriarSeletorPeriodo(mount, opcoes) {
  if (!mount) return { meses: () => [], texto: () => "", atualizar() {}, anteriores: () => [] };
  const { disponiveis, aoMudar } = opcoes;
  const mesAtualReal = () => new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
  const padrao = opcoes.padrao || ((disp) => {
    const ate = disp.filter(k => k <= mesAtualReal());
    const k = ate.length ? ate[ate.length - 1] : disp[disp.length - 1];
    return k ? [k] : [];
  });
  let escolhidos = null;   // aplicado
  let rascunho = null;     // marcado no painel, ainda sem aplicar
  let anoVisto = null;

  mount.classList.add("sd-wrap");
  mount.innerHTML = `
    <button type="button" class="sd-trig" aria-haspopup="dialog" aria-expanded="false">${SD_ICONE_CAL}<span class="sd-lbl">Período</span><span class="sd-val"></span><span class="sd-badge"></span>${SD_ICONE_SETA}</button>
    <div class="sd-painel sd-mes" hidden role="dialog" aria-label="Escolher meses"></div>`;
  const trigger = mount.querySelector(".sd-trig"), painel = mount.querySelector(".sd-painel");

  function meses() {
    const disp = disponiveis();
    let l = (escolhidos || []).filter(k => disp.includes(k));
    if (!l.length) l = padrao(disp).filter(k => disp.includes(k));
    escolhidos = l.slice().sort();
    return escolhidos;
  }

  function atalhos(disp) {
    const hoje = mesAtualReal();
    const ultimos = (n) => Array.from({ length: n }, (_, i) => sdMesAdd(hoje, -(n - 1 - i))).filter(k => disp.includes(k));
    const esteAno = disp.filter(k => k.slice(0, 4) === hoje.slice(0, 4));
    return [
      { id: "mes", t: "Mês atual", l: disp.includes(hoje) ? [hoje] : [] },
      { id: "3", t: "Últimos 3 meses", l: ultimos(3) },
      { id: "6", t: "Últimos 6 meses", l: ultimos(6) },
      { id: "ano", t: "Este ano", l: esteAno },
      { id: "tudo", t: "Tudo", l: disp.slice() }
    ].filter(a => a.l.length);
  }

  function rotulo() {
    const l = meses();
    trigger.querySelector(".sd-val").textContent = sdTextoMeses(l) || "Escolher";
    const b = trigger.querySelector(".sd-badge");
    b.textContent = l.length;
    b.hidden = l.length < 2;
    trigger.title = l.map(sdMesLabel).join(", ");
  }

  function desenhar() {
    const disp = disponiveis();
    const marcados = new Set(rascunho || meses());
    const anos = [...new Set(disp.map(k => k.slice(0, 4)))].sort();
    if (anoVisto === null || (!anos.includes(anoVisto) && anos.length)) anoVisto = anos[anos.length - 1] || String(new Date().getFullYear());
    const i = anos.indexOf(anoVisto);
    const atual = [...marcados].sort().join();
    const grade = SD_MESES_ABREV.map((nome, k) => {
      const chave = `${anoVisto}-${String(k + 1).padStart(2, "0")}`;
      return `<button type="button" class="sd-m" data-sd-mes="${chave}" aria-pressed="${marcados.has(chave)}" ${disp.includes(chave) ? "" : "disabled"}>${nome}</button>`;
    }).join("");
    painel.innerHTML = `
      <div class="sd-atalhos">${atalhos(disp).map(a => `<button type="button" class="sd-at${a.l.slice().sort().join() === atual ? " on" : ""}" data-sd-atalho="${a.id}">${a.t}</button>`).join("")}</div>
      <div class="sd-ano">
        <button type="button" class="sd-nav" data-sd-ano="-1" aria-label="Ano anterior" ${i > 0 ? "" : "disabled"}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L5 7l4 4"/></svg></button>
        <div class="sd-ano-meio"><b>${anoVisto}</b><button type="button" class="sd-link" data-sd-anotodo="1">Ano todo</button></div>
        <button type="button" class="sd-nav" data-sd-ano="1" aria-label="Próximo ano" ${i >= 0 && i < anos.length - 1 ? "" : "disabled"}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l4 4-4 4"/></svg></button>
      </div>
      <div class="sd-meses">${grade}</div>
      <div class="sd-dica">Clique nos meses para ligar e desligar. Dá para misturar anos. Sempre fica ao menos um marcado.</div>
      <div class="sd-rodape"><span>${marcados.size} ${marcados.size === 1 ? "mês marcado" : "meses marcados"}</span><button type="button" class="sd-aplicar" data-sd-aplicar="1">Aplicar</button></div>`;
  }

  function aplicar(l) {
    const antes = meses().join();
    escolhidos = l.slice().sort();
    rascunho = null;
    rotulo();
    if (meses().join() !== antes) aoMudar();
  }

  // fechar com o rascunho diferente do aplicado (clique fora, Esc, outro botão) também aplica: ninguém perde a escolha
  const fechar = (exceto) => {
    if (exceto === mount || painel.hidden) return;
    painel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (rascunho) aplicar(rascunho);
  };
  sdFechadores.push(fechar);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const abrir = painel.hidden;
    sdFecharTodos();
    if (abrir) {
      rascunho = meses().slice();
      const ult = rascunho[rascunho.length - 1];
      if (ult) anoVisto = ult.slice(0, 4);
      desenhar();
      painel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  painel.addEventListener("click", (e) => {
    e.stopPropagation();
    const disp = disponiveis();
    const nav = e.target.closest("[data-sd-ano]");
    if (nav && !nav.disabled) {
      const anos = [...new Set(disp.map(k => k.slice(0, 4)))].sort();
      const j = anos.indexOf(anoVisto) + Number(nav.dataset.sdAno);
      if (anos[j]) { anoVisto = anos[j]; desenhar(); }
      return;
    }
    const at = e.target.closest("[data-sd-atalho]");
    if (at) {
      const a = atalhos(disp).find(x => x.id === at.dataset.sdAtalho);
      if (a) { painel.hidden = true; trigger.setAttribute("aria-expanded", "false"); aplicar(a.l); }
      return;
    }
    if (e.target.closest("[data-sd-anotodo]")) {
      const set = new Set(rascunho);
      disp.filter(k => k.slice(0, 4) === anoVisto).forEach(k => set.add(k));
      rascunho = [...set].sort();
      desenhar();
      return;
    }
    const m = e.target.closest("[data-sd-mes]");
    if (m && !m.disabled) {
      const set = new Set(rascunho);
      if (set.has(m.dataset.sdMes)) { if (set.size > 1) set.delete(m.dataset.sdMes); } else set.add(m.dataset.sdMes);
      rascunho = [...set].sort();
      desenhar();
      return;
    }
    if (e.target.closest("[data-sd-aplicar]")) {
      painel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      aplicar(rascunho || meses());
    }
  });

  rotulo();
  return {
    meses,
    texto: () => sdTextoMeses(meses()),
    // a tela chama no começo de cada desenho: as opções mudam quando entra venda nova
    atualizar() { rotulo(); },
    anteriores() { const l = meses(); return l.map(k => sdMesAdd(k, -l.length)); }
  };
}

/* ---------------- dashboards ---------------- */

/* defs: [{ key, label }]; chave: onde guarda no navegador ({ key: true/false }); aoMudar: refaz a tela.
   Devolve { visivel(key) }. */
function sdCriarSeletorDashboards(mount, { defs, chave, aoMudar }) {
  if (!mount) return { visivel: () => true };
  const ler = () => { try { return JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { return {}; } };
  const gravar = (v) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } };
  let memoria = ler();
  const visivel = (key) => memoria[key] !== false;

  mount.classList.add("sd-wrap");
  mount.innerHTML = `
    <button type="button" class="sd-trig" aria-haspopup="dialog" aria-expanded="false">${SD_ICONE_GRADE}<span>Dashboards</span><span class="sd-badge"></span>${SD_ICONE_SETA}</button>
    <div class="sd-painel sd-dashs" hidden role="dialog" aria-label="Escolher dashboards">
      <div class="sd-ph"><span class="sd-cont"></span><div class="sd-links"><button type="button" class="sd-link" data-sd-tudo="1">Todos</button><button type="button" class="sd-link" data-sd-tudo="0">Nenhum</button></div></div>
      <div class="sd-lista"></div>
    </div>`;
  const trigger = mount.querySelector(".sd-trig"), painel = mount.querySelector(".sd-painel"), lista = mount.querySelector(".sd-lista");
  sdRegistrarPopover(mount, trigger, painel);

  function desenhar() {
    const q = defs.filter(d => visivel(d.key)).length;
    lista.innerHTML = defs.map(d => `
      <label class="sd-it"><span>${sdEsc(d.label)}</span><span class="sd-sw"><input type="checkbox" data-sd-key="${sdEsc(d.key)}" ${visivel(d.key) ? "checked" : ""}><i></i></span></label>`).join("");
    mount.querySelector(".sd-badge").textContent = `${q} de ${defs.length}`;
    mount.querySelector(".sd-cont").textContent = `${q} de ${defs.length} visíveis`;
  }
  painel.addEventListener("click", (e) => e.stopPropagation());
  lista.addEventListener("change", (e) => {
    const k = e.target.dataset.sdKey;
    if (!k) return;
    memoria = { ...ler(), [k]: e.target.checked };
    gravar(memoria);
    desenhar();
    aoMudar();
  });
  painel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sd-tudo]");
    if (!b) return;
    memoria = {};
    defs.forEach(d => { memoria[d.key] = b.dataset.sdTudo === "1"; });
    gravar(memoria);
    desenhar();
    aoMudar();
  });
  desenhar();
  return { visivel: (key) => { memoria = ler(); return visivel(key); } };
}

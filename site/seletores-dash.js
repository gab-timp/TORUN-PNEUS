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

/* ---------------- mês ---------------- */

function sdMelhorarSeletorMes(sel) {
  if (!sel || sel.dataset.sdPronto) return;
  sel.dataset.sdPronto = "1";
  const wrap = document.createElement("div");
  wrap.className = "sd-wrap";
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add("sd-oculto");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "sd-trig";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `${SD_ICONE_CAL}<span class="sd-lbl">Mês</span><span class="sd-val"></span>${SD_ICONE_SETA}`;
  const painel = document.createElement("div");
  painel.className = "sd-painel sd-mes";
  painel.hidden = true;
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-label", "Escolher mês");
  wrap.append(trigger, painel);
  sdRegistrarPopover(wrap, trigger, painel);

  let anoVisto = null;

  const opcoes = () => Array.from(sel.options).map(o => ({ valor: o.value, texto: o.textContent }));
  const ehMes = (v) => /^\d{4}-\d{2}$/.test(v);

  const rotuloAtual = () => {
    const o = sel.options[sel.selectedIndex];
    trigger.querySelector(".sd-val").textContent = o ? o.textContent : "Escolher";
  };

  function desenhar() {
    const ops = opcoes();
    const meses = new Set(ops.filter(o => ehMes(o.valor)).map(o => o.valor));
    const anos = [...new Set([...meses].map(m => m.slice(0, 4)))].sort();
    const especial = ops.find(o => !ehMes(o.valor) && o.valor !== "");
    if (anoVisto === null || (!anos.includes(anoVisto) && anos.length)) {
      anoVisto = ehMes(sel.value) ? sel.value.slice(0, 4) : (anos[anos.length - 1] || String(new Date().getFullYear()));
    }
    const i = anos.indexOf(anoVisto);
    const temAnterior = i > 0, temProximo = i >= 0 && i < anos.length - 1;
    const grade = SD_MESES_ABREV.map((nome, k) => {
      const chave = `${anoVisto}-${String(k + 1).padStart(2, "0")}`;
      const existe = meses.has(chave);
      return `<button type="button" class="sd-m" data-sd-mes="${chave}" aria-pressed="${sel.value === chave}" ${existe ? "" : "disabled"}>${nome}</button>`;
    }).join("");
    painel.innerHTML = `
      ${especial ? `<button type="button" class="sd-todos" data-sd-mes="${sdEsc(especial.valor)}" aria-pressed="${sel.value === especial.valor}">${sdEsc(especial.texto)}</button>` : ""}
      <div class="sd-ano">
        <button type="button" class="sd-nav" data-sd-ano="-1" aria-label="Ano anterior" ${temAnterior ? "" : "disabled"}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L5 7l4 4"/></svg></button>
        <b>${anoVisto}</b>
        <button type="button" class="sd-nav" data-sd-ano="1" aria-label="Próximo ano" ${temProximo ? "" : "disabled"}><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l4 4-4 4"/></svg></button>
      </div>
      <div class="sd-meses">${grade}</div>`;
    rotuloAtual();
  }

  painel.addEventListener("click", (e) => {
    e.stopPropagation();
    const nav = e.target.closest("[data-sd-ano]");
    if (nav && !nav.disabled) {
      const anos = [...new Set(Array.from(sel.options).map(o => o.value).filter(ehMes).map(m => m.slice(0, 4)))].sort();
      const j = anos.indexOf(anoVisto) + Number(nav.dataset.sdAno);
      if (anos[j]) { anoVisto = anos[j]; desenhar(); }
      return;
    }
    const b = e.target.closest("[data-sd-mes]");
    if (!b || b.disabled) return;
    sel.value = b.dataset.sdMes;
    if (ehMes(sel.value)) anoVisto = sel.value.slice(0, 4);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    desenhar();
    sdFecharTodos();
  });

  wrap.addEventListener("sd-abriu", () => { if (ehMes(sel.value)) anoVisto = sel.value.slice(0, 4); desenhar(); });
  // o sistema recria as opções (e muda o valor) a cada renderização: o botão acompanha
  new MutationObserver(() => { if (painel.hidden) { anoVisto = null; } desenhar(); }).observe(sel, { childList: true });
  sel.addEventListener("change", rotuloAtual);
  desenhar();
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

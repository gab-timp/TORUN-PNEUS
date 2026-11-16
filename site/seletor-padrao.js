/* Seletor padrão do sistema.
   Todo <select> da página vira o mesmo campo de busca do produto (digita parte do texto e escolhe na lista), inclusive
   os que o sistema cria depois. O <select> continua no lugar, escondido, e guarda o valor: .value, .selectedIndex,
   "change", disabled, reset de formulário e as opções seguem como eram para o resto do código.
   Não entram: select múltiplo ou com size, os que já têm campo próprio (produto: .item-produto) e os marcados com
   data-sem-combo. */
(function () {
  "use strict";

  const LIMITE = 80;
  const nativoValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const nativoIndice = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function destacar(texto, termo) {
    if (!termo) return esc(texto);
    const i = texto.toLowerCase().indexOf(termo.toLowerCase());
    if (i === -1) return esc(texto);
    return esc(texto.slice(0, i)) + "<mark>" + esc(texto.slice(i, i + termo.length)) + "</mark>" + esc(texto.slice(i + termo.length));
  }

  function elegivel(sel) {
    return sel && sel.tagName === "SELECT" && !sel.dataset.combo && !sel.dataset.semCombo && !sel.multiple && !(sel.size > 1)
      && !sel.classList.contains("item-produto") && !sel.closest("template");
  }

  function aprimorar(select, placeholderFixo) {
    if (!elegivel(select) || !select.parentNode) return;
    select.dataset.combo = "1";
    const obrigatorio = select.required;
    const wrap = document.createElement("div");
    wrap.className = "produto-combo combo-seletor";
    const busca = document.createElement("input");
    busca.type = "text";
    busca.className = "item-produto-busca";
    busca.autocomplete = "off";
    busca.setAttribute("role", "combobox");
    busca.setAttribute("aria-expanded", "false");
    if (select.title) busca.title = select.title;
    const rotuloAria = select.getAttribute("aria-label");
    if (rotuloAria) busca.setAttribute("aria-label", rotuloAria);
    const lista = document.createElement("div");
    lista.className = "produto-combo-lista";
    lista.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    wrap.append(busca, select, lista);
    select.classList.add("combo-oculto"); // escondido por classe: o style.display do select fica livre para o sistema usar
    select.required = false; // quem exige o preenchimento é o campo de busca
    busca.required = obrigatorio;
    if (select.id) wrap.dataset.paraSelect = select.id;

    let foco = -1;
    let filtrando = false; // só filtra a lista depois que a pessoa digita; ao abrir, mostra todas as opções (o texto do campo é o valor atual, não uma busca)

    // texto da opção em branco ("Selecione…", "Todos os estados"): vira o texto de fundo do campo
    const opcaoVazia = () => Array.from(select.options).find(o => o.value === "");
    const sincronizar = () => {
      const o = select.selectedOptions[0];
      busca.value = o && o.value !== "" ? o.textContent : "";
      const vazia = opcaoVazia();
      busca.placeholder = placeholderFixo || (vazia && vazia.textContent.trim()) || "Selecione…";
      busca.disabled = select.disabled;
      wrap.classList.toggle("desativado", select.disabled);
    };

    // o resto do código muda o seletor por .value e .selectedIndex: o campo acompanha
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return nativoValue.get.call(this); },
      set(v) { nativoValue.set.call(this, v); sincronizar(); }
    });
    Object.defineProperty(select, "selectedIndex", {
      configurable: true,
      get() { return nativoIndice.get.call(this); },
      set(v) { nativoIndice.set.call(this, v); sincronizar(); }
    });
    // opções novas, disabled e esconder/mostrar o seletor (style.display/hidden) refletem no campo inteiro
    const espelhar = () => { wrap.style.display = (select.hidden || select.style.display === "none") ? "none" : ""; };
    new MutationObserver(() => { espelhar(); sincronizar(); })
      .observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "style", "hidden", "label"] });
    espelhar();
    if (select.form) select.form.addEventListener("reset", () => setTimeout(sincronizar, 0));
    sincronizar();

    function itens() {
      const termo = filtrando ? busca.value.trim().toLowerCase() : "";
      // a opção em branco entra como "limpar" nos filtros; em campo obrigatório ou "Selecione…" não
      let todas = Array.from(select.options).filter(o => !o.hidden);
      todas = todas.filter(o => o.value !== "" || (!obrigatorio && !/^selecione/i.test(o.textContent.trim()) && o.textContent.trim() !== ""));
      const filtradas = termo ? todas.filter(o => o.value === "" ? false : o.textContent.toLowerCase().includes(termo)) : todas;
      return filtradas;
    }
    function desenhar() {
      const achados = itens();
      const termo = filtrando ? busca.value.trim() : "";
      lista.innerHTML = !achados.length ? '<div class="produto-combo-empty">Nada encontrado.</div>'
        : achados.slice(0, LIMITE).map((o, i) =>
          '<div class="produto-combo-item' + (o.selected && o.value !== "" ? " atual" : "") + '" role="option" data-i="' + i + '"><span class="med">' + destacar(o.textContent, o.value === "" ? "" : termo) + '</span></div>').join("")
          + (achados.length > LIMITE ? '<div class="produto-combo-empty">+' + (achados.length - LIMITE) + ' outros — digite mais para refinar</div>' : "");
      lista._achados = achados.slice(0, LIMITE);
      foco = -1;
      lista.classList.add("show");
      busca.setAttribute("aria-expanded", "true");
      const atual = lista.querySelector(".atual");
      if (atual && !termo) atual.scrollIntoView({ block: "nearest" });
    }
    function fechar() {
      filtrando = false;
      lista.classList.remove("show");
      busca.setAttribute("aria-expanded", "false");
      if (nativoValue.get.call(select) === "" ) busca.value = "";
      else sincronizar();
    }
    function escolher(opcao) {
      const mudou = nativoValue.get.call(select) !== opcao.value;
      select.value = opcao.value;
      lista.classList.remove("show");
      busca.setAttribute("aria-expanded", "false");
      if (mudou) select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function moverFoco(d) {
      const els = Array.from(lista.querySelectorAll(".produto-combo-item"));
      if (!els.length) return;
      foco = (foco + d + els.length) % els.length;
      els.forEach((e, i) => e.classList.toggle("foco", i === foco));
      els[foco].scrollIntoView({ block: "nearest" });
    }

    busca.addEventListener("focus", () => { filtrando = false; busca.select(); busca._abriuAgora = true; desenhar(); setTimeout(() => { busca._abriuAgora = false; }, 0); });
    busca.addEventListener("click", () => { if (!lista.classList.contains("show")) { filtrando = false; desenhar(); } });
    busca.addEventListener("input", () => {
      filtrando = true;
      desenhar();
    });
    busca.addEventListener("blur", () => setTimeout(fechar, 150));
    busca.addEventListener("keydown", e => {
      if (e.key === "Escape") { fechar(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (!lista.classList.contains("show")) { filtrando = false; desenhar(); } moverFoco(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moverFoco(-1); }
      else if (e.key === "Enter" && lista.classList.contains("show")) {
        const els = lista.querySelectorAll(".produto-combo-item");
        const alvo = foco >= 0 ? foco : (els.length === 1 ? 0 : -1);
        if (alvo >= 0 && lista._achados[alvo]) { e.preventDefault(); escolher(lista._achados[alvo]); }
      }
    });
    lista.addEventListener("mousedown", e => {
      const item = e.target.closest(".produto-combo-item");
      if (!item) return;
      e.preventDefault();
      const op = lista._achados[Number(item.dataset.i)];
      if (op) escolher(op);
    });
  }

  function varrer(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll("select") : []).forEach(s => aprimorar(s));
    if (raiz.tagName === "SELECT") aprimorar(raiz);
  }

  window.selectComBuscaAprimorar = aprimorar; // app.js usa para pôr um texto de fundo próprio

  function iniciar() {
    varrer(document);
    new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) varrer(n); })))
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();

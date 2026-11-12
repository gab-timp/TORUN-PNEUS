/* Aviso de versão nova do sistema.
   Aba aberta há muito tempo continua rodando o código antigo. De tempos em tempos (e quando a pessoa volta pra aba) isto
   busca a página atual no servidor e compara as versões dos arquivos (?v=N) com as que esta aba carregou. Se mudou,
   mostra uma faixa com o botão "Atualizar". Nunca recarrega sozinho: a pessoa pode estar no meio de uma venda.
   Só lê um arquivo público; não mexe em banco nem em login. Falha de rede é ignorada. */
(function () {
  "use strict";
  const INTERVALO_MS = 10 * 60 * 1000;       // checagem periódica
  const MIN_ENTRE_CHECAGENS_MS = 2 * 60 * 1000; // volta pra aba não checa mais de uma vez a cada 2 min
  const LIMITE_RECARGAS = 3;                  // recargas pedidas por este aviso, por sessão do navegador
  const CHAVE = "atualizacao_recargas";

  let ultimaChecagem = 0;
  let faixa = null;
  let dispensadoAte = 0;

  const lerRecargas = () => { try { return parseInt(sessionStorage.getItem(CHAVE) || "0", 10) || 0; } catch (e) { return 0; } };
  const gravarRecargas = (n) => { try { sessionStorage.setItem(CHAVE, String(n)); } catch (e) { /* sem storage: segue */ } };

  // arquivos locais com versão: {"app.js": "302", "styles.css": "184", ...}
  function versoes(doc) {
    const mapa = {};
    doc.querySelectorAll("script[src], link[rel='stylesheet'][href]").forEach((el) => {
      const url = el.getAttribute("src") || el.getAttribute("href") || "";
      if (/^(https?:)?\/\//i.test(url)) return;
      const m = url.match(/^([^?#]+)\?v=(\d+)/);
      if (m) mapa[m[1]] = m[2];
    });
    return mapa;
  }

  function desatualizado(atual, servidor) {
    return Object.keys(servidor).some((arq) => atual[arq] !== servidor[arq]);
  }

  function mostrarFaixa() {
    if (faixa || Date.now() < dispensadoAte) return;
    faixa = document.createElement("div");
    faixa.className = "aviso-atualizacao";
    faixa.setAttribute("role", "status");
    const texto = document.createElement("span");
    texto.textContent = "Há uma versão nova do sistema. Termine o que está fazendo e atualize.";
    const ok = document.createElement("button");
    ok.type = "button"; ok.className = "btn primary small"; ok.textContent = "Atualizar";
    ok.addEventListener("click", () => { gravarRecargas(lerRecargas() + 1); location.reload(); });
    const depois = document.createElement("button");
    depois.type = "button"; depois.className = "btn outline small"; depois.textContent = "Depois";
    depois.addEventListener("click", () => {
      dispensadoAte = Date.now() + 30 * 60 * 1000;
      faixa.remove(); faixa = null;
    });
    faixa.append(texto, ok, depois);
    document.body.appendChild(faixa);
  }

  async function checar() {
    if (lerRecargas() >= LIMITE_RECARGAS) return; // já recarregou várias vezes e continua diferente: não insiste
    ultimaChecagem = Date.now();
    try {
      const url = location.origin + location.pathname;
      const resp = await fetch(url, { cache: "no-store", credentials: "omit" });
      if (!resp.ok) return;
      const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
      const servidor = versoes(doc);
      if (!Object.keys(servidor).length) return; // não parece a nossa página: ignora
      if (desatualizado(versoes(document), servidor)) mostrarFaixa();
    } catch (e) { /* sem internet ou servidor lento: tenta na próxima */ }
  }

  setInterval(() => { if (document.visibilityState === "visible") checar(); }, INTERVALO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - ultimaChecagem > MIN_ENTRE_CHECAGENS_MS) checar();
  });
})();

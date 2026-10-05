/* ---------------- Sem Venda: escolha do sistema e estrutura (etapa 1) ---------------- */
/* Carrega antes do app.js; usa currentUser*, setView, primeiraViewPermitida e
   currentUserRoleLabel do app.js, que só são resolvidos na hora da chamada. */

const SISTEMA_KEY = "torun_sistema_atual_v1";

function temAcessoSemVenda() {
  return currentUserIsAdmin || currentUserPodeAcessarSemVenda;
}

function sistemaLembrado() {
  try { return sessionStorage.getItem(SISTEMA_KEY); } catch (e) { return null; }
}

function lembrarSistema(sistema) {
  try { sessionStorage.setItem(SISTEMA_KEY, sistema); } catch (e) { /* sem sessionStorage: pergunta de novo no próximo carregamento */ }
}

function esquecerSistema() {
  try { sessionStorage.removeItem(SISTEMA_KEY); } catch (e) { /* idem */ }
}

function aplicarSistema(sistema) {
  const semVenda = sistema === "semvenda";
  lembrarSistema(sistema);
  document.body.classList.toggle("sistema-semvenda", semVenda);
  document.getElementById("navVarejo").style.display = semVenda ? "none" : "";
  document.getElementById("navSemVenda").style.display = semVenda ? "" : "none";
  document.getElementById("brandSub").textContent = semVenda ? "Sem Venda" : "Controle de Estoque";
  document.getElementById("btnTrocarSistema").style.display = temAcessoSemVenda() ? "" : "none";
  document.title = semVenda ? "TORUN PNEUS · Sem Venda" : "TORUN PNEUS · Painel de Controle";
  setView(semVenda ? "sv-dashboard" : primeiraViewPermitida());
}

function mostrarEscolhaSistema() {
  document.getElementById("appShell").style.display = "none";
  document.title = "TORUN PNEUS · Painel de Controle";
  document.getElementById("sistemaUsuario").textContent =
    `${currentUserNome || (currentUser && currentUser.email) || ""} · ${currentUserRoleLabel()}`;
  document.getElementById("sistemaScreen").style.display = "flex";
}

function escolherSistema(sistema) {
  document.getElementById("sistemaScreen").style.display = "none";
  document.getElementById("appShell").style.display = "flex";
  aplicarSistema(sistema);
}

// Quem não tem acesso ao Sem Venda entra direto no varejo, como sempre foi.
function entrarNoSistema() {
  const shell = document.getElementById("appShell");
  if (!temAcessoSemVenda()) {
    shell.style.display = "flex";
    return;
  }
  const lembrado = sistemaLembrado();
  if (lembrado === "varejo" || lembrado === "semvenda") {
    shell.style.display = "flex";
    aplicarSistema(lembrado);
    return;
  }
  mostrarEscolhaSistema();
}

function initSistemas() {
  document.querySelectorAll("[data-sistema]").forEach(btn => {
    btn.addEventListener("click", () => escolherSistema(btn.dataset.sistema));
  });
  document.getElementById("btnTrocarSistema").addEventListener("click", mostrarEscolhaSistema);
}

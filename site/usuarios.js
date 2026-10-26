/* ---------------- Administração: usuários e acessos ---------------- */
/* Matriz "quem acessa o quê", janela "Novo usuário" (cria o login pela função admin-usuarios do Supabase, que fica
   no servidor e confere se quem chamou é administrador), liberação de logins que ainda não têm acesso e a página
   "Acesso de uma pessoa". Carrega antes do app.js; usa os helpers dele (sb, toast, confirmModal, escapeHtml,
   escapeAttr, computeUserInitials, setView, ADMIN_VIEW_DEFS, currentUser, currentUserIsAdmin), que só são
   resolvidos na hora da chamada. Mockup aprovado: https://claude.ai/artifact/7NzQ2965jvsAbCziz9FjEv */

const USR_FUNCAO = "admin-usuarios";
const USR_TELAS_FINANCEIRO = ["faturamento", "limitecredito", "contasreceber", "comissoes", "historicocredito", "fluxocaixa"];
const USR_PAPEL_VAREJO = { editor: "Editor", viewer: "Somente leitura", representante: "Representante (portal)" };
const USR_PAPEL_CRM = { executivo: "Executivo", financeiro: "Financeiro", gestao: "Gestão" };
const USR_SISTEMA = { atacado: "Atacado", encomenda: "Encomenda" };

const USR_BASE = {
  role: "editor", is_admin: false, pode_autorizar_gerencia: false, pode_exportar_backup: false, pode_acessar_sem_venda: false,
  pode_acessar_portal_representante: false, crm_papel: null, crm_sistema: null, visible_views: null
};

// Perfis prontos da janela "Novo usuário". Executivo entra no Torun só com o Dashboard (visible_views = ["dashboard"]).
const USR_PERFIS = [
  { id: "exec-atacado", nome: "Executivo de Atacado", desc: "Vê só a própria carteira do Atacado e registra as ligações dela.",
    valores: { ...USR_BASE, crm_papel: "executivo", crm_sistema: "atacado", visible_views: ["dashboard"] } },
  { id: "exec-encomenda", nome: "Executivo de Encomenda", desc: "Vê só a própria carteira da Encomenda e registra as ligações dela.",
    valores: { ...USR_BASE, crm_papel: "executivo", crm_sistema: "encomenda", visible_views: ["dashboard"] } },
  { id: "financeiro", nome: "Financeiro", desc: "Telas do Financeiro no Torun e leitura das carteiras do Atacado e da Encomenda.",
    valores: { ...USR_BASE, crm_papel: "financeiro", visible_views: USR_TELAS_FINANCEIRO.slice() } },
  { id: "gestao", nome: "Gestão / Direção", desc: "Lê tudo no Atacado e na Encomenda e redistribui as carteiras.",
    valores: { ...USR_BASE, crm_papel: "gestao" } },
  { id: "varejo", nome: "Torun (Varejo)", desc: "Painel do dia a dia, como Editor, com todas as telas.",
    valores: { ...USR_BASE } },
  { id: "leitura", nome: "Somente leitura", desc: "Vê o Torun, mas não grava nada.",
    valores: { ...USR_BASE, role: "viewer" } }
];

const usrState = { lista: [], pendentes: [], aviso: "", carregou: false, carregando: false };
const usrUi = { acessoId: null, form: null, original: null, avancadoAberto: false, novoModo: "criar", novoPendente: null, novoPerfil: "exec-atacado", novoSalvando: false, salvando: false };

/* ---------------- leitura de um acesso ---------------- */

function usrColunas() {
  return usrState.lista.length ? new Set(Object.keys(usrState.lista[0])) : new Set();
}

// os campos que a tela administra, a partir de uma linha de user_roles (ou de um perfil pronto)
function usrValoresDe(row) {
  const v = { ...USR_BASE };
  Object.keys(USR_BASE).forEach(k => { if (row[k] !== undefined && row[k] !== null) v[k] = row[k]; });
  v.crm_papel = row.crm_papel || null;
  v.crm_sistema = v.crm_papel === "executivo" ? (row.crm_sistema || null) : null;
  v.visible_views = Array.isArray(row.visible_views) ? row.visible_views.slice() : null;
  return v;
}

function usrTextoTelas(vv) {
  if (vv === null || vv === undefined) return "todas as telas";
  if (vv.length === 0 || (vv.length === 1 && vv[0] === "dashboard")) return "só o Dashboard";
  return `${vv.length} ${vv.length === 1 ? "tela" : "telas"}`;
}

// o que a pessoa enxerga em cada sistema. Administrador sem papel no CRM conta como gestão (mesma regra do banco).
function usrAcessosDe(v) {
  const papel = v.crm_papel || (v.is_admin ? "gestao" : null);
  const nosDois = papel && papel !== "executivo";
  return {
    varejo: { papel: v.role, telas: usrTextoTelas(v.visible_views) },
    semvenda: !!v.is_admin || !!v.pode_acessar_sem_venda,
    atacado: papel && (nosDois || v.crm_sistema === "atacado") ? papel : null,
    encomenda: papel && (nosDois || v.crm_sistema === "encomenda") ? papel : null
  };
}

function usrTextoCrm(papel, sistema) {
  if (!papel) return "sem acesso";
  return papel === "executivo" ? `Executivo (${USR_SISTEMA[sistema] || "?"})` : (papel === "gestao" ? "Gestão / Direção" : "Financeiro");
}

function usrSelo(classe, texto) {
  return `<span class="usr-selo ${classe}">${escapeHtml(texto)}</span>`;
}

function usrSeloCrm(papel) {
  if (!papel) return `<span class="muted">—</span>`;
  return usrSelo({ executivo: "exe", financeiro: "fin", gestao: "ges" }[papel], USR_PAPEL_CRM[papel]);
}

/* ---------------- carga e chamada da função ---------------- */

// Chama a função do Supabase. Devolve { dados } ou { erro, naoPublicada }.
async function usrChamarFuncao(corpo) {
  let resposta;
  try { resposta = await sb.functions.invoke(USR_FUNCAO, { body: corpo }); } catch (e) { resposta = { data: null, error: e }; }
  const { data, error } = resposta;
  if (!error) return data && data.erro ? { erro: data.erro } : { dados: data };
  let status = 0, mensagem = "";
  try {
    if (error.context && typeof error.context.json === "function") {
      status = error.context.status;
      const j = await error.context.json();
      if (j && j.erro) mensagem = j.erro;
    }
  } catch (e) { /* corpo que não é JSON: cai nas mensagens abaixo */ }
  if (mensagem) return { erro: mensagem };
  if (status === 404 || error.name === "FunctionsFetchError") {
    return { erro: "A função admin-usuarios ainda não foi publicada no Supabase (passo a passo em supabase/functions/admin-usuarios/LEIAME.md).", naoPublicada: true };
  }
  return { erro: "Erro ao chamar a função do Supabase: " + (error.message || status) };
}

async function usrCarregar() {
  if (usrState.carregando) return;
  usrState.carregando = true;
  try {
    const { data, error } = await sb.from("user_roles").select("*").order("email");
    if (error) { toast("Erro ao carregar usuários: " + error.message); return; }
    usrState.lista = data || [];
    usrState.carregou = true;
    usrRenderLista();
    // logins sem acesso: vêm da função (só ela enxerga os logins do Supabase); sem a função, a lista segue normal
    const r = await usrChamarFuncao({ acao: "pendentes" });
    usrState.pendentes = r.dados && Array.isArray(r.dados.pendentes) ? r.dados.pendentes : [];
    usrState.aviso = r.erro && r.naoPublicada ? "Aviso: a função admin-usuarios ainda não foi publicada no Supabase, então não dá para criar usuário pela tela nem ver logins sem acesso." : "";
    usrRenderLista();
  } finally {
    usrState.carregando = false;
  }
}

// chamado pelo setView() quando a tela Administração abre
function usrAoAbrirAdministracao() {
  if (document.getElementById("usrTbody")) usrCarregar();
}

/* ---------------- lista (matriz) ---------------- */

function usrIniciais(nome, email) {
  return computeUserInitials(nome || email || "?");
}

function usrLinhaPessoa(u) {
  const v = usrValoresDe(u);
  const a = usrAcessosDe(v);
  const crmExiste = "crm_papel" in u;
  const celulaVarejo = `${usrSelo({ editor: "ed", viewer: "leit", representante: "rep" }[v.role] || "ed", USR_PAPEL_VAREJO[v.role] || v.role)}` +
    `<div class="muted usr-sub">${v.role === "representante" ? "só o portal" : usrTextoTelas(v.visible_views)}${v.pode_acessar_portal_representante && v.role !== "representante" ? " · + portal" : ""}</div>`;
  return `
    <tr>
      <td><div class="usr-pessoa"><div class="usr-av">${escapeHtml(usrIniciais(u.nome, u.email))}</div>
        <div><b>${escapeHtml(u.nome || "(sem nome)")}</b>${u.is_admin ? ' <span class="usr-selo adm">Administrador</span>' : ""}
        <div class="muted usr-sub mono">${escapeHtml(u.email || "—")}</div></div></div></td>
      <td>${celulaVarejo}</td>
      <td>${a.semvenda ? usrSelo("ok", "Liberado") : '<span class="muted">—</span>'}</td>
      <td>${crmExiste ? usrSeloCrm(a.encomenda) : '<span class="muted">—</span>'}</td>
      <td>${crmExiste ? usrSeloCrm(a.atacado) : '<span class="muted">—</span>'}</td>
      <td class="usr-acoes"><button type="button" class="btn small outline" data-usracesso="${escapeAttr(u.user_id)}">Editar acesso</button></td>
    </tr>`;
}

function usrFiltrar() {
  const busca = (document.getElementById("usrBusca").value || "").trim().toLowerCase();
  const sistema = document.getElementById("usrFiltroSistema").value;
  const papel = document.getElementById("usrFiltroPapel").value;
  return usrState.lista.filter(u => {
    const v = usrValoresDe(u);
    const a = usrAcessosDe(v);
    if (busca && !`${u.nome || ""} ${u.email || ""}`.toLowerCase().includes(busca)) return false;
    if (sistema === "semvenda" && !a.semvenda) return false;
    if (sistema === "atacado" && !a.atacado) return false;
    if (sistema === "encomenda" && !a.encomenda) return false;
    if (papel === "admin" && !u.is_admin) return false;
    if (["executivo", "financeiro", "gestao"].includes(papel) && v.crm_papel !== papel && !(papel === "gestao" && !v.crm_papel && v.is_admin)) return false;
    return true;
  }).sort((a, b) => (a.nome || a.email || "").localeCompare(b.nome || b.email || "", "pt-BR"));
}

function usrRenderPendentes() {
  const box = document.getElementById("usrPendentes");
  const p = usrState.pendentes;
  let html = "";
  if (p.length) {
    html += p.slice(0, 3).map(x => `
      <div class="usr-pendente">
        <div class="usr-pendente-txt"><div class="usr-av usr-av-alerta">${escapeHtml(computeUserInitials(x.email.split("@")[0].replace(/[._-]+/g, " ")))}</div>
          <div><b class="mono">${escapeHtml(x.email)}</b> já tem login, mas ainda não vê nenhum sistema.</div></div>
        <button type="button" class="btn small outline" data-usrliberar="${escapeAttr(x.user_id)}">Liberar acesso</button>
      </div>`).join("");
    if (p.length > 3) html += `<div class="note">e mais ${p.length - 3} ${p.length - 3 === 1 ? "login" : "logins"} sem acesso.</div>`;
  }
  if (usrState.aviso) html += `<div class="note usr-aviso">${escapeHtml(usrState.aviso)}</div>`;
  box.innerHTML = html;
}

function usrRenderLista() {
  usrRenderPendentes();
  const linhas = usrFiltrar();
  document.getElementById("usrTbody").innerHTML = linhas.map(usrLinhaPessoa).join("");
  const vazio = document.getElementById("usrVazio");
  vazio.style.display = linhas.length ? "none" : "block";
  vazio.textContent = usrState.lista.length ? "Ninguém com esses filtros." : "Nenhum usuário carregado.";
  const n = usrState.lista.length;
  document.getElementById("usrContagem").textContent =
    `${n} ${n === 1 ? "pessoa com acesso" : "pessoas com acesso"}` + (usrState.pendentes.length ? ` · ${usrState.pendentes.length} aguardando liberação` : "");
}

/* ---------------- prévia de "como a pessoa vê o sistema" (janela e página) ---------------- */

function usrResumoHtml(v, quem) {
  const a = usrAcessosDe(v);
  const crmAtivo = usrState.lista.length === 0 || usrColunas().has("crm_papel");
  const cartao = (nome, texto, ativo, escuro) =>
    `<div class="usr-mini ${ativo ? (escuro ? "escuro" : "") : "off"}"><b>${nome}</b><span class="${ativo && !escuro ? "usr-ok" : ""}">${escapeHtml(texto)}</span></div>`;
  const menus = [];
  if (a.atacado || a.encomenda) {
    const sist = [a.atacado ? "Atacado" : "", a.encomenda ? "Encomenda" : ""].filter(Boolean).join(" e ");
    const papel = a.atacado || a.encomenda;
    menus.push(`<div class="usr-menu"><div class="usr-rot">Menu do ${escapeHtml(sist)}</div>
      <div><b>Carteira</b><br>Hoje · Clientes${a.atacado ? " (lista e kanban)" : " (lista)"}</div>
      ${papel === "executivo" ? '<div class="muted usr-sub">Só a própria carteira; só ele registra ligações.</div>' : '<div class="muted usr-sub">Lê todas as carteiras.</div>'}</div>`);
  }
  const flags = [
    ["Administrador", v.is_admin], ["Autorizar Gerência", v.pode_autorizar_gerencia], ["Exportar backup", v.pode_exportar_backup]
  ].map(([t, on]) => `<div class="usr-flag"><span>${t}</span><b>${on ? "sim" : "não"}</b></div>`).join("");
  return `
    <div class="usr-rot">Como ${escapeHtml(quem)} vê o sistema</div>
    <div class="usr-minis">
      ${cartao("TORUN (VAREJO)", v.role === "representante" ? "só o portal" : usrTextoTelas(v.visible_views), true, true)}
      ${cartao("SEM VENDA", a.semvenda ? "Liberado" : "sem acesso", a.semvenda)}
      ${cartao("ENCOMENDA", crmAtivo && a.encomenda ? USR_PAPEL_CRM[a.encomenda] : "sem acesso", crmAtivo && !!a.encomenda)}
      ${cartao("ATACADO", crmAtivo && a.atacado ? USR_PAPEL_CRM[a.atacado] : "sem acesso", crmAtivo && !!a.atacado)}
    </div>
    ${menus.join("")}
    <div class="usr-flags">${flags}</div>`;
}

/* ---------------- Novo usuário / Liberar acesso ---------------- */

function usrGerarSenha() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem letras que se confundem (l, I, O, 0, 1)
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  bytes.forEach(b => { s += alfabeto[b % alfabeto.length]; });
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

function usrPerfilAtual() {
  return USR_PERFIS.find(p => p.id === usrUi.novoPerfil) || USR_PERFIS[0];
}

function usrRenderNovo() {
  document.getElementById("usrNovoPerfis").innerHTML = USR_PERFIS.map(p => `
    <button type="button" class="usr-perfil ${p.id === usrUi.novoPerfil ? "on" : ""}" data-usrperfil="${p.id}" aria-pressed="${p.id === usrUi.novoPerfil}">
      <b>${escapeHtml(p.nome)}</b><span>${escapeHtml(p.desc)}</span></button>`).join("");
  const nome = (document.getElementById("usrNovoNome").value || "").trim().split(" ")[0] || "a pessoa";
  document.getElementById("usrNovoResumo").innerHTML = usrResumoHtml(usrValoresDe(usrPerfilAtual().valores), nome);
}

function usrAbrirNovo(pendente) {
  usrUi.novoModo = pendente ? "liberar" : "criar";
  usrUi.novoPendente = pendente || null;
  usrUi.novoPerfil = "exec-atacado";
  const liberar = !!pendente;
  document.getElementById("usrNovoTitulo").textContent = liberar ? "Liberar acesso" : "Novo usuário";
  document.getElementById("usrNovoSub").textContent = liberar
    ? "Esse login já existe. Escolha o que a pessoa vai poder abrir."
    : "Crie o login e escolha o que a pessoa vai poder abrir. O resumo ao lado mostra como ela vai enxergar o sistema.";
  const email = document.getElementById("usrNovoEmail");
  email.value = liberar ? pendente.email : "";
  email.readOnly = liberar;
  const sugestao = liberar ? pendente.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "";
  document.getElementById("usrNovoNome").value = sugestao;
  document.getElementById("usrNovoSenhaCampo").style.display = liberar ? "none" : "";
  document.getElementById("usrNovoSenha").value = liberar ? "" : usrGerarSenha();
  document.getElementById("usrNovoRodape").textContent = liberar ? "A pessoa continua com a senha que já tem." : "O login é criado já confirmado e a pessoa já pode entrar.";
  document.getElementById("usrNovoSalvar").textContent = liberar ? "Liberar acesso" : "Criar usuário";
  document.getElementById("usrNovoErro").style.display = "none";
  usrRenderNovo();
  document.getElementById("usrNovoOverlay").classList.add("show");
  document.getElementById("usrNovoNome").focus();
}

function usrFecharNovo() {
  document.getElementById("usrNovoOverlay").classList.remove("show");
}

function usrErroNovo(msg) {
  const el = document.getElementById("usrNovoErro");
  el.textContent = msg;
  el.style.display = "block";
}

// só manda para a função os campos que existem na tabela (coluna nova que o banco ainda não tem não pode derrubar o cadastro)
function usrPerfilParaEnvio(valores) {
  const colunas = usrColunas();
  const sempre = ["role", "is_admin", "pode_autorizar_gerencia", "pode_exportar_backup", "pode_acessar_sem_venda", "visible_views"];
  const opcionais = ["pode_acessar_portal_representante", "crm_papel", "crm_sistema"];
  const envio = {};
  sempre.forEach(k => { envio[k] = valores[k]; });
  opcionais.forEach(k => { if (colunas.has(k)) envio[k] = valores[k]; });
  return envio;
}

async function usrSalvarNovo() {
  if (usrUi.novoSalvando) return;
  const liberar = usrUi.novoModo === "liberar";
  const nome = document.getElementById("usrNovoNome").value.replace(/\s+/g, " ").trim();
  const email = document.getElementById("usrNovoEmail").value.trim().toLowerCase();
  const senha = document.getElementById("usrNovoSenha").value;
  if (!nome) { usrErroNovo("Informe o nome da pessoa."); return; }
  if (!liberar) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { usrErroNovo("Informe um e-mail válido."); return; }
    if (senha.length < 8) { usrErroNovo("A senha provisória precisa ter pelo menos 8 caracteres."); return; }
    if (usrState.lista.some(u => (u.email || "").toLowerCase() === email)) { usrErroNovo("Esse e-mail já tem acesso. Use “Editar acesso” na lista."); return; }
  }
  const perfil = usrPerfilAtual();
  if (!usrColunas().has("crm_papel") && perfil.valores.crm_papel) {
    usrErroNovo("Esse perfil usa o CRM, e o banco ainda não tem as colunas dele (rode sql/crm_nucleo.sql). Escolha outro perfil.");
    return;
  }
  usrUi.novoSalvando = true;
  const botao = document.getElementById("usrNovoSalvar");
  botao.disabled = true;
  try {
    const corpo = liberar
      ? { acao: "liberar", user_id: usrUi.novoPendente.user_id, nome, perfil: usrPerfilParaEnvio(perfil.valores) }
      : { acao: "criar", nome, email, senha, perfil: usrPerfilParaEnvio(perfil.valores) };
    const r = await usrChamarFuncao(corpo);
    if (r.erro) { usrErroNovo(r.erro); return; }
    usrFecharNovo();
    await usrCarregar();
    if (liberar) { toast("Acesso liberado."); return; }
    document.getElementById("usrCredEmail").textContent = email;
    document.getElementById("usrCredSenha").textContent = senha;
    document.getElementById("usrCredNome").textContent = nome;
    document.getElementById("usrCredOverlay").classList.add("show");
  } finally {
    usrUi.novoSalvando = false;
    botao.disabled = false;
  }
}

async function usrCopiarCredenciais() {
  const texto = `Acesso ao sistema TORUN PNEUS\nEndereço: ${location.origin}\nE-mail: ${document.getElementById("usrCredEmail").textContent}\nSenha provisória: ${document.getElementById("usrCredSenha").textContent}`;
  try { await navigator.clipboard.writeText(texto); toast("Dados de acesso copiados."); }
  catch (e) { toast("Não deu para copiar sozinho: selecione e copie o e-mail e a senha na janela."); }
}

/* ---------------- Acesso de uma pessoa ---------------- */

function usrRowAcesso() {
  return usrState.lista.find(u => u.user_id === usrUi.acessoId) || null;
}

function usrAbrirAcesso(userId) {
  const row = usrState.lista.find(u => u.user_id === userId);
  if (!row) return;
  usrUi.acessoId = userId;
  usrUi.form = { nome: row.nome || "", ...usrValoresDe(row) };
  usrUi.original = JSON.parse(JSON.stringify(usrUi.form));
  usrUi.avancadoAberto = !!(row.is_admin || row.pode_autorizar_gerencia || row.pode_exportar_backup || row.pode_acessar_portal_representante);
  setView("usuario-acesso");
  document.querySelectorAll('.nav-item[data-view="administracao"]').forEach(b => b.classList.add("active"));
}

// diferenças entre o que está na tela e o que está salvo, já com texto para a pessoa ler
function usrDiferencas() {
  const f = usrUi.form, o = usrUi.original;
  const sim = (b) => (b ? "sim" : "não");
  const itens = [];
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (f.nome.trim() !== o.nome.trim()) itens.push(["Nome", o.nome || "—", f.nome.trim() || "—"]);
  if (f.role !== o.role) itens.push(["Papel no Torun", USR_PAPEL_VAREJO[o.role], USR_PAPEL_VAREJO[f.role]]);
  if (!igual(f.visible_views, o.visible_views)) itens.push(["Telas do Torun", usrTextoTelas(o.visible_views), usrTextoTelas(f.visible_views)]);
  if (f.pode_acessar_sem_venda !== o.pode_acessar_sem_venda) itens.push(["Sem Venda", o.pode_acessar_sem_venda ? "liberado" : "sem acesso", f.pode_acessar_sem_venda ? "liberado" : "sem acesso"]);
  if (f.crm_papel !== o.crm_papel || f.crm_sistema !== o.crm_sistema) itens.push(["Papel no CRM", usrTextoCrm(o.crm_papel, o.crm_sistema), usrTextoCrm(f.crm_papel, f.crm_sistema)]);
  if (f.is_admin !== o.is_admin) itens.push(["Administrador", sim(o.is_admin), sim(f.is_admin)]);
  if (f.pode_autorizar_gerencia !== o.pode_autorizar_gerencia) itens.push(["Autorizar Gerência", sim(o.pode_autorizar_gerencia), sim(f.pode_autorizar_gerencia)]);
  if (f.pode_exportar_backup !== o.pode_exportar_backup) itens.push(["Exportar backup", sim(o.pode_exportar_backup), sim(f.pode_exportar_backup)]);
  if (f.pode_acessar_portal_representante !== o.pode_acessar_portal_representante) itens.push(["Portal do representante", sim(o.pode_acessar_portal_representante), sim(f.pode_acessar_portal_representante)]);
  return itens;
}

function usrSwitch(campo, rotulo, desc, desabilitado, nota) {
  const on = !!usrUi.form[campo];
  return `<div class="usr-linha-sw"><div><b>${rotulo}</b><div class="muted usr-sub">${desc}${nota ? ` <i>${nota}</i>` : ""}</div></div>
    <input class="usr-sw" type="checkbox" role="switch" data-usrsw="${campo}" aria-label="${escapeAttr(rotulo)}" ${on ? "checked" : ""} ${desabilitado ? "disabled" : ""}></div>`;
}

function usrLateralHtml() {
  const f = usrUi.form;
  const dif = usrDiferencas();
  const primeiro = (f.nome || "").trim().split(" ")[0] || "a pessoa";
  return `
    <div class="card usr-previa">${usrResumoHtml(f, primeiro)}</div>
    <div class="card ${dif.length ? "usr-mudancas" : ""}">
      <h2>${dif.length ? `${dif.length} ${dif.length === 1 ? "mudança ainda não salva" : "mudanças ainda não salvas"}` : "Nada para salvar"}</h2>
      ${dif.length ? `<div class="usr-dif">${dif.map(([r, de, para]) => `<div>${escapeHtml(r)}: <span class="muted">${escapeHtml(de)}</span> → <b>${escapeHtml(para)}</b></div>`).join("")}</div>`
        : '<div class="muted usr-sub">Mexa em qualquer item ao lado; o que mudar aparece aqui.</div>'}
    </div>`;
}

function usrAtualizarLateral() {
  const lat = document.getElementById("usrAcLateral");
  if (lat) lat.innerHTML = usrLateralHtml();
  const salvar = document.getElementById("usrAcSalvar");
  if (salvar) salvar.disabled = usrDiferencas().length === 0;
}

function usrRenderAcesso() {
  const row = usrRowAcesso();
  const raiz = document.getElementById("usrAcesso");
  if (!row || !usrUi.form) {
    raiz.innerHTML = `<div class="card"><div class="empty-state">Escolha uma pessoa na lista. <button type="button" class="sv-link" data-usrvoltar="1">Voltar para Usuários</button></div></div>`;
    return;
  }
  const f = usrUi.form;
  const colunas = usrColunas();
  const eu = currentUser && row.user_id === currentUser.id;
  const marcadas = f.visible_views === null ? ADMIN_VIEW_DEFS.map(v => v.key) : f.visible_views;
  const crmExiste = colunas.has("crm_papel");
  const papelCrm = (id, titulo, desc) =>
    `<button type="button" class="usr-perfil ${(f.crm_papel || "none") === id ? "on" : ""}" data-usrcrm="${id}" aria-pressed="${(f.crm_papel || "none") === id}"><b>${titulo}</b><span>${desc}</span></button>`;
  raiz.innerHTML = `
    <div class="page-head">
      <div>
        <button type="button" class="sv-link usr-voltar" data-usrvoltar="1">← Usuários e acessos</button>
        <div class="usr-cabeca"><div class="usr-av usr-av-grande">${escapeHtml(usrIniciais(row.nome, row.email))}</div>
          <div><h1>${escapeHtml(row.nome || "(sem nome)")}</h1><div class="mono muted usr-sub">${escapeHtml(row.email || "—")}${eu ? " · você" : ""}</div></div></div>
      </div>
      <div class="page-head-actions">
        <button type="button" class="btn outline" data-usrdescartar="1">Descartar</button>
        <button type="button" class="btn primary" id="usrAcSalvar" data-usrsalvar="1" disabled>Salvar acesso</button>
      </div>
    </div>
    <div class="usr-grade">
      <div class="usr-coluna">
        <div class="card"><div class="card-head"><h2>Dados</h2></div>
          <div class="field usr-campo-nome"><label for="usrAcNome">Nome</label><input type="text" id="usrAcNome" maxlength="80" value="${escapeAttr(f.nome)}" autocomplete="off"></div>
        </div>

        <div class="card">
          <div class="usr-topo-card">
            <div><h2>Torun (Varejo)</h2><div class="muted usr-sub">O painel de estoque, vendas e financeiro. Marque só as telas que essa pessoa precisa.</div></div>
            <div class="usr-seg" role="group" aria-label="Papel no Torun">
              ${Object.entries(USR_PAPEL_VAREJO).map(([id, rot]) => `<button type="button" data-usrrole="${id}" class="${f.role === id ? "on" : ""}">${rot}</button>`).join("")}
            </div>
          </div>
          <div class="usr-atalhos"><span class="usr-rot">Telas liberadas</span>
            <button type="button" class="btn small outline" data-usrtelas="todas">Todas</button>
            <button type="button" class="btn small outline" data-usrtelas="dashboard">Só o Dashboard</button>
            <button type="button" class="btn small outline" data-usrtelas="financeiro">Financeiro (6 telas)</button></div>
          <div class="usr-telas">
            ${ADMIN_VIEW_DEFS.map(v => `<label class="usr-tela ${marcadas.includes(v.key) ? "on" : ""}"><input type="checkbox" data-usrtela="${v.key}" ${marcadas.includes(v.key) ? "checked" : ""}>${escapeHtml(v.label)}</label>`).join("")}
          </div>
        </div>

        <div class="card usr-card-unico">${usrSwitch("pode_acessar_sem_venda", "Sem Venda", "Estoque previsto, catálogo, reservas e armazenagem dos pneus comprados a mais.", false, row.is_admin ? "(administrador sempre acessa)" : "")}</div>

        <div class="card">
          <div class="card-head"><h2>Atacado e Encomenda (CRM)</h2></div>
          ${crmExiste ? `
            <div class="muted usr-sub usr-sub-baixo">O papel define o que a pessoa enxerga nas carteiras de clientes.</div>
            <div class="usr-perfis usr-perfis-4">
              ${papelCrm("none", "Sem acesso", "Não vê o CRM.")}
              ${papelCrm("executivo", "Executivo", "Só a própria carteira.")}
              ${papelCrm("financeiro", "Financeiro", "Lê todas as carteiras.")}
              ${papelCrm("gestao", "Gestão / Direção", "Lê tudo e redistribui.")}
            </div>
            ${f.crm_papel === "executivo" ? `<div class="usr-linha-seg"><span class="usr-rot">Executivo de qual sistema?</span>
              <div class="usr-seg" role="group" aria-label="Sistema do executivo">
                ${Object.entries(USR_SISTEMA).map(([id, rot]) => `<button type="button" data-usrcrmsis="${id}" class="${f.crm_sistema === id ? "on" : ""}">${rot}</button>`).join("")}
              </div></div>` : ""}
            ${!f.crm_papel && row.is_admin ? '<div class="muted usr-sub usr-sub-cima">Administrador sem papel marcado conta como Gestão no CRM.</div>' : ""}`
          : `<div class="note">O CRM ainda não foi liberado no banco (rode sql/crm_nucleo.sql no Supabase).</div>`}
        </div>

        <div class="card">
          <div class="usr-topo-card">
            <div><h2>Avançado</h2><div class="muted usr-sub">Administrador, Autorização de Gerência, backup e portal do representante.</div></div>
            <button type="button" class="btn small outline" data-usravancado="1">${usrUi.avancadoAberto ? "Esconder ⌃" : "Mostrar ⌄"}</button>
          </div>
          ${usrUi.avancadoAberto ? `<div class="usr-avancado">
            ${usrSwitch("is_admin", "Administrador", "Acessa Administração e vê tudo.", !!eu, eu ? "(você não pode mudar o seu próprio acesso de administrador)" : "")}
            ${usrSwitch("pode_autorizar_gerencia", "Autorização de Gerência", "Pode tirar pedidos da etapa Autorização de Gerência.", false, "")}
            ${usrSwitch("pode_exportar_backup", "Exportar backup", "Pode baixar o backup (JSON).", false, "")}
            ${colunas.has("pode_acessar_portal_representante") ? usrSwitch("pode_acessar_portal_representante", "Portal do representante", "Abre o portal de pedidos com o mesmo login.", false, "") : ""}
          </div>` : ""}
        </div>
      </div>
      <div class="usr-coluna" id="usrAcLateral">${usrLateralHtml()}</div>
    </div>`;
  usrAtualizarLateral();
}

function usrAplicarTelas(modo) {
  if (modo === "todas") usrUi.form.visible_views = null;
  else if (modo === "dashboard") usrUi.form.visible_views = ["dashboard"];
  else usrUi.form.visible_views = USR_TELAS_FINANCEIRO.slice();
}

function usrAlternarTela(chave, ligada) {
  const atuais = usrUi.form.visible_views === null ? ADMIN_VIEW_DEFS.map(v => v.key) : usrUi.form.visible_views.slice();
  const novas = ligada ? Array.from(new Set([...atuais, chave])) : atuais.filter(k => k !== chave);
  if (!novas.length) { toast("Deixe pelo menos uma tela liberada."); return false; }
  // todas marcadas = sem restrição (mesma convenção do banco: visible_views nulo)
  usrUi.form.visible_views = novas.length === ADMIN_VIEW_DEFS.length ? null : ADMIN_VIEW_DEFS.map(v => v.key).filter(k => novas.includes(k));
  return true;
}

function usrEscolherCrm(id) {
  const f = usrUi.form;
  f.crm_papel = id === "none" ? null : id;
  f.crm_sistema = id === "executivo" ? (f.crm_sistema || usrUi.original.crm_sistema || "atacado") : null;
}

async function usrSalvarAcesso() {
  if (usrUi.salvando) return;
  const row = usrRowAcesso();
  if (!row) return;
  const dif = usrDiferencas();
  if (!dif.length) return;
  const f = usrUi.form, o = usrUi.original;
  if (!f.nome.trim()) { toast("Informe o nome."); return; }
  if (f.crm_papel === "executivo" && !f.crm_sistema) { toast("Escolha o sistema do executivo (Atacado ou Encomenda)."); return; }
  if (f.is_admin && !o.is_admin) {
    const ok = await confirmModal("Dar acesso de administrador?", `${f.nome.trim() || row.email} vai poder ver e mudar tudo, inclusive os acessos de todos os usuários.`);
    if (!ok) return;
  }
  if (currentUser && row.user_id === currentUser.id && o.is_admin && !f.is_admin) { toast("Você não pode tirar o seu próprio acesso de administrador."); return; }

  // só vão os campos que mudaram (e que existem na tabela); o papel do CRM sempre leva o sistema junto
  const colunas = usrColunas();
  const payload = {};
  const mudou = (k) => JSON.stringify(f[k]) !== JSON.stringify(o[k]);
  if (f.nome.trim() !== o.nome.trim()) payload.nome = f.nome.trim();
  ["role", "visible_views", "pode_acessar_sem_venda", "is_admin", "pode_autorizar_gerencia", "pode_exportar_backup"].forEach(k => { if (mudou(k)) payload[k] = f[k]; });
  if (colunas.has("pode_acessar_portal_representante") && mudou("pode_acessar_portal_representante")) payload.pode_acessar_portal_representante = f.pode_acessar_portal_representante;
  if (colunas.has("crm_papel") && (mudou("crm_papel") || mudou("crm_sistema"))) { payload.crm_papel = f.crm_papel; payload.crm_sistema = f.crm_papel === "executivo" ? f.crm_sistema : null; }

  usrUi.salvando = true;
  const botao = document.getElementById("usrAcSalvar");
  if (botao) botao.disabled = true;
  try {
    const { data, error } = await sb.from("user_roles").update(payload).eq("user_id", row.user_id).select();
    if (error) { toast("Erro ao salvar o acesso: " + error.message); return; }
    if (!data || data.length === 0) { toast("Não foi possível salvar (sem permissão)."); return; }
    Object.assign(row, data[0]);
    const eu = currentUser && row.user_id === currentUser.id;
    toast(eu ? "Acesso salvo. Para a sua própria conta, vale no próximo login." : "Acesso salvo.");
    usrUi.original = null;
    setView("administracao");
  } finally {
    usrUi.salvando = false;
    if (botao) botao.disabled = false;
  }
}

async function usrDescartar() {
  if (usrUi.original && usrDiferencas().length) {
    const ok = await confirmModal("Descartar as mudanças?", "O que você mexeu nesta pessoa e não salvou vai ser perdido.");
    if (!ok) return;
  }
  usrUi.original = null;
  setView("administracao");
}

/* ---------------- eventos ---------------- */

function usrCliqueAcesso(e) {
  const t = e.target.closest("[data-usrvoltar],[data-usrdescartar],[data-usrsalvar],[data-usrrole],[data-usrtelas],[data-usrcrm],[data-usrcrmsis],[data-usravancado]");
  if (!t || !usrUi.form) { if (t && t.dataset.usrvoltar) setView("administracao"); return; }
  if (t.dataset.usrvoltar) { usrDescartar(); return; }
  if (t.dataset.usrdescartar) { usrDescartar(); return; }
  if (t.dataset.usrsalvar) { usrSalvarAcesso(); return; }
  if (t.dataset.usrrole) usrUi.form.role = t.dataset.usrrole;
  else if (t.dataset.usrtelas) usrAplicarTelas(t.dataset.usrtelas);
  else if (t.dataset.usrcrm) usrEscolherCrm(t.dataset.usrcrm);
  else if (t.dataset.usrcrmsis) usrUi.form.crm_sistema = t.dataset.usrcrmsis;
  else if (t.dataset.usravancado) usrUi.avancadoAberto = !usrUi.avancadoAberto;
  usrRenderAcesso();
}

function usrMudancaAcesso(e) {
  if (!usrUi.form) return;
  const tela = e.target.closest("[data-usrtela]");
  const sw = e.target.closest("[data-usrsw]");
  if (tela) { usrAlternarTela(tela.dataset.usrtela, tela.checked); usrRenderAcesso(); }
  else if (sw) { usrUi.form[sw.dataset.usrsw] = sw.checked; usrRenderAcesso(); }
}

function initUsuariosAdmin() {
  if (!document.getElementById("usrTbody")) return;
  ["usrBusca", "usrFiltroSistema", "usrFiltroPapel"].forEach(id => document.getElementById(id).addEventListener("input", usrRenderLista));
  document.getElementById("usrBtnNovo").addEventListener("click", () => usrAbrirNovo(null));
  document.getElementById("usrCard").addEventListener("click", (e) => {
    const b = e.target.closest("[data-usracesso],[data-usrliberar]");
    if (!b) return;
    if (b.dataset.usracesso) usrAbrirAcesso(b.dataset.usracesso);
    else { const p = usrState.pendentes.find(x => x.user_id === b.dataset.usrliberar); if (p) usrAbrirNovo(p); }
  });

  const acesso = document.getElementById("usrAcesso");
  acesso.addEventListener("click", usrCliqueAcesso);
  acesso.addEventListener("change", usrMudancaAcesso);
  acesso.addEventListener("input", (e) => {
    if (e.target.id !== "usrAcNome" || !usrUi.form) return;
    usrUi.form.nome = e.target.value;
    usrAtualizarLateral();
  });

  document.getElementById("usrNovoPerfis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-usrperfil]");
    if (!b) return;
    usrUi.novoPerfil = b.dataset.usrperfil;
    document.getElementById("usrNovoErro").style.display = "none";
    usrRenderNovo();
  });
  document.getElementById("usrNovoNome").addEventListener("input", usrRenderNovo);
  document.getElementById("usrNovoGerar").addEventListener("click", () => { document.getElementById("usrNovoSenha").value = usrGerarSenha(); });
  document.getElementById("usrNovoCancelar").addEventListener("click", usrFecharNovo);
  document.getElementById("usrNovoFechar").addEventListener("click", usrFecharNovo);
  document.getElementById("usrNovoSalvar").addEventListener("click", usrSalvarNovo);
  document.getElementById("usrCredCopiar").addEventListener("click", usrCopiarCredenciais);
  document.getElementById("usrCredFechar").addEventListener("click", () => document.getElementById("usrCredOverlay").classList.remove("show"));
}

// Gera mockups/crm-ligacoes-kanban.html com o CSS e o sprite de ícones REAIS do sistema (site/), para o desenho seguir o padrão.
const fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..", "..");
const lerSite = f => fs.readFileSync(path.join(raiz, "site", f), "utf8");
const css = ["styles.css", "semvenda.css", "crm.css"].map(lerSite).join("\n");
const idx = lerSite("index.html");
const sprite = idx.slice(idx.indexOf('<svg style="display:none"'), idx.indexOf("</svg>", idx.indexOf("</defs>")) + 6);

const ico = (n, t) => `<a class="crm-ico" href="#" title="${t}" aria-label="${t}"><svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><use href="#i-${n}"/></svg></a>`;
const atalhos = ico("fone", "Ligar") + ico("whats", "WhatsApp") + ico("email", "E-mail");
const pill = (cls, t) => `<span class="status-pill ${cls}">${t}</span>`;
function cartao({ nome, cidade, contato, cargo, res, resCls, data, fu, fuAtraso, obs, rodape, selo = "Cliente" }) {
  return `<div class="kanban-card crm-cartao">
    <div><button type="button" class="sv-link crm-nome">${nome}</button> <span class="crm-selo">${selo}</span></div>
    <div class="muted sv-sub">${cidade}</div>
    <div class="crm-cartao-contato">${contato} <span class="muted">· ${cargo}</span></div>
    <div class="crm-cartao-linha"><span class="crm-rot">Última ligação</span><div><span class="mono">${data}</span> ${pill(resCls, res)}</div></div>
    <div class="crm-cartao-linha"><span class="crm-rot">Próximo follow-up</span><div><span class="mono ${fuAtraso ? "crm-fu-atrasado" : ""}">${fu}</span></div></div>
    ${obs ? `<div class="crm-cartao-linha"><span class="crm-rot">Observação</span><div>${obs}</div></div>` : ""}
    <div class="crm-cartao-rodape">${rodape}</div>
    <div class="crm-cartao-acoes">${atalhos}<button type="button" class="btn small primary">Registrar ligação</button></div>
  </div>`;
}
const etapas = [
  ["Primeiro contato", "#6366F1", "#4338CA", "#E7E7FE"], ["Estimativa enviada", "#FF6A13", "#C64F0C", "#FFE7D6"],
  ["Em negociação", "#2563EB", "#1D4FA8", "#E4EEFD"], ["Fechamento", "#D97706", "#92650A", "#FBF3D5"],
  ["Fechado", "#22C55E", "#15803D", "#E1F8E8"], ["Declinou", "#DC2626", "#991B1B", "#FDE6E6"]
];
const cartoes = [
  [cartao({ nome: "Pneus do Vale Ltda", cidade: "Blumenau/SC", contato: "Marcos", cargo: "comprador", res: "Não atendeu", resCls: "pill-neutro", data: "03/11", fu: "04/11", fuAtraso: true, obs: "Tentar de manhã, depois das 9h.", rodape: "3 ligações · há 6 dias nesta etapa" }),
   cartao({ nome: "Rodovia Transportes", cidade: "Itajaí/SC", contato: "Ana", cargo: "compras", res: "Pediu retorno", resCls: "pill-atencao", data: "02/11", fu: "06/11", rodape: "2 ligações · há 2 dias nesta etapa" })],
  [cartao({ nome: "Truck Center Transportes", cidade: "Timbó/SC", contato: "João", cargo: "fechador", res: "Estimativa enviada", resCls: "pill-baixo", data: "04/11", fu: "07/11", obs: "295/80 R22.5, 40 un. Vai confirmar com a diretoria.", rodape: "5 ligações · há 1 dia nesta etapa" })],
  [cartao({ nome: "Frota Sul Logística", cidade: "Joinville/SC", contato: "Paulo", cargo: "fechador", res: "Interesse", resCls: "crm-pill-int", data: "01/11", fu: "05/11", rodape: "4 ligações · há 3 dias nesta etapa" })],
  [],
  [cartao({ nome: "Agro Pneus MT", cidade: "Sorriso/MT", contato: "Luiz", cargo: "fechador", res: "Fechou negócio", resCls: "pill-normal", data: "04/11", fu: "—", rodape: "7 ligações · há 0 dias nesta etapa" })],
  []
];
const board = etapas.map(([n, a, d, p], i) => `
  <div class="kanban-col" style="--col-accent:${a}; --col-deep:${d}; --col-pale:${p};">
    <div class="kanban-col-head"><span>${n}</span><span class="kanban-count">${cartoes[i].length}</span></div>
    <div class="kanban-cards">${cartoes[i].join("") || (i === 5 ? '<div class="crm-col-vazia">Ninguém declinou. Arraste para cá o cliente que disse não.</div>' : "")}</div>
  </div>`).join("");

const nav = (ativo, dash) => `
  <nav class="nav">
    <div class="nav-group"><button type="button" class="nav-label">Carteira <svg class="ic nav-label-chevron" viewBox="0 0 20 20"><use href="#i-chevron"/></svg></button>
      <button class="nav-item ${ativo === "hoje" ? "active" : ""}"><svg class="ic" viewBox="0 0 20 20"><use href="#i-calendar"/></svg> Hoje</button>
      <button class="nav-item ${ativo === "clientes" ? "active" : ""}"><svg class="ic" viewBox="0 0 20 20"><use href="#i-users"/></svg> Clientes</button></div>
    <div class="nav-group"><button type="button" class="nav-label">Acompanhamento <svg class="ic nav-label-chevron" viewBox="0 0 20 20"><use href="#i-chevron"/></svg></button>
      <button class="nav-item ${ativo === "lig" ? "active" : ""}"><svg class="ic" viewBox="0 0 20 20"><use href="#i-trend"/></svg> Ligações e desempenho</button>
      ${dash ? `<button class="nav-item"><svg class="ic" viewBox="0 0 20 20"><use href="#i-dashboard"/></svg> Dashboard</button>` : ""}</div>
  </nav>`;
const sidebar = (ativo, dash) => `<aside class="sidebar mk-side"><div class="brand"><span class="brand-sub">Atacado</span></div>${nav(ativo, dash)}</aside>`;
const tela = (rotulo, ativo, dash, conteudo) => `
<div class="mk-cap">${rotulo}</div>
<div class="shell mk-shell">${sidebar(ativo, dash)}<main class="main">${conteudo}</main></div>`;

const kpisExec = `<div class="kpis">
  <div class="kpi"><div class="lbl">Ligações no mês</div><div class="val">14</div></div>
  <div class="kpi"><div class="lbl">Taxa de contato</div><div class="val">71%</div><div class="muted sv-sub">10 de 14 ligações atendidas</div></div>
  <div class="kpi crm-alerta"><div class="lbl">Follow-ups atrasados</div><div class="val">3</div></div>
  <div class="kpi"><div class="lbl">Fechadas no mês</div><div class="val">2</div></div></div>`;
const kpisGestao = `<div class="kpis">
  <div class="kpi"><div class="lbl">Ligações</div><div class="val">96</div></div>
  <div class="kpi"><div class="lbl">Taxa de contato</div><div class="val">68%</div><div class="muted sv-sub">65 de 96 ligações atendidas</div></div>
  <div class="kpi"><div class="lbl">Taxa de fechamento</div><div class="val">24%</div><div class="muted sv-sub">16 fecharam de 65 que atenderam</div></div>
  <div class="kpi crm-alerta"><div class="lbl">Follow-ups atrasados</div><div class="val">9</div></div></div>`;

const telaClientes = tela("1. Clientes (todos os papéis): só a lista, sem o botão Lista/Kanban", "clientes", false, `
  <div class="page-head"><div><h1>Clientes</h1><div class="sub">42 clientes na sua carteira.</div></div>
    <div class="page-head-actions crm-acoes-topo"><span class="mk-tirado"><div class="crm-seg"><button type="button" class="on">Lista</button><button type="button">Kanban</button></div></span>
      <button type="button" class="btn primary">+ Adicionar cliente</button></div></div>
  <div class="card"><div class="form-row crm-filtros"><div class="field grow"><label>Buscar</label><input type="text" placeholder="Nome do cliente, cidade ou contato…"></div>
    <div class="field"><label>Situação</label><select><option>Todos os clientes</option></select></div><div class="field"><label>Ordenar por</label><select><option>Próximo follow-up</option></select></div></div>
    <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contato principal</th><th>Última ligação</th><th>Próximo follow-up</th><th></th></tr></thead>
    <tbody><tr><td><button type="button" class="sv-link crm-nome">Truck Center Transportes</button><div class="muted sv-sub">Timbó/SC</div></td><td>João <span class="muted">· fechador</span></td><td><span class="mono">04/11</span> ${pill("pill-baixo", "Estimativa enviada")}</td><td><span class="mono">07/11</span></td><td class="crm-acoes">${atalhos}</td></tr>
    <tr><td><button type="button" class="sv-link crm-nome">Pneus do Vale Ltda</button><div class="muted sv-sub">Blumenau/SC</div></td><td>Marcos <span class="muted">· comprador</span></td><td><span class="mono">03/11</span> ${pill("pill-neutro", "Não atendeu")}</td><td><span class="mono crm-fu-atrasado">04/11</span></td><td class="crm-acoes">${atalhos}</td></tr></tbody></table></div></div>`);

const telaExec = tela("2. Ligações e desempenho: visão do EXECUTIVO (hoje esta aba é só da gestão; passa a aparecer para ele)", "lig", false, `
  <div class="page-head"><div><h1>Ligações</h1><div class="sub">Arraste o cartão para mudar a etapa. Cada cartão é um cliente com a sua última ligação.</div></div>
    <div class="page-head-actions"><button type="button" class="btn primary">+ Nova ligação</button></div></div>
  ${kpisExec}
  <div class="card"><div class="crm-bandeja"><div class="crm-bandeja-head"><b>Sem etapa</b> <span class="kanban-count">2</span> <span class="muted sv-sub">Ainda não entraram no funil. Arraste o cartão para uma etapa.</span></div>
    <div class="crm-bandeja-cards"><div class="crm-chip-cliente"><button type="button" class="sv-link crm-nome">Auto Center Sul</button><span class="muted sv-sub">Joinville/SC</span><span class="muted sv-sub">Nunca ligado</span></div>
    <div class="crm-chip-cliente"><button type="button" class="sv-link crm-nome">Borracharia Vale</button><span class="muted sv-sub">Gaspar/SC</span>${pill("pill-neutro", "Não atendeu")}</div></div></div>
    <div class="kanban-board crm-board">${board}</div></div>`);

const chip = (t, on) => `<button type="button" class="crm-chip ${on ? "on" : ""}">${t}</button>`;
const modal = `
<div class="mk-cap">3. + Nova ligação (pop-up). Igual ao “Registrar ligação” de hoje, com a escolha do cliente no topo</div>
<div class="mk-modal"><div class="modal" role="dialog">
  <div class="crm-modal-topo"><div><h3>Nova ligação</h3><div class="muted sv-sub">Cria ou atualiza o cartão no kanban e registra a ligação no histórico do cliente.</div></div><button type="button" class="crm-fechar" aria-label="Fechar">✕</button></div>
  <div class="field"><label>Cliente</label><input type="text" value="truck">
    <div class="crm-bandeja-cards" style="flex-direction:column;gap:6px;margin-top:6px;"><div class="crm-chip-cliente" style="cursor:pointer;border-color:var(--orange);"><button type="button" class="sv-link crm-nome">Truck Center Transportes</button><span class="muted sv-sub">Timbó/SC · Atacado</span></div>
    <div class="crm-chip-cliente" style="cursor:pointer;"><button type="button" class="sv-link crm-nome">Truck Norte Pneus</button><span class="muted sv-sub">Gaspar/SC · Atacado</span></div>
    <div class="crm-chip-cliente" style="cursor:pointer;border-style:dashed;"><button type="button" class="sv-link crm-nome" style="color:var(--orange-deep)">+ Cadastrar cliente novo</button></div></div></div>
  <div class="field"><label>Falou com</label><select><option>João · fechador (principal)</option></select></div>
  <div class="field"><label>Resultado da ligação</label><div class="crm-chips">${chip("Não atendeu")}${chip("Pediu retorno")}${chip("Interesse")}${chip("Estimativa enviada", true)}${chip("Fechou negócio")}${chip("Sem interesse")}</div></div>
  <div class="field"><label>Etapa no kanban</label><select><option>Estimativa enviada</option></select>
    <div class="note">Sugerida pelo resultado. Você pode trocar.</div></div>
  <div class="field"><label>Observação</label><textarea rows="3">295/80 R22.5, 40 un. Vai confirmar com a diretoria.</textarea></div>
  <div class="field"><label>Próximo follow-up</label><div class="crm-fu-linha"><input type="date" value="2026-11-07"><div class="crm-chips">${chip("Amanhã")}${chip("Em 3 dias")}${chip("Em 1 semana")}${chip("Em 2 semanas")}</div></div>
    <div class="note">Obrigatório para Pediu retorno, Interesse e Estimativa enviada.</div></div>
  <div class="crm-modal-rodape"><span class="muted sv-sub"></span><div class="form-actions"><button type="button" class="btn outline">Cancelar</button><button type="button" class="btn primary">Salvar ligação</button></div></div>
</div></div>`;

const telaGestao = tela("4. Ligações e desempenho: visão da GESTÃO (igual a hoje, sem kanban)", "lig", true, `
  <div class="page-head"><div><h1>Ligações e desempenho</h1><div class="sub">Como o time está ligando: contato, fechamento e follow-ups atrasados, por executivo.</div></div>
    <div class="page-head-actions crm-des-filtros"><div class="field"><label>Período</label><select><option>Novembro de 2026</option></select></div><div class="field"><label>Executivo</label><select><option>Todos</option></select></div></div></div>
  ${kpisGestao}
  <div class="card"><div class="card-head"><h2>Desempenho por executivo</h2></div><div class="table-wrap"><table><thead><tr><th>Executivo</th><th class="num">Ligações</th><th class="num">Atenderam</th><th class="num">Taxa de contato</th><th class="num">Fecharam</th><th class="num">Atrasados</th></tr></thead>
  <tbody><tr><td><b>Carlos</b></td><td class="num">52</td><td class="num">36</td><td class="num">69%</td><td class="num">9</td><td class="num">5</td></tr><tr><td><b>Marina</b></td><td class="num">44</td><td class="num">29</td><td class="num">66%</td><td class="num">7</td><td class="num">4</td></tr></tbody></table></div></div>
  <div class="note">Mantém também “Como terminaram as ligações” e “Últimas ligações”. Gestão com carteira própria vê aqui um botão “Minha carteira” para abrir o kanban.</div>`);

const html = `<title>CRM Ligações Kanban</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap">
<style>
${css}
/* só do mockup */
.mk-cap{font:700 11px/1.3 Inter,sans-serif;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin:26px 0 8px;padding-left:max(16px,env(safe-area-inset-left,0px))}
.shell.mk-shell{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0 max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px));min-height:0}
.mk-side{height:auto;position:static}
.mk-tirado{opacity:.45;text-decoration:line-through;display:inline-block}
.mk-modal{margin:0 max(16px,env(safe-area-inset-left,0px));max-width:560px}
.mk-modal .modal{max-height:none}
.mk-shell .kanban-board{overflow-x:auto}
@media(max-width:800px){.shell.mk-shell{flex-direction:column}.mk-side{width:auto;flex:none}}
</style>
${sprite}
<div class="mk-cap" style="margin-top:20px;font-size:13px;text-transform:none;letter-spacing:0;max-width:80ch">Desenho feito com o CSS e os componentes reais do sistema. Mudanças: a aba Clientes fica só com a lista; a aba Ligações e desempenho passa a ter o kanban para o executivo (com “+ Nova ligação”) e continua com os indicadores para a gestão.</div>
${telaClientes}${telaExec}${modal}${telaGestao}
`;
fs.writeFileSync(path.join(raiz, "mockups", "crm-ligacoes-kanban.html"), html);
console.log("ok", Math.round(html.length / 1024) + " KB");

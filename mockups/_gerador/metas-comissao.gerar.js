// Gera mockups/metas-comissao.html com o CSS e os ícones REAIS do sistema (site/): Metas > Mês a mês com % e valor da comissão.
const fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..", "..");
const lerSite = f => fs.readFileSync(path.join(raiz, "site", f), "utf8");
const css = ["styles.css", "semvenda.css", "crm.css"].map(lerSite).join("\n");
const idx = lerSite("index.html");
const sprite = idx.slice(idx.indexOf('<svg style="display:none"'), idx.indexOf("</svg>", idx.indexOf("</defs>")) + 6);

const CORES = ["#FF6A13", "#161616", "#0E6560", "#2B4C7E"];
const execs = [
  { nome: "Camila Duarte", sis: ["Atacado"], meta: 700000, pct: "1,5", novo: false },
  { nome: "Rafael Mendes", sis: ["Atacado"], meta: 500000, pct: "1,5", novo: false },
  { nome: "Juliana Prado", sis: ["Encomenda"], meta: 400000, pct: "1,2", novo: false },
  { nome: "Angela", sis: ["Atacado", "Encomenda"], meta: 300000, pct: "1,0", novo: true }
];
const equipe = execs.reduce((t, e) => t + e.meta, 0);
const brl = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = n => n.toLocaleString("pt-BR");
const valorCom = e => e.meta * Number(e.pct.replace(",", ".")) / 100;
const totalCom = execs.reduce((t, e) => t + valorCom(e), 0);

const linhas = execs.map((e, i) => `
    <tr>
      <td><span class="crm-mt-ponto" style="background:${CORES[i]}"></span><b>${e.nome}</b>${e.novo ? `<div class="muted sv-sub">Gestão com carteira própria</div>` : ""}</td>
      <td>${e.sis.map(s => `<span class="crm-selo crm-selo-tor">${s}</span>`).join(" ")}</td>
      <td><label class="crm-mt-campo"><span>R$</span><input type="text" inputmode="numeric" class="crm-meta-in" value="${inteiro(e.meta)}" aria-label="Meta de novembro de ${e.nome}"></label></td>
      <td><div class="crm-mt-parte"><div class="crm-mt-trilho"><i style="background:${CORES[i]};width:${Math.round(e.meta / equipe * 100)}%"></i></div><b>${Math.round(e.meta / equipe * 100)}%</b></div></td>
      <td><label class="crm-mt-campo mk-pct"><input type="text" inputmode="decimal" class="crm-meta-in" value="${e.pct}" aria-label="Percentual de comissão de ${e.nome}"><span>%</span></label></td>
      <td class="num mono"><b>R$ ${brl(valorCom(e))}</b></td>
      <td class="num crm-mt-ref">${inteiro(e.meta * 12)}</td>
    </tr>`).join("");

const nav = `
  <nav class="nav">
    <div class="nav-group"><button type="button" class="nav-label">Carteira <svg class="ic nav-label-chevron" viewBox="0 0 20 20"><use href="#i-chevron"/></svg></button>
      <button class="nav-item"><svg class="ic" viewBox="0 0 20 20"><use href="#i-calendar"/></svg> Hoje</button>
      <button class="nav-item"><svg class="ic" viewBox="0 0 20 20"><use href="#i-users"/></svg> Clientes</button></div>
    <div class="nav-group"><button type="button" class="nav-label">Acompanhamento <svg class="ic nav-label-chevron" viewBox="0 0 20 20"><use href="#i-chevron"/></svg></button>
      <button class="nav-item"><svg class="ic" viewBox="0 0 20 20"><use href="#i-trend"/></svg> Ligações e desempenho</button>
      <button class="nav-item"><svg class="ic" viewBox="0 0 20 20"><use href="#i-dashboard"/></svg> Dashboard</button></div>
    <div class="nav-group"><button type="button" class="nav-label">Gestão <svg class="ic nav-label-chevron" viewBox="0 0 20 20"><use href="#i-chevron"/></svg></button>
      <button class="nav-item active"><svg class="ic" viewBox="0 0 20 20"><use href="#i-settings"/></svg> Metas e comissões</button></div>
  </nav>`;

const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const regua = meses.map((m, i) => `<button type="button" aria-pressed="${i === 10}" class="${i >= 8 ? "tem" : ""}">${m}<i></i></button>`).join("");

const html = `<title>Metas e Comissões</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap">
<style>
${css}
.mk-cap{font:700 11px/1.3 Inter,sans-serif;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin:22px 0 8px;padding-left:max(16px,env(safe-area-inset-left,0px));max-width:90ch}
.shell.mk-shell{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0 max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px));min-height:0}
.mk-side{height:auto;position:static}
.crm-mt-resumo-4{grid-template-columns:1.3fr 1fr 1fr 1fr}
@media (max-width:980px){.crm-mt-resumo-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
.crm-mt-tab td:first-child{white-space:nowrap}
.crm-mt-tab .crm-mt-campo{width:150px}
.crm-mt-tab .crm-mt-campo.mk-pct{width:92px}
.crm-mt-tab .crm-mt-parte{min-width:120px}
.mk-pct input{text-align:right}
.mk-novo{outline:2px dashed var(--orange);outline-offset:-2px}
@media(max-width:800px){.shell.mk-shell{flex-direction:column}.mk-side{width:auto;flex:none}}
</style>
${sprite}
<div class="mk-cap" style="margin-top:20px;font-size:13px;text-transform:none;letter-spacing:0">Metas e comissões > Mês a mês, com a Angela na lista e as novas colunas % de comissão (campo editável) e Valor da comissão (meta × %). O resto da tela é o que já existe.</div>
<div class="shell mk-shell"><aside class="sidebar mk-side"><div class="brand"><span class="brand-sub">Atacado</span></div>${nav}</aside>
<main class="main">
  <div class="page-head">
    <div><h1>Metas e comissões</h1><div class="sub">Metas da equipe e de cada executivo, com o percentual e o valor da comissão, mês a mês e no ano.</div></div>
    <div class="field crm-meta-ano"><label>Ano</label><select><option>2026</option></select></div>
  </div>
  <div class="crm-mt-abas" role="group" aria-label="Tipo de meta"><button type="button" class="on">Mês a mês</button><button type="button">Anual</button></div>
  <div class="crm-mt-regua" role="group" aria-label="Mês">${regua}</div>
  <div class="crm-mt-regua-rod"><span class="crm-mt-legponto"></span>mês com meta cadastrada <button type="button" class="btn outline small">Copiar de outubro</button></div>

  <div class="crm-mt-resumo crm-mt-resumo-4">
    <div class="crm-mt-bloco"><div class="crm-mt-rot">Meta da equipe em novembro</div>
      <label class="crm-mt-eq"><span>R$</span><input type="text" inputmode="numeric" class="crm-meta-in" value="${inteiro(equipe)}"></label>
      <div class="crm-mt-sub">novembro/2026</div></div>
    <div class="crm-mt-bloco"><div class="crm-mt-rot">Distribuído aos executivos</div><div class="crm-mt-num">R$ ${inteiro(equipe)}</div><div class="crm-mt-sub">100% da meta da equipe</div></div>
    <div class="crm-mt-bloco"><div class="crm-mt-rot">Comissão prevista</div><div class="crm-mt-num">R$ ${brl(totalCom)}</div><div class="crm-mt-sub">se todos baterem a meta</div></div>
    <div class="crm-mt-bloco"><div class="crm-mt-rot">Situação</div><div><span class="crm-mt-estado crm-mt-ok">● Fecha com a equipe</span></div><div class="crm-mt-sub">Pode salvar.</div></div>
  </div>

  <div class="card crm-mt-tab">
    <div class="card-head"><h2>Meta de novembro por executivo</h2><div class="note">A soma das metas individuais tem que bater com a meta da equipe.</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Executivo</th><th>Sistemas</th><th>Meta</th><th>Parte da equipe</th><th>% de comissão</th><th class="num">Valor da comissão</th><th class="num">Meta anual</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="2">Soma das metas individuais</td><td class="mono">R$ ${inteiro(equipe)}</td><td></td><td><span class="crm-selo crm-selo-ok">bate com a equipe</span></td><td class="num mono"><b>R$ ${brl(totalCom)}</b></td><td></td></tr></tfoot>
    </table></div>
    <div class="note" style="margin-top:10px;">Valor da comissão = meta do mês × % de comissão. O percentual vale para o mês escolhido e é o mesmo que a Beth usa no lançamento de faturamento e no Relatório de comissão.</div>
    <div class="crm-mt-acoes">
      <div class="note">Tudo certo para salvar.</div>
      <button type="button" class="btn primary">Salvar metas de novembro</button>
    </div>
  </div>
</main></div>
`;
fs.writeFileSync(path.join(raiz, "mockups", "metas-comissao.html"), html);
console.log("ok", Math.round(html.length / 1024) + " KB");

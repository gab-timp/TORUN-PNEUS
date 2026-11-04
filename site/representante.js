/* ---------------- Página do representante (abre pelo link, sem login) ---------------- */
/* O código do link vem depois do "#" do endereço (o navegador não manda essa parte ao servidor). A função
   crm_painel_representante_link (sql/crm_representante_link.sql) devolve o painel daquele representante, ou nada quando o
   link foi trocado ou desativado. Os números e a tabela são os mesmos do painel dentro do sistema (crm-representante.js). */

const SUPABASE_URL = "https://ypygfgpqaupnjsjxgjfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aLmz08KOlT7P7e_Ae4-AEw_aaWpTyKz";
// sem guardar sessão: o link vale por si só, mesmo que alguém esteja logado no sistema neste navegador
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SISTEMA_NOME = { atacado: "Atacado", encomenda: "Encomenda" };
const repEstado = { codigo: "", mes: "", pedido: 0 };

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const formatMoney = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const rotuloMes = (mes) => `${MESES_NOME[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const diaMes = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

function listaMeses() {
  const h = new Date();
  let a = h.getFullYear(), m = h.getMonth() + 1;
  const r = [];
  for (let i = 0; i < 12; i++) {
    r.push(`${a}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return r;
}

function mostrarAviso(texto) {
  document.getElementById("repMesCampo").style.display = "none";
  document.getElementById("repTitulo").textContent = "Painel do representante";
  document.getElementById("repSub").textContent = "";
  document.getElementById("repCorpo").innerHTML = `<div class="card"><div class="empty-state">${texto}</div></div>`;
}

async function carregar() {
  const meses = listaMeses();
  if (!repEstado.mes || !meses.includes(repEstado.mes)) repEstado.mes = meses[0];
  const campo = document.getElementById("repMes");
  campo.innerHTML = meses.map(m => `<option value="${m}" ${m === repEstado.mes ? "selected" : ""}>${rotuloMes(m)}</option>`).join("");
  const pedido = ++repEstado.pedido;
  const { data, error } = await sb.rpc("crm_painel_representante_link", { p_codigo: repEstado.codigo, p_mes: repEstado.mes + "-01" });
  if (pedido !== repEstado.pedido) return;
  if (error) { mostrarAviso("Não foi possível abrir o painel agora. Tente de novo em instantes."); return; }
  if (!data) { mostrarAviso("Este link não vale mais. Peça um novo link ao seu executivo."); return; }
  desenhar(data);
}

function desenhar(d) {
  document.getElementById("repMesCampo").style.display = "";
  const primeiro = String(d.nome || d.representante || "").trim().split(/\s+/)[0] || "";
  document.getElementById("repTitulo").textContent = `Olá, ${primeiro}`;
  document.getElementById("repSub").textContent = `${SISTEMA_NOME[d.sistema] || ""} · seu faturamento e a sua comissão, só com o que é seu.`;
  const clientes = d.clientes || [];
  const lanc = d.lancamentos || [];
  const fatTotal = clientes.reduce((t, c) => t + Number(c.faturado), 0);
  const comTotal = clientes.reduce((t, c) => t + Number(c.comissao), 0);
  const comFat = clientes.filter(c => Number(c.faturado) > 0).length;
  const pctTxt = d.percentual === null || d.percentual === undefined ? "—" : String(d.percentual).replace(".", ",") + "%";
  const maxSerie = Math.max(1, ...(d.serie || []).map(x => Number(x.faturado)));
  const linhasCli = clientes.length ? clientes.map(c => `
      <tr><td>${escapeHtml(c.cliente)}</td><td class="num mono">${formatMoney(c.faturado)}</td><td class="num mono">${d.lancada ? formatMoney(c.comissao) : "—"}</td></tr>`).join("")
    : `<tr><td colspan="3"><div class="empty-state">Nenhum cliente seu com faturamento neste mês.</div></td></tr>`;
  const linhasSerie = (d.serie || []).map(x => {
    const atual = String(x.mes) === String(d.mes);
    return `<tr class="${atual ? "fc-atual" : ""}"><td>${escapeHtml(rotuloMes(String(x.mes).slice(0, 7)))}</td>
      <td><div class="crm-mt-trilho"><i style="display:block;height:100%;width:${Math.round(Number(x.faturado) / maxSerie * 100)}%;background:var(--orange);"></i></div></td>
      <td class="num mono">${formatMoney(x.faturado)}</td><td class="num mono">${Number(x.comissao) ? formatMoney(x.comissao) : "—"}</td></tr>`;
  }).join("");
  const linhasLanc = lanc.length ? lanc.map(l => `
      <tr><td>${diaMes(l.de)} a ${diaMes(l.ate)}</td><td>${escapeHtml(l.cliente)}</td><td class="num mono">${formatMoney(l.valor)}</td></tr>`).join("")
    : `<tr><td colspan="3"><div class="empty-state">Nenhum lançamento neste mês ainda.</div></td></tr>`;
  document.getElementById("repCorpo").innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Faturamento do mês</div><div class="val">${formatMoney(fatTotal)}</div>
        <div class="kpi-sub">${comFat} ${comFat === 1 ? "cliente" : "clientes"} · ${lanc.length} ${lanc.length === 1 ? "lançamento" : "lançamentos"}</div></div>
      <div class="kpi"><div class="lbl">Percentual de comissão</div><div class="val">${pctTxt}</div>
        <div class="kpi-sub">${d.lancada ? "definido para este mês" : "ainda não definido para este mês"}</div></div>
      <div class="kpi accent"><div class="lbl">Comissão do mês</div><div class="val">${d.lancada ? formatMoney(comTotal) : "—"}</div>
        <div class="kpi-sub">${d.lancada ? `acumulado no ano: ${escapeHtml(formatMoney(d.comissao_ano))}` : "a comissão deste mês ainda não foi lançada"}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Faturamento por cliente</h2><div class="note">${escapeHtml(rotuloMes(repEstado.mes))}</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th class="num">Faturado</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhasCli}</tbody>
        ${clientes.length ? `<tfoot><tr class="fc-total"><td>Total</td><td class="num mono">${formatMoney(fatTotal)}</td><td class="num mono">${d.lancada ? formatMoney(comTotal) : "—"}</td></tr></tfoot>` : ""}
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Mês a mês</h2><div class="note">Últimos 6 meses</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th>Faturamento</th><th class="num">Faturado</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhasSerie}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Lançamentos de ${escapeHtml(rotuloMes(repEstado.mes).toLowerCase())}</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Período</th><th>Cliente</th><th class="num">Valor</th></tr></thead>
        <tbody>${linhasLanc}</tbody>
      </table></div>
    </div>`;
}

(function iniciar() {
  repEstado.codigo = (location.hash || "").replace(/^#/, "").trim();
  if (repEstado.codigo.length < 32) { mostrarAviso("Este link não vale mais. Peça um novo link ao seu executivo."); return; }
  document.getElementById("repMes").addEventListener("change", (e) => { repEstado.mes = e.target.value; carregar(); });
  carregar();
})();

const SUPABASE_URL = "https://ypygfgpqaupnjsjxgjfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_aLmz08KOlT7P7e_Ae4-AEw_aaWpTyKz";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function formatDateBR(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function renderTimeline(eventos) {
  if (!eventos || eventos.length === 0) {
    return `<div class="rst-vazio">Ainda não há atualização de rastreio pra esse pedido.</div>`;
  }
  return eventos.map((ev, i) => {
    const atual = i === eventos.length - 1;
    const ehUltimo = i === eventos.length - 1;
    return `
    <div class="rst-ev">
      <div class="rst-ev-trilha">
        <div class="rst-ev-ponto${atual ? " atual" : ""}"></div>
        ${ehUltimo ? "" : `<div class="rst-ev-linha"></div>`}
      </div>
      <div class="rst-ev-corpo">
        <div class="rst-ev-texto${atual ? " atual" : ""}">${escapeHtml(ev.texto)}</div>
        <div class="rst-ev-data">${formatDateTimeBR(ev.ocorrido_em)}</div>
      </div>
    </div>`;
  }).join("");
}

function renderResultado(pedido) {
  const el = document.getElementById("rstResultado");
  const eventos = pedido.eventos || [];
  const statusAtual = eventos.length ? eventos[eventos.length - 1].texto : "Em processamento";
  const dataPrevista = formatDateBR(pedido.data_prevista);

  el.innerHTML = `
    <div class="rst-card">
      <div class="rst-card-topo">
        <div>
          <div class="rst-card-nf-lbl">Nota fiscal</div>
          <div class="rst-card-nf">${escapeHtml(pedido.numero_nf)}</div>
        </div>
        <span class="rst-pill">${escapeHtml(statusAtual)}</span>
      </div>
      <div class="rst-divisor"></div>
      <div>
        <div class="rst-cliente">${escapeHtml(pedido.cliente || "—")}</div>
        ${pedido.destino ? `<div class="rst-destino">${escapeHtml(pedido.destino)}</div>` : ""}
      </div>
      ${dataPrevista ? `<div class="rst-prevista">Previsão de entrega: <b>${dataPrevista}</b></div>` : ""}
    </div>
    <div class="rst-linha-titulo">Linha do tempo</div>
    <div class="rst-timeline">${renderTimeline(eventos)}</div>
  `;
}

function renderNaoEncontrado() {
  document.getElementById("rstResultado").innerHTML = `
    <div class="rst-erro">Não encontramos nenhum pedido com esses dados. Confira o número da NF e o CNPJ/CPF e tente de novo.</div>
  `;
}

function renderErro(msg) {
  document.getElementById("rstResultado").innerHTML = `
    <div class="rst-erro">Não foi possível buscar o rastreio agora. Tente novamente em instantes.</div>
  `;
  console.error("Erro ao buscar rastreio:", msg);
}

async function buscarRastreio(nf, documento) {
  const btn = document.getElementById("rstBtnBuscar");
  const rotuloOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando...";
  document.getElementById("rstResultado").innerHTML = "";
  try {
    const { data, error } = await sb.rpc("buscar_rastreio_publico", { p_nf: nf, p_documento: documento });
    if (error) { renderErro(error.message); return; }
    if (!data || data.length === 0) { renderNaoEncontrado(); return; }
    renderResultado(data[0]);
  } catch (err) {
    renderErro(err.message || err);
  } finally {
    btn.disabled = false;
    btn.textContent = rotuloOriginal;
  }
}

document.getElementById("rstForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nf = document.getElementById("rstNf").value.trim();
  const documento = document.getElementById("rstDocumento").value.trim();
  if (!nf || !documento) return;
  buscarRastreio(nf, documento);
});

const nfDaUrl = new URLSearchParams(location.search).get("nf");
if (nfDaUrl) document.getElementById("rstNf").value = nfDaUrl;

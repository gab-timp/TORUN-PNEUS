/* ---------------- CRM: editar o cliente e trocar o executivo (botões da ficha) ---------------- */
/* "Editar cliente": nome, tipo e representante, pela função crm_editar_cliente. A gestão e o administrador editam qualquer
   cliente; o executivo, só os da própria carteira. Prospect vira cliente pelo botão que já existia (Tornar cliente efetivo).
   "Trocar executivo": só gestão e administrador, pela função crm_trocar_executivo. O banco confere tudo (sql/crm_editar_cliente.sql)
   e registra cada mudança em crm_cliente_mudancas, que a ficha mostra em "Mudanças registradas". */

let crmEdCarteiraId = null;
let crmEdTipo = "cliente";
let crmTrocCarteiraId = null;

function crmPodeEditarCliente(c) {
  return crmPodeGerirCarteira() && crmTipoDe(c.cliente) !== "representante" && (!crmEhExecutivo() || c.executivoId === crmMeuId());
}
function crmPodeTrocarExecutivo(c) {
  return crmPapelEfetivo() === "gestao" && crmPodeEscrever() && crmTipoDe(c.cliente) !== "representante";
}

// depois de uma mudança: recarrega o CRM e limpa o que as telas de faturamento guardaram com o nome antigo
async function crmEdDepoisDeMudar() {
  ["crmFat", "crmRel", "crmDash"].forEach(n => { try { const o = window[n] || (0, eval)(n); if (o && o.cache) o.cache.clear(); } catch (err) { /* tela ainda não carregada */ } });
  await crmCarregar(true);
  crmRender();
}

/* ---------------- editar cliente ---------------- */

function crmEdMostrarTipo(tipo) {
  crmEdTipo = tipo;
  document.getElementById("crmEdTipoCli").setAttribute("aria-pressed", String(tipo === "cliente"));
  document.getElementById("crmEdTipoPros").setAttribute("aria-pressed", String(tipo === "prospect"));
}

function crmAbrirEditarCliente(carteiraId) {
  const c = crmCarteiraPorId(carteiraId);
  if (!c || !crmPodeEditarCliente(c)) return;
  crmEdCarteiraId = carteiraId;
  const tipoAtual = crmEhProspect(c.cliente) ? "prospect" : "cliente";
  document.getElementById("crmEdNome").value = c.cliente;
  crmEdMostrarTipo(tipoAtual);
  const bloqueado = tipoAtual === "prospect"; // prospect vira cliente pelo botão "Tornar cliente efetivo"
  document.getElementById("crmEdTipoCli").disabled = bloqueado;
  document.getElementById("crmEdTipoPros").disabled = bloqueado;
  document.getElementById("crmEdTipoDica").textContent = bloqueado
    ? "Para tornar este prospect cliente efetivo use o botão “Tornar cliente efetivo” da ficha."
    : "Cliente só volta a prospect se nunca teve faturamento lançado.";
  const rep = crmRepresentanteDe(c.cliente) || "";
  const nomes = crmRepresentantesDoSistema(c.sistema).map(x => x.cliente).sort((a, b) => a.localeCompare(b));
  if (rep && !nomes.includes(rep)) nomes.push(rep);
  document.getElementById("crmEdRep").innerHTML = `<option value="">Sem representante</option>` + nomes.map(n => `<option value="${escapeAttr(n)}" ${n === rep ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");
  document.getElementById("crmEdRepCampo").style.display = crmState.representantesDisponivel ? "" : "none";
  document.getElementById("crmEdErro").style.display = "none";
  document.getElementById("crmEdOverlay").classList.add("show");
  document.getElementById("crmEdNome").focus();
}

function crmFecharEditarCliente() {
  document.getElementById("crmEdOverlay").classList.remove("show");
  crmEdCarteiraId = null;
}

async function crmSalvarEditarCliente() {
  const c = crmCarteiraPorId(crmEdCarteiraId);
  if (!c) return;
  const erro = document.getElementById("crmEdErro");
  const nome = document.getElementById("crmEdNome").value.replace(/\s+/g, " ").trim();
  if (!nome) { erro.textContent = "Informe o nome do cliente."; erro.style.display = "block"; return; }
  const tipoAtual = crmEhProspect(c.cliente) ? "prospect" : "cliente";
  const repAtual = crmRepresentanteDe(c.cliente) || "";
  const rep = crmState.representantesDisponivel ? document.getElementById("crmEdRep").value : repAtual;
  if (nome === c.cliente && crmEdTipo === tipoAtual && rep === repAtual) { crmFecharEditarCliente(); toast("Nada mudou."); return; }
  const botao = document.getElementById("crmEdSalvar");
  botao.disabled = true;
  const { error } = await sb.rpc("crm_editar_cliente", { p_cliente: c.cliente, p_nome: nome, p_tipo: crmEdTipo, p_representante: rep || null });
  botao.disabled = false;
  if (error) { erro.textContent = "Não foi possível salvar: " + error.message; erro.style.display = "block"; return; }
  crmFecharEditarCliente();
  await crmEdDepoisDeMudar();
  toast("Cliente atualizado.");
}

/* ---------------- trocar executivo ---------------- */

async function crmAbrirTrocarExecutivo(carteiraId) {
  const c = crmCarteiraPorId(carteiraId);
  if (!c || !crmPodeTrocarExecutivo(c)) return;
  crmTrocCarteiraId = carteiraId;
  document.getElementById("crmTrocSub").textContent = `${c.cliente} hoje está com ${c.executivoNome || "—"} no ${CRM_SISTEMAS[c.sistema]}.`;
  document.getElementById("crmTrocErro").style.display = "none";
  const sel = document.getElementById("crmTrocExec");
  sel.innerHTML = `<option value="">Carregando…</option>`;
  document.getElementById("crmTrocOverlay").classList.add("show");
  const { data, error } = await sb.rpc("crm_executivos", { p_sistema: c.sistema });
  if (crmTrocCarteiraId !== carteiraId) return;
  const lista = error ? [] : (data || []).filter(r => r.user_id !== c.executivoId);
  sel.innerHTML = lista.length
    ? `<option value="">Selecione…</option>` + lista.map(r => `<option value="${escapeAttr(r.user_id)}">${escapeHtml(r.nome)}</option>`).join("")
    : `<option value="">Nenhum outro executivo no ${escapeHtml(CRM_SISTEMAS[c.sistema])}</option>`;
}

function crmFecharTrocarExecutivo() {
  document.getElementById("crmTrocOverlay").classList.remove("show");
  crmTrocCarteiraId = null;
}

async function crmSalvarTrocarExecutivo() {
  const c = crmCarteiraPorId(crmTrocCarteiraId);
  if (!c) return;
  const erro = document.getElementById("crmTrocErro");
  const exec = document.getElementById("crmTrocExec").value;
  if (!exec) { erro.textContent = "Escolha o novo executivo."; erro.style.display = "block"; return; }
  const botao = document.getElementById("crmTrocSalvar");
  botao.disabled = true;
  const { error } = await sb.rpc("crm_trocar_executivo", { p_sistema: c.sistema, p_cliente: c.cliente, p_executivo: exec });
  botao.disabled = false;
  if (error) { erro.textContent = "Não foi possível trocar: " + error.message; erro.style.display = "block"; return; }
  crmFecharTrocarExecutivo();
  await crmEdDepoisDeMudar();
  toast("Executivo trocado.");
}

/* ---------------- mudanças registradas (bloco da ficha) ---------------- */

const CRM_ED_CAMPO = { nome: "Nome", tipo: "Tipo", representante: "Representante", executivo: "Executivo" };

async function crmFichaMudancasCarregar(c) {
  const alvo = document.getElementById("crmFichaMudancas");
  if (!alvo) return;
  const { data, error } = await sb.from("crm_cliente_mudancas").select("*").eq("cliente", c.cliente).order("quando", { ascending: false });
  const atual = document.getElementById("crmFichaMudancas");
  if (error || !(data || []).length || !atual || crmUi.fichaId !== c.id) return; // sem SQL ou sem mudanças: o bloco não aparece
  atual.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Mudanças registradas</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Quando</th><th>O que mudou</th><th>Quem</th></tr></thead>
        <tbody>${data.map(m => `<tr>
          <td><span class="mono">${formatDateBR(crmDiaLocal(m.quando))}</span> <span class="muted sv-sub">${crmHoraLocal(m.quando)}</span></td>
          <td>${escapeHtml(CRM_ED_CAMPO[m.campo] || m.campo)}${m.sistema ? ` (${escapeHtml(CRM_SISTEMAS[m.sistema] || m.sistema)})` : ""}: ${escapeHtml(m.de || "nenhum")} → <b>${escapeHtml(m.para || "nenhum")}</b></td>
          <td>${escapeHtml(m.por_nome || "—")}</td></tr>`).join("")}</tbody></table></div>
    </div>`;
}

function crmEditarInit() {
  const g = (id) => document.getElementById(id);
  if (!g("crmEdOverlay")) return;
  g("crmEdCancelar").addEventListener("click", crmFecharEditarCliente);
  g("crmEdSalvar").addEventListener("click", crmSalvarEditarCliente);
  g("crmEdTipoCli").addEventListener("click", () => crmEdMostrarTipo("cliente"));
  g("crmEdTipoPros").addEventListener("click", () => crmEdMostrarTipo("prospect"));
  g("crmTrocCancelar").addEventListener("click", crmFecharTrocarExecutivo);
  g("crmTrocSalvar").addEventListener("click", crmSalvarTrocarExecutivo);
}

// Cria de propósito 4 diferenças entre Atacado e Encomenda numa CÓPIA do projeto e confirma que o teste de igualdade falha em cada uma.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const raiz = path.join(__dirname, '..');

function copia() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'par-'));
  fs.mkdirSync(path.join(t, 'site'));
  fs.mkdirSync(path.join(t, 'sql'));
  fs.readdirSync(path.join(raiz, 'site')).filter(f => /\.(js|html)$/.test(f)).forEach(f => fs.copyFileSync(path.join(raiz, 'site', f), path.join(t, 'site', f)));
  fs.readdirSync(path.join(raiz, 'sql')).filter(f => /^crm_.*\.sql$/.test(f)).forEach(f => fs.copyFileSync(path.join(raiz, 'sql', f), path.join(t, 'sql', f)));
  return t;
}
const casos = [
  ['volta o kanban só para o Atacado', 'site/crm.js', 'function crmTemKanban() { return true; }', 'function crmTemKanban() { return crmSistemaAtual() === "atacado"; }'],
  ['um filtro novo só para o Encomenda', 'site/crm-dashboard.js', 'function crmDashEhGestao', 'function crmDashEhGestao'],
  ['regra por sistema no SQL', 'sql/crm_faturamento.sql', "if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then", "if p_sistema = 'encomenda' then null; end if;\n  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then"],
  ['descrição do cartão de entrada diferente', 'site/index.html', 'CRM e follow-up dos executivos de encomenda: clientes, ligações e kanban da carteira.', 'CRM e follow-up dos executivos de encomenda: clientes e ligações.']
];
let pegos = 0;
for (const [nome, arq, de, para] of casos) {
  const t = copia();
  const f = path.join(t, arq);
  let s = fs.readFileSync(f, 'utf8');
  if (nome.startsWith('um filtro novo')) {
    // insere uma linha nova com decisão por sistema no começo do arquivo
    s = 'const _desvio = (c) => c.sistema === "encomenda" ? 1 : 0;\n' + s;
  } else {
    if (!s.includes(de)) { console.log('NÃO ACHEI o trecho: ' + nome); continue; }
    s = s.replace(de, () => para);
  }
  fs.writeFileSync(f, s);
  // o runner usa SITE_DIR = <copia>/site e lê ../sql
  const r = spawnSync(process.execPath, [path.join(raiz, 'testes', 'rodar.js')], { env: { ...process.env, SITE_DIR: path.join(t, 'site') }, encoding: 'utf8' });
  const falhou = r.status !== 0;
  const linha = (r.stdout.split('\n').find(l => l.includes('✗') && /igualdade|decisão|SQL do CRM|cartões|Atacado e Encomenda/.test(l)) || '').trim();
  console.log((falhou ? 'PEGOU   ' : 'NÃO PEGOU ') + nome + (falhou ? '  -> ' + linha : ''));
  if (falhou) pegos++;
  fs.rmSync(t, { recursive: true, force: true });
}
console.log('\nO teste de igualdade pegou ' + pegos + ' de ' + casos.length + ' diferenças criadas de propósito.');

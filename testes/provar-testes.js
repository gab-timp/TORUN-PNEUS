// Estraga de propósito 5 contas numa CÓPIA do código e roda os testes nela: cada estrago tem que fazer algum teste falhar.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const raiz = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
fs.readdirSync(path.join(raiz, 'site')).filter(f => f.endsWith('.js')).forEach(f => fs.copyFileSync(path.join(raiz, 'site', f), path.join(tmp, f)));
const mutacoes = [
  ['app.js', 'if (saldo <= 0) return "esgotado";', 'if (saldo < 0) return "esgotado";', 'estoque: saldo 0 deixa de ser esgotado'],
  ['app.js', 'const resto = centavos(cheio - pago);', 'const resto = (cheio - pago);', 'baixa de parcela: perde o arredondamento de centavos'],
  ['app.js', 'item.valorTotal = item.quantidade * item.valorUnitario * (1 - (item.desconto || 0) / 100);', 'item.valorTotal = item.quantidade * item.valorUnitario;', 'pedido: total ignora o desconto'],
  ['crm-faturamento.js', 'else if (/^\\d{1,3}(\\.\\d{3})+$/.test(t)) t = t.replace(/\\./g, "");', '', 'faturamento: "7.400" deixa de ser 7400'],
  ['crm-dashboard.js', 'if (x.mes <= mes) v = x.pct; else break;', 'if (x.mes < mes) v = x.pct; else break;', 'dashboard: % do mês exato deixa de valer']
];
let aplicadas = 0;
for (const [arq, de, para, nome] of mutacoes) {
  const f = path.join(tmp, arq);
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes(de)) { console.log('NÃO ACHEI o trecho a estragar: ' + nome); continue; }
  fs.writeFileSync(f, s.replace(de, () => para));
  // roda os testes só com ESTA mutação (cópia limpa + 1 estrago)
  const unico = fs.mkdtempSync(path.join(os.tmpdir(), 'mut1-'));
  fs.readdirSync(path.join(raiz, 'site')).filter(x => x.endsWith('.js')).forEach(x => fs.copyFileSync(path.join(raiz, 'site', x), path.join(unico, x)));
  fs.writeFileSync(path.join(unico, arq), fs.readFileSync(path.join(unico, arq), 'utf8').replace(de, () => para));
  const r = spawnSync(process.execPath, [path.join(raiz, 'testes', 'rodar.js')], { env: { ...process.env, SITE_DIR: unico }, encoding: 'utf8' });
  const falhou = r.status !== 0;
  const primeira = (r.stdout.split('\n').find(l => l.includes('✗')) || '').trim();
  console.log((falhou ? 'PEGOU   ' : 'NÃO PEGOU ') + nome + (falhou ? '  -> ' + primeira : ''));
  if (falhou) aplicadas++;
  fs.rmSync(unico, { recursive: true, force: true });
}
console.log('\nOs testes pegaram ' + aplicadas + ' de ' + mutacoes.length + ' estragos.');
fs.rmSync(tmp, { recursive: true, force: true });

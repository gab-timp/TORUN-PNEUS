/* Testes automáticos das contas delicadas do sistema (Varejo e CRM).
 *
 * Rodar:  node testes/rodar.js        (na pasta controle-estoque)
 *
 * Sem instalar nada: o arquivo lê o código REAL de site/*.js, recorta só as funções de conta (que não mexem em tela nem em
 * banco) e confere o resultado. Cada teste descreve o comportamento que o sistema TEM hoje; se uma mudança alterar uma conta
 * sem querer, o teste correspondente falha e mostra o valor esperado e o obtido. Se um teste precisar mudar porque a regra
 * mudou de propósito, mude o teste junto com a regra.
 *
 * Como funciona o recorte: cada função de conta é achada pelo nome e vai até a primeira linha que é só "}" na coluna 0.
 * Constantes e funções de uma linha são achadas pela linha inteira. Se uma função for renomeada ou movida, o teste falha
 * com "não achei ..." (aí é só ajustar o nome aqui).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = process.env.SITE_DIR || path.join(__dirname, '..', 'site');
const ler = (arq) => fs.readFileSync(path.join(SITE, arq), 'utf8').replace(/\r\n/g, '\n');

/* ---------------- recorte do código real ---------------- */
function funcao(arq, nome) {
  const s = ler(arq);
  const m = new RegExp('^(?:async )?function ' + nome + '\\(', 'm').exec(s);
  if (!m) throw new Error('não achei a função ' + nome + ' em ' + arq);
  const fim = s.indexOf('\n}\n', m.index);
  if (fim < 0) throw new Error('não achei o fim da função ' + nome + ' em ' + arq);
  return s.slice(m.index, fim + 2);
}
function linha(arq, comeco) {
  const l = ler(arq).split('\n').find(x => x.startsWith(comeco));
  if (!l) throw new Error('não achei a linha "' + comeco + '" em ' + arq);
  return l;
}
function trecho(arq, inicio, fimMarca) {
  const s = ler(arq);
  const a = s.indexOf(inicio);
  if (a < 0) throw new Error('não achei o trecho "' + inicio.slice(0, 40) + '" em ' + arq);
  const b = s.indexOf(fimMarca, a);
  if (b < 0) throw new Error('não achei o fim do trecho "' + inicio.slice(0, 40) + '" em ' + arq);
  return s.slice(a, b + fimMarca.length);
}

/* ---------------- mini framework ---------------- */
let total = 0, falhas = 0;
const falhasLista = [];
function iguais(obtido, esperado, nome) {
  total++;
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a !== b) { falhas++; falhasLista.push(nome + '\n    esperado: ' + b + '\n    obtido:   ' + a); }
}
function proximos(obtido, esperado, nome, tol) {
  total++;
  if (!(Math.abs(obtido - esperado) <= (tol || 1e-9))) { falhas++; falhasLista.push(nome + '\n    esperado: ' + esperado + '\n    obtido:   ' + obtido); }
}
function grupo(titulo, fn) {
  try { fn(); } catch (e) { total++; falhas++; falhasLista.push(titulo + ' (erro ao montar o teste)\n    ' + e.message); }
}

/* contexto com o que as funções recortadas esperam encontrar */
function contexto(extra) {
  const ctx = vm.createContext(Object.assign({ Intl, Math, Date, Number, String, Array, JSON, Map, Set, Object, RegExp, parseInt, parseFloat }, extra || {}));
  const run = (codigo) => vm.runInContext(codigo, ctx);
  return { ctx, run };
}

/* ================================================================ VAREJO (app.js) ================================================================ */
grupo('parcelas', () => {
  const { run } = contexto();
  run(funcao('app.js', 'parseParcelasNum') + '\n' + funcao('app.js', 'mediaParcelasDe'));
  const p = (x) => run('parseParcelasNum(' + JSON.stringify(x) + ')');
  iguais(p('3'), 3, 'parcelas: "3" vira 3');
  iguais(p('3x'), 3, 'parcelas: "3x" vira 3');
  iguais(p('12X'), 12, 'parcelas: "12X" vira 12');
  iguais(p(' 6 x'), 6, 'parcelas: espaços são aceitos');
  iguais(p('0'), null, 'parcelas: zero não vale');
  iguais(p('PIX'), null, 'parcelas: PIX não vale');
  iguais(p(''), null, 'parcelas: vazio não vale');
  iguais(p(null), null, 'parcelas: nulo não vale');
  iguais(p('30 dias'), null, 'parcelas: "30 dias" não vale (não é número de parcelas)');
  iguais(run('mediaParcelasDe([{parcelas:"2"},{parcelas:"4"},{parcelas:""},{parcelas:"PIX"}])'), { media: 3, qtd: 2 }, 'média de parcelas ignora PIX e vazio');
  iguais(run('mediaParcelasDe([{parcelas:""},{parcelas:"PIX"}])'), { media: null, qtd: 0 }, 'média de parcelas sem nenhuma válida');
  iguais(run('mediaParcelasDe([])'), { media: null, qtd: 0 }, 'média de parcelas de lista vazia');
});

grupo('estoque', () => {
  const { run } = contexto();
  run('let ESTOQUE_BAIXO_LIMITE = 20;' + linha('app.js', 'const ESTOQUE_ATENCAO_MARGEM') + '\n' + funcao('app.js', 'statusEstoque'));
  const st = (n) => run('statusEstoque(' + n + ')');
  iguais(st(0), 'esgotado', 'estoque: saldo 0 é esgotado');
  iguais(st(-5), 'esgotado', 'estoque: saldo negativo é esgotado');
  iguais(st(19), 'baixo', 'estoque: 19 (limite 20) é baixo');
  iguais(st(20), 'atencao', 'estoque: 20 (no limite) é atenção');
  iguais(st(24), 'atencao', 'estoque: 24 é atenção');
  iguais(st(25), 'normal', 'estoque: 25 (limite + margem) é normal');
  run('ESTOQUE_BAIXO_LIMITE = 50');
  iguais(st(49), 'baixo', 'estoque: respeita o limite configurado (50)');
  iguais(st(55), 'normal', 'estoque: respeita o limite configurado (55 = 50 + 5)');
});

grupo('formatos e datas', () => {
  const { run } = contexto({ todayISO: () => '2026-11-03' });
  run(funcao('app.js', 'formatMoney') + '\n' + funcao('app.js', 'formatDateBR') + '\n' + funcao('app.js', 'diasDesde') + '\n' + funcao('app.js', 'dataMaisDias') + '\n' + funcao('app.js', 'normalizarProcesso'));
  const brl = (n) => String(run('formatMoney(' + n + ')')).replace(/ /g, ' ');
  iguais(brl(1234.5), 'R$ 1.234,50', 'formatMoney: milhar e centavos');
  iguais(brl(0), 'R$ 0,00', 'formatMoney: zero');
  iguais(brl(null), 'R$ 0,00', 'formatMoney: nulo vira zero');
  iguais(brl(-10), '-R$ 10,00', 'formatMoney: negativo');
  iguais(run('formatDateBR("2026-11-03")'), '03/11/2026', 'formatDateBR: dia/mês/ano');
  iguais(run('formatDateBR("")'), '—', 'formatDateBR: vazio');
  iguais(run('diasDesde("2026-10-30")'), 4, 'diasDesde: 4 dias atrás');
  iguais(run('diasDesde("2026-11-03")'), 0, 'diasDesde: hoje é 0');
  iguais(run('diasDesde("2026-11-04")'), -1, 'diasDesde: amanhã é -1');
  iguais(run('diasDesde("2026-10-30T15:00:00")'), 4, 'diasDesde: ignora a hora');
  iguais(run('dataMaisDias("2026-10-30", 5)'), '2026-11-04', 'dataMaisDias: vira o mês');
  iguais(run('dataMaisDias("2026-12-31", 1)'), '2027-01-01', 'dataMaisDias: vira o ano');
  iguais(run('dataMaisDias("2028-02-28", 1)'), '2028-02-29', 'dataMaisDias: ano bissexto');
  iguais(run('dataMaisDias("2026-03-01", -1)'), '2026-02-28', 'dataMaisDias: para trás, fevereiro');
  iguais(run('dataMaisDias("2026-10-30", 30)'), '2026-11-29', 'dataMaisDias: +30 dias (vencimento sugerido)');
  iguais(run('normalizarProcesso("  AbC ")'), 'abc', 'normalizarProcesso: minúscula e sem espaços');
  iguais(run('normalizarProcesso(null)'), '', 'normalizarProcesso: nulo');
});

grupo('contas a receber (parcelas)', () => {
  const { run } = contexto();
  run(funcao('app.js', 'partesEmAbertoDaVenda') + '\n' + funcao('app.js', 'saldoEmAbertoDaVenda') + '\n' + funcao('app.js', 'aplicarPagamentoNasParcelas'));
  iguais(run('saldoEmAbertoDaVenda({statusPagamento:"em_aberto", valorVenda:1000})'), 1000, 'saldo: venda sem parcelas em aberto');
  iguais(run('saldoEmAbertoDaVenda({statusPagamento:"pago", valorVenda:1000})'), 0, 'saldo: venda paga não deve nada');
  iguais(run('saldoEmAbertoDaVenda({parcelasDetalhe:[{valor:300,status:"pago"},{valor:300,status:"em_aberto"},{valor:400,status:"em_aberto"}]})'), 700, 'saldo: soma só as parcelas em aberto');
  iguais(run('saldoEmAbertoDaVenda({parcelasDetalhe:[{valor:300,status:"pago"}]})'), 0, 'saldo: todas as parcelas pagas');
  iguais(run('partesEmAbertoDaVenda({statusPagamento:"em_aberto", valorVenda:50, dataVencimento:"2026-11-10"})'), [{ valor: 50, vencimento: '2026-11-10', numero: null }], 'partes: venda inteira com vencimento');
  // baixa de parcelas: pagamento total, parcial (divide) e sem pagamento
  const base = '[{numero:1,valor:100,status:"em_aberto",vencimento:"2026-11-10"},{numero:2,valor:100,status:"em_aberto",vencimento:"2026-12-10"}]';
  const total = run('aplicarPagamentoNasParcelas(' + base + ', new Map([[0, 100]]), "2026-11-03")');
  iguais(total.novas.map(p => [p.numero, p.valor, p.status]), [[1, 100, 'pago'], [2, 100, 'em_aberto']], 'baixa: pagar a parcela inteira só a marca como paga');
  iguais(total.divididas, [], 'baixa: pagamento total não divide');
  const parcial = run('aplicarPagamentoNasParcelas(' + base + ', new Map([[0, 40]]), "2026-11-03")');
  iguais(parcial.novas.map(p => [p.numero, p.valor, p.status]), [[1, 40, 'pago'], [2, 60, 'em_aberto'], [3, 100, 'em_aberto']], 'baixa: pagamento parcial divide a parcela e renumera');
  iguais(parcial.divididas, [{ numero: 1, cheio: 100, pago: 40, resto: 60 }], 'baixa: informa a parcela dividida');
  iguais(parcial.novas[0].dataPagamento, '2026-11-03', 'baixa: grava a data do pagamento');
  iguais(parcial.novas[1].dataPagamento, null, 'baixa: o resto continua sem data de pagamento');
  const centavos = run('aplicarPagamentoNasParcelas([{numero:1,valor:0.3,status:"em_aberto"}], new Map([[0, 0.1]]), "2026-11-03")');
  iguais(centavos.novas.map(p => p.valor), [0.1, 0.2], 'baixa: centavos não acumulam erro de ponto flutuante (0,3 - 0,1 = 0,2)');
});

grupo('pedido: valores dos itens ao editar (correção de 03/11/2026)', () => {
  const codigo = trecho('app.js', 'const itensOriginaisDisponiveis = editingPedidoId', '      itens.push(item);\n    }\n');
  const montar = (original, linhas, editando) => {
    const rows = linhas.map(l => ({ querySelector: (q) => ({ value: q === '.item-produto' ? l.c : q === '.item-qtd' ? l.q : (l.p || '') }) }));
    const { run, ctx } = contexto({ state: { entregas: editando ? [{ id: 'p1', itens: original }] : [] }, editingPedidoId: editando ? 'p1' : null, rows, toast: () => {} });
    return run('(function(){ const state = this.state; ' + codigo + '\n return itens; }).call(this)'.replace('this.state', 'globalThis.state'));
  };
  const orig = [{ codigo: 'A', quantidade: 10, processo: 'P1', valorUnitario: 100, desconto: 5, valorTotal: 950 }, { codigo: 'B', quantidade: 4, processo: null, valorUnitario: 200, desconto: 0, valorTotal: 800 }];
  const a = montar(orig, [{ c: 'A', q: '10', p: 'P1' }, { c: 'B', q: '4' }], true);
  iguais([a[0].valorUnitario, a[0].desconto, a[0].valorTotal, a[1].valorTotal], [100, 5, 950, 800], 'pedido: editar sem mexer nos itens preserva os valores');
  const b = montar(orig, [{ c: 'B', q: '4' }, { c: 'C', q: '2' }], true);
  iguais([b[0].codigo, b[0].valorUnitario, b[1].codigo, b[1].valorUnitario], ['B', 200, 'C', undefined], 'pedido: reordenar, remover e adicionar mantém cada valor no item certo');
  const c = montar([{ codigo: 'A', quantidade: 1, valorUnitario: 10, valorTotal: 10 }, { codigo: 'A', quantidade: 1, valorUnitario: 20, valorTotal: 20 }], [{ c: 'A', q: '1' }, { c: 'A', q: '1' }], true);
  iguais([c[0].valorUnitario, c[1].valorUnitario], [10, 20], 'pedido: o mesmo código em duas linhas não embaralha os valores');
  const d = montar([], [{ c: 'A', q: '3', p: 'X' }], false);
  iguais([d[0].valorUnitario, d[0].processo], [undefined, 'X'], 'pedido novo: sem valor, com processo');
  iguais(montar([{ codigo: 'A', quantidade: 10, valorUnitario: 1000, desconto: 0, valorTotal: 10000 }], [{ c: 'A', q: '8' }], true)[0].valorTotal, 8000, 'pedido: mudar a quantidade recalcula o total (sem desconto)');
  iguais(montar([{ codigo: 'A', quantidade: 10, valorUnitario: 100, desconto: 5, valorTotal: 950 }], [{ c: 'A', q: '20' }], true)[0].valorTotal, 1900, 'pedido: mudar a quantidade recalcula o total (com desconto de 5%)');
  iguais(montar([{ codigo: 'A', quantidade: 10 }], [{ c: 'A', q: '3' }], true)[0].valorTotal, undefined, 'pedido: item sem valor continua sem valor');
  iguais(montar([{ codigo: 'A', quantidade: 10, valorUnitario: 100, desconto: 5, valorTotal: 950 }], [{ c: 'A', q: '10' }], true)[0].valorTotal, 950, 'pedido: mesma quantidade mantém o total');
});

/* ================================================================ CRM ================================================================ */
grupo('CRM: números e formatos', () => {
  const { run } = contexto({ todayISO: () => '2026-10-30' });
  run(funcao('crm.js', 'crmNumMeta') + '\n' + funcao('crm.js', 'crmFmtInteiro') + '\n' + funcao('crm.js', 'crmPct') + '\n' + funcao('crm.js', 'crmMesRel'));
  iguais(run('crmNumMeta("R$ 1.700.000")'), 1700000, 'meta: "R$ 1.700.000" vira 1700000');
  iguais(run('crmNumMeta("")'), 0, 'meta: vazio é zero');
  iguais(run('crmNumMeta("abc")'), 0, 'meta: texto sem número é zero');
  iguais(String(run('crmFmtInteiro(1700000)')).replace(/ /g, ' '), '1.700.000', 'crmFmtInteiro: milhar com ponto');
  iguais(run('crmFmtInteiro(0)'), '0', 'crmFmtInteiro: zero');
  iguais(run('crmPct(40.24)'), '40,2%', 'crmPct: uma casa decimal com vírgula');
  iguais(run('crmPct(100)'), '100,0%', 'crmPct: cem por cento');
  iguais(run('crmMesRel(0)'), '2026-10', 'crmMesRel: mês atual');
  iguais(run('crmMesRel(-1)'), '2026-09', 'crmMesRel: mês anterior');
  iguais(run('crmMesRel(-10)'), '2025-12', 'crmMesRel: atravessa o ano para trás');
  iguais(run('crmMesRel(3)'), '2027-01', 'crmMesRel: atravessa o ano para frente');
});

grupo('CRM: faturamento da Beth', () => {
  const { run } = contexto();
  run(funcao('crm-faturamento.js', 'crmFatLerValor') + '\n' + linha('crm-faturamento.js', 'const crmFatArred') + '\n' + linha('crm-faturamento.js', 'const crmFatUltimoDia') + '\n' + linha('crm-faturamento.js', 'const crmFatData') + '\n' + linha('crm-faturamento.js', 'const crmFatDM'));
  const v = (t) => run('crmFatLerValor(' + JSON.stringify(t) + ')');
  iguais(v('7.400'), 7400, 'valor: "7.400" é sete mil e quatrocentos (ponto de milhar)');
  iguais(v('7,4'), 7.4, 'valor: "7,4" é sete e quarenta centavos');
  iguais(v('7.4'), 7.4, 'valor: "7.4" é decimal');
  iguais(v('13.500,00'), 13500, 'valor: "13.500,00"');
  iguais(v('R$ 13.500,00'), 13500, 'valor: aceita R$ e espaço');
  iguais(v('1.234.567,89'), 1234567.89, 'valor: milhões');
  iguais(v(''), 0, 'valor: vazio é zero');
  iguais(v('abc'), null, 'valor: texto é inválido');
  iguais(v('-5'), null, 'valor: negativo é inválido');
  proximos(run('crmFatArred(2.675)'), 2.68, 'arredonda 2,675 para 2,68');
  proximos(run('crmFatArred(1.005)'), 1.01, 'arredonda 1,005 para 1,01');
  proximos(run('crmFatArred(0.1 + 0.2)'), 0.3, 'arredonda 0,1 + 0,2 para 0,3');
  iguais(run('crmFatUltimoDia("2026-02")'), 28, 'último dia de fevereiro de 2026');
  iguais(run('crmFatUltimoDia("2028-02")'), 29, 'último dia de fevereiro de 2028 (bissexto)');
  iguais(run('crmFatUltimoDia("2026-10")'), 31, 'último dia de outubro');
  iguais(run('crmFatData("2026-10", 5)'), '2026-10-05', 'data com zero à esquerda');
  iguais(run('crmFatDM("2026-10-07")'), '07/10', 'dia/mês curto');
  // comissão = total do cliente no mês x % do executivo (a conta usada na tela e no relatório)
  proximos(run('crmFatArred(13500 * 1.5 / 100)'), 202.5, 'comissão: 1,5% de 13.500');
  proximos(run('crmFatArred(7400 * 1.8 / 100)'), 133.2, 'comissão: 1,8% de 7.400');
});

grupo('CRM: desempenho', () => {
  const { run } = contexto();
  run(funcao('crm-desempenho.js', 'crmDesPct').replace(/^function crmDesPct.*$/m, (l) => l) + '\n' + funcao('crm-desempenho.js', 'crmDesResumo'));
  iguais(run('crmDesPct(3, 4)'), '75%', 'taxa: 3 de 4 é 75%');
  iguais(run('crmDesPct(1, 3)'), '33%', 'taxa: arredonda para inteiro');
  iguais(run('crmDesPct(0, 0)'), '—', 'taxa: divisão por zero vira traço');
  const ligs = '[{resultado:"Não atendeu"},{resultado:"Interesse"},{resultado:"Estimativa enviada"},{resultado:"Fechou negócio"},{resultado:"Fechou negócio"},{resultado:"Sem interesse"},{resultado:"Pediu retorno"}]';
  iguais(run('crmDesResumo(' + ligs + ', 2)'), { total: 7, atenderam: 6, interesse: 2, fecharam: 2, atrasados: 2 }, 'resumo: atenderam = tudo menos "Não atendeu"; interesse = Interesse + Estimativa enviada');
  iguais(run('crmDesResumo([], 0)'), { total: 0, atenderam: 0, interesse: 0, fecharam: 0, atrasados: 0 }, 'resumo: lista vazia');
});

grupo('CRM: dashboard (datas e % de comissão)', () => {
  const { run } = contexto();
  run(linha('crm-dashboard.js', 'const crmDash = ') + '\n' + funcao('crm-dashboard.js', 'crmDashMesAdd') + '\n' + linha('crm-dashboard.js', 'const crmDashDiasMes') + '\n' + funcao('crm-dashboard.js', 'crmDashPct'));
  iguais(run('crmDashMesAdd("2026-10", -1)'), '2026-09', 'mês anterior');
  iguais(run('crmDashMesAdd("2026-01", -1)'), '2025-12', 'mês anterior atravessa o ano');
  iguais(run('crmDashMesAdd("2026-11", 2)'), '2027-01', 'dois meses à frente atravessa o ano');
  iguais(run('crmDashDiasMes("2026-10")'), 31, 'dias de outubro');
  iguais(run('crmDashDiasMes("2026-02")'), 28, 'dias de fevereiro');
  // % de comissão do mês: a linha do mês, ou a mais recente antes dele; sem nenhuma, zero
  run('crmDash.pct = new Map([["e1", [{mes:"2026-01", pct:1.5}, {mes:"2026-06", pct:2}]]])');
  proximos(run('crmDashPct("e1", "2026-01")'), 1.5, '% no mês exato (janeiro)');
  proximos(run('crmDashPct("e1", "2026-03")'), 1.5, '% de um mês sem linha própria herda o último anterior');
  proximos(run('crmDashPct("e1", "2026-06")'), 2, '% vale a partir do mês em que mudou');
  proximos(run('crmDashPct("e1", "2026-12")'), 2, '% mais recente vale nos meses seguintes');
  proximos(run('crmDashPct("e1", "2025-12")'), 0, '% antes da primeira linha é zero');
  proximos(run('crmDashPct("e9", "2026-03")'), 0, '% de executivo sem linha é zero');
});

/* ---------------- resultado ---------------- */
console.log('\n' + (total - falhas) + ' de ' + total + ' conferências passaram.');
if (falhas) {
  console.log('\n' + falhas + ' FALHARAM:\n');
  falhasLista.forEach(f => console.log(' ✗ ' + f + '\n'));
  process.exit(1);
}
console.log('Tudo certo.');

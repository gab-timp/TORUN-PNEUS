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

/* ================================================================ IGUALDADE ENTRE OS SISTEMAS ================================================================
 * Regra do usuário: Atacado e Encomenda ficam sempre de igual para igual. Este grupo falha se aparecer, no código do CRM, uma
 * decisão que trata os dois sistemas de forma diferente. As únicas ocorrências da palavra "atacado"/"encomenda" que passam são
 * as listadas abaixo (nomes dos sistemas, padrão inicial, e o cálculo de "o OUTRO sistema", que serve aos dois lados).
 * Se uma diferença nova for DE PROPÓSITO (decisão de negócio), acrescente a linha na lista permitida com o motivo.
 */
grupo('igualdade Atacado x Encomenda', () => {
  const arquivosCrm = ['crm.js', 'crm-perfil.js', 'crm-faturamento.js', 'crm-desempenho.js', 'crm-dashboard.js', 'crm-metas-visual.js', 'crm-metas-mes.js', 'crm-relatorio.js', 'crm-editar.js'];
  // cada item: o que pode aparecer e por quê (sem comentário no final da linha)
  const permitidas = [
    { re: /^const CRM_SISTEMAS = \{ atacado: "Atacado", encomenda: "Encomenda" \};$/, motivo: 'nomes dos dois sistemas' },
    { re: /^let crmSistemas = \[\];$/, motivo: 'lista de sistemas do executivo' },
    { re: /^const crmUi = \{ sistema: "atacado", /, motivo: 'sistema aberto por padrão, antes de escolher' },
    { re: /^if \(currentUserIsAdmin\) return \["atacado", "encomenda"\];$/, motivo: 'administrador vê os dois' },
    { re: /^return p \? \["atacado", "encomenda"\] : \[\];$/, motivo: 'gestão e financeiro veem os dois' },
    { re: /^if \(!vis\.includes\(crmUi\.sistema\)\) crmUi\.sistema = vis\[0\] \|\| "atacado";$/, motivo: 'volta ao primeiro sistema visível' },
    { re: /\? "encomenda" : "atacado"/, motivo: 'cálculo do OUTRO sistema (levar cliente), serve aos dois lados' }
  ];
  const palavra = /["'`](?:atacado|encomenda)["'`]|\bAtacado\b|\bEncomenda\b/;
  const desvios = [];
  for (const arq of arquivosCrm) {
    let emBloco = false;
    ler(arq).split('\n').forEach((bruta, i) => {
      let t = bruta.trim();
      if (emBloco) { if (t.includes('*/')) emBloco = false; return; }
      if (t.startsWith('/*')) { if (!t.includes('*/')) emBloco = true; return; }
      if (t.startsWith('//') || t.startsWith('*')) return;
      t = t.replace(/\s\/\/.*$/, '').trim(); // comentário no fim da linha
      if (!palavra.test(t)) return;
      if (!permitidas.some(p => p.re.test(t))) desvios.push(arq + ':' + (i + 1) + '  ' + t.slice(0, 110));
    });
  }
  iguais(desvios, [], 'CRM: nenhuma decisão trata Atacado e Encomenda de forma diferente (achados: ' + desvios.length + ')');
  if (desvios.length) falhasLista.push('Onde apareceu uma diferença nova entre os sistemas:\n    ' + desvios.join('\n    ') + '\n    Se for de propósito, acrescente a linha em "permitidas" (testes/rodar.js) com o motivo.');

  // o mesmo no SQL do CRM: nenhuma regra por sistema além de "o outro sistema"
  const sqlDir = path.join(SITE, '..', 'sql');
  const sqlDesvios = [];
  if (fs.existsSync(sqlDir)) {
    fs.readdirSync(sqlDir).filter(f => /^crm_.*\.sql$/.test(f)).forEach(f => {
      fs.readFileSync(path.join(sqlDir, f), 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((ln, i) => {
        const t = ln.trim();
        if (t.startsWith('--')) return;
        const cod = t.replace(/\s--.*$/, '');
        if (/(=|<>|!=)\s*'(atacado|encomenda)'|'(atacado|encomenda)'\s*(=|<>)|when\s+'(atacado|encomenda)'/i.test(cod)
            && !/case when \w+ = 'atacado' then 'encomenda' else 'atacado' end/i.test(cod)) sqlDesvios.push(f + ':' + (i + 1) + '  ' + cod.slice(0, 110));
      });
    });
  }
  iguais(sqlDesvios, [], 'SQL do CRM: nenhuma regra trata Atacado e Encomenda de forma diferente');
  if (sqlDesvios.length) falhasLista.push('Diferença nova entre os sistemas no SQL:\n    ' + sqlDesvios.join('\n    '));

  // tela de entrada: os dois cartões dizem a mesma coisa (só muda o nome do sistema) e o menu do CRM é um só
  const html = ler('index.html');
  const desc = (nome) => { const m = new RegExp('data-sistema="' + nome + '"[^]*?sistema-card-desc">([^<]*)<').exec(html); return m ? m[1] : null; };
  const norm = (t, nome) => (t || '').toLowerCase().replace(new RegExp(nome, 'g'), '<sistema>');
  iguais(norm(desc('atacado'), 'atacado'), norm(desc('encomenda'), 'encomenda'), 'cartões de entrada: Atacado e Encomenda têm a mesma descrição (só muda o nome)');
  iguais((html.match(/id="navCrm"/g) || []).length, 1, 'menu: existe um único menu de CRM para os dois sistemas');
  iguais((html.match(/\sid="[^"]*(?:Atacado|Encomenda)[^"]*"/g) || []).length, 0, 'telas: nenhum elemento do CRM é exclusivo de um dos sistemas (id com o nome do sistema)');
});

grupo('Sem Venda: custo unitário por item e valor investido', () => {
  const { run } = contexto();
  run('const svState = { previsoes: [] };\n' + funcao('semvenda.js', 'svCustoDoProcesso') + '\n' + funcao('semvenda.js', 'svResumoValor') + '\n' + funcao('semvenda.js', 'svNotaSemCusto'));
  const custo = (p) => run('svCustoDoProcesso(' + JSON.stringify(p) + ')');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 400, custoUnitario: 1180 }, { codigo: 'B', quantidade: 240, custoUnitario: 1000 }], custoTotal: null }),
    { total: 712000, temCusto: true, itensSemCusto: 0, antigo: false }, 'custo do processo: soma quantidade x custo unitário de cada item');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 400, custoUnitario: 1180 }, { codigo: 'B', quantidade: 240 }], custoTotal: null }),
    { total: 472000, temCusto: true, itensSemCusto: 1, antigo: false }, 'custo do processo: item sem custo fica fora da soma e é contado');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 10, custoUnitario: 0 }], custoTotal: null }),
    { total: 0, temCusto: true, itensSemCusto: 0, antigo: false }, 'custo do processo: custo unitário zero vale (não é "sem custo")');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 400 }, { codigo: 'B', quantidade: 240 }], custoTotal: 486000 }),
    { total: 486000, temCusto: true, itensSemCusto: 0, antigo: true }, 'processo antigo: sem custo unitário vale o custo total antigo');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 400, custoUnitario: 1000 }], custoTotal: 486000 }),
    { total: 400000, temCusto: true, itensSemCusto: 0, antigo: false }, 'processo antigo: com custo unitário, o unitário vale no lugar do total antigo');
  iguais(custo({ itens: [{ codigo: 'A', quantidade: 400 }], custoTotal: null }),
    { total: 0, temCusto: false, itensSemCusto: 1, antigo: false }, 'sem custo nenhum: não tem custo');

  const resumo = (previsoes, arm) => { run('svState.previsoes = ' + JSON.stringify(previsoes)); return run('svResumoValor(' + (arm === undefined ? '' : JSON.stringify(arm)) + ')'); };
  const base = (extra) => Object.assign({ status: 'FINALIZADO', armazem: 'Nguedes', custoForaDoInvestido: false, custoTotal: null, itens: [] }, extra);
  iguais(resumo([base({ itens: [{ quantidade: 10, custoUnitario: 100 }] }), base({ itens: [{ quantidade: 5, custoUnitario: 200 }] })]),
    { total: 2000, temCusto: true, semCusto: 0 }, 'valor investido: soma dos processos finalizados');
  iguais(resumo([base({ itens: [{ quantidade: 10, custoUnitario: 100 }] }), base({ status: 'EM_AGUA', itens: [{ quantidade: 5, custoUnitario: 200 }] })]),
    { total: 1000, temCusto: true, semCusto: 0 }, 'valor investido: processo que ainda não chegou não entra');
  iguais(resumo([base({ itens: [{ quantidade: 10, custoUnitario: 100 }], custoForaDoInvestido: true })]),
    { total: 0, temCusto: false, semCusto: 0 }, 'valor investido: processo marcado "não considerar" fica fora, sem aviso');
  iguais(resumo([base({ itens: [{ quantidade: 10, custoUnitario: 100 }, { quantidade: 4 }] })]),
    { total: 1000, temCusto: true, semCusto: 1 }, 'valor investido: processo com item sem custo soma o que tem e entra no aviso');
  iguais(resumo([base({ itens: [{ quantidade: 10 }], custoTotal: 5000 })]),
    { total: 5000, temCusto: true, semCusto: 0 }, 'valor investido: processo antigo com custo total segue contando, sem aviso');
  iguais(resumo([base({ itens: [{ quantidade: 10, custoUnitario: 100 }] }), base({ armazem: 'RF', itens: [{ quantidade: 1, custoUnitario: 50 }] })], 'RF'),
    { total: 50, temCusto: true, semCusto: 0 }, 'valor investido: por armazém só soma os processos dele');
});

grupo('acesso: sistemas disponíveis e chave do Torun (Varejo)', () => {
  const sistemas = (o) => {
    const { run } = contexto(Object.assign({ currentUserIsAdmin: false, crmRepresentante: null }, o));
    run(funcao('semvenda.js', 'sistemasDisponiveis'));
    return run('sistemasDisponiveis()');
  };
  const base = { temAcessoVarejo: () => true, temAcessoSemVenda: () => false, crmSistemasVisiveis: () => [] };
  iguais(sistemas(base), ['varejo'], 'sistemas: quem só tem o Torun vê só o Torun');
  iguais(sistemas(Object.assign({}, base, { temAcessoSemVenda: () => true, crmSistemasVisiveis: () => ['atacado', 'encomenda'] })),
    ['varejo', 'semvenda', 'encomenda', 'atacado'], 'sistemas: com tudo liberado, a ordem dos cartões é Torun, Sem Venda, Encomenda, Atacado');
  iguais(sistemas(Object.assign({}, base, { temAcessoVarejo: () => false, crmSistemasVisiveis: () => ['atacado'] })),
    ['atacado'], 'sistemas: com o Torun desligado o cartão do Varejo some');
  iguais(sistemas(Object.assign({}, base, { temAcessoVarejo: () => false, temAcessoSemVenda: () => true, crmSistemasVisiveis: () => ['encomenda'] })),
    ['semvenda', 'encomenda'], 'sistemas: sem o Torun, ficam os outros sistemas da pessoa');
  iguais(sistemas(Object.assign({}, base, { temAcessoVarejo: () => false })),
    ['varejo'], 'sistemas: sem nenhum sistema liberado não deixa a pessoa numa tela vazia (volta ao Torun)');
  iguais(sistemas(Object.assign({}, base, { crmRepresentante: 'Ricardo', crmSistemasVisiveis: () => ['atacado'] })),
    ['atacado'], 'sistemas: login de representante abre só o sistema dele');
});

grupo('sub-representantes da venda', () => {
  const { run } = contexto();
  run(['subsDaVenda', 'participantesVenda', 'comissaoTotalVenda', 'mesmoNomeRep', 'vendaTemRepresentante', 'participacaoDe',
    'linhasPorRepresentante', 'textoRepresentantes', 'valorSubDe'].map(n => funcao('app.js', n)).join('\n'));
  const venda = 'const venda = { vendedor: "Marcos Teixeira", comissaoPercentual: 2.5, comissao: 1300, valorVenda: 52000,' +
    ' subRepresentantes: [{ nome: "Ana Paula Reis", pct: 0.5, valor: 260 }] };' +
    'const antiga = { vendedor: "Rogério Lima", comissaoPercentual: 3, comissao: 552, valorVenda: 18400 };';
  run(venda);
  iguais(run('subsDaVenda(antiga)'), [], 'sub: venda antiga (sem a coluna) não tem sub-representante');
  iguais(run('comissaoTotalVenda(antiga)'), 552, 'sub: venda antiga mantém a comissão que já tinha');
  iguais(run('comissaoTotalVenda(venda)'), 1560, 'sub: comissão total soma principal e sub');
  iguais(run('participantesVenda(venda).map(p => [p.nome, p.comissao, p.principal])'),
    [['Marcos Teixeira', 1300, true], ['Ana Paula Reis', 260, false]], 'sub: principal vem primeiro, cada um com a sua comissão');
  iguais(run('vendaTemRepresentante(venda, " ana paula reis ")'), true, 'sub: acha o sub sem diferenciar maiúscula nem espaço');
  iguais(run('vendaTemRepresentante(venda, "Rogério Lima")'), false, 'sub: quem não está na venda não aparece');
  iguais(run('vendaTemRepresentante(antiga, "")'), false, 'sub: nome vazio nunca casa');
  iguais(run('participacaoDe(venda, "Ana Paula Reis").comissao'), 260, 'sub: a parte do sub é só a dele');
  iguais(run('participacaoDe(venda, "Ninguém")'), null, 'sub: quem não participa não tem parte');
  iguais(run('textoRepresentantes(venda)'), 'Marcos Teixeira + Ana Paula Reis', 'sub: texto da busca lista os dois');
  iguais(run('textoRepresentantes(antiga)'), 'Rogério Lima', 'sub: venda comum mostra só o representante');
  iguais(run('linhasPorRepresentante([venda, antiga]).map(l => [l.nome, l.comissao])'),
    [['Marcos Teixeira', 1300], ['Ana Paula Reis', 260], ['Rogério Lima', 552]], 'sub: uma linha por representante em cada venda');
  iguais(run('linhasPorRepresentante([{ vendedor: "", comissao: 0, comissaoPercentual: 0 }]).map(l => l.nome)'),
    ['(sem representante)'], 'sub: venda sem representante cai em "(sem representante)"');
  iguais(run('valorSubDe(52000, 0.5)'), 260, 'sub: 0,5% de 52.000 = 260');
  iguais(run('valorSubDe(1000, 0.333)'), 3.33, 'sub: arredonda em centavos');
});

/* ---------------- resultado ---------------- */
console.log('\n' + (total - falhas) + ' de ' + total + ' conferências passaram.');
if (falhas) {
  console.log('\n' + falhas + ' FALHARAM:\n');
  falhasLista.forEach(f => console.log(' ✗ ' + f + '\n'));
  process.exit(1);
}
console.log('Tudo certo.');

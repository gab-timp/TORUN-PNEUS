import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("../", import.meta.url));
const ler = (f) => fs.readFileSync(DIR + f, "utf8");
const fonte = fs.readFileSync(DIR + "testes/teste_motor.mjs", "utf8");
const SCHEMA = fonte.split("const SCHEMA = `")[1].split("`;")[0];

let passou = 0, falhas = 0;
const ok = (c, m) => { if (c) { passou++; console.log("  ok   " + m); } else { falhas++; console.log("  FALHA " + m); } };

const blocos = (txt) => txt.split(/^-- -{10,} BLOCO .*$/m).slice(1);
const db = new PGlite();
await db.exec(SCHEMA);

console.log("== 01_levantamento: cada bloco roda");
const b01 = blocos(ler("01_levantamento.sql"));
ok(b01.length === 6, "6 blocos encontrados");
const r01 = [];
for (let i = 0; i < b01.length; i++) {
  try { const r = await db.query(b01[i]); r01.push(r.rows); ok(true, `bloco ${i + 1}: ${r.rows.length} linha(s)`); }
  catch (e) { ok(false, `bloco ${i + 1}: ${e.message}`); }
}
ok(r01[0] && r01[0].length === 3 && r01[0].some(x => x.tabela === "sv_reservas"), "bloco 1 acha as 3 chaves (movimentos, produtos_precos, sv_reservas)");
ok(r01[1] && r01[1].some(x => x.gatilho === "trg_ja_desligado" && x.estado === "DESLIGADO") && r01[1].some(x => x.gatilho === "trg_sincronizar_estoque_pedido" && x.estado === "ligado"), "bloco 2 mostra ligado/DESLIGADO corretamente");
ok(r01[2] && r01[2].some(x => x.tabela === "entregas" && x.coluna === "itens"), "bloco 3 lista entregas.itens");

console.log("\n== 02_backup: bloco A cria, bloco B confere, segunda execução falha de propósito");
const b02 = blocos(ler("02_backup.sql"));
await db.exec(b02[0]);
const conf = (await db.query(b02[1])).rows;
ok(conf.length === 10 && conf.every(x => x.igual === true), "10 tabelas copiadas e iguais");
let falhou = false; try { await db.exec(b02[0]); } catch (e) { falhou = true; }
ok(falhou, "rodar o backup de novo FALHA (não sobrescreve)");
ok((await db.query("select count(*)::int c from pg_class where relname like 'bkp_migcod_%' and relrowsecurity = false and relkind = 'r'")).rows[0].c === 0, "todas as cópias com RLS ligada");

console.log("\n== 03_mapa + motor REAL + 05_verificacao");
await db.exec(ler("03_mapa.sql").split(/^-- -{10,} BLOCO B.*$/m)[0]);
await db.exec("insert into migracao_codigos_mapa (sistema, antigo, novo) values ('torun','A1','N1'),('torun','B2','N2')");
const prev = (await db.query(ler("03_mapa.sql").split(/^-- -{10,} BLOCO C.*$/m)[1])).rows;
ok(prev.length === 2 && prev[0].antigo === "A1" && prev[0].medida === "295/80R22.5" && prev[0].novo_ja_existe === false && Number(prev[0].movimentos) === 3 && Number(prev[0].precos) === 2 && Number(prev[0].itens_em_pedidos) === 1 && Number(prev[0].itens_em_previstos) === 1, "prévia do mapa traz medida, contagens corretas: " + JSON.stringify(prev[0]));
await db.exec("truncate trigger_disparos");
await db.exec(ler("04_migracao_torun.sql").replace("SELECT 'ENSAIO'::text AS modo", "SELECT 'REAL'::text AS modo"));

const b05 = blocos(ler("05_verificacao.sql"));
ok(b05.length === 7, "7 blocos encontrados");
const r05 = [];
for (let i = 0; i < b05.length; i++) {
  try { const r = await db.query(b05[i]); r05.push(r.rows); ok(true, `bloco ${i + 1}: ${r.rows.length} linha(s)`); }
  catch (e) { r05.push(null); ok(false, `bloco ${i + 1}: ${e.message}`); }
}
ok(r05[0] && r05[0].every(x => Number(x.sobrou_codigo_antigo) === 0), "05/1: tudo zero");
ok(r05[1] && Number(r05[1][0].quantos_no_mapa) === 2 && Number(r05[1][0].existem) === 2, "05/2: 2 de 2 novos existem");
ok(r05[2] && r05[2].length === 0, "05/3: nenhum saldo diferente");
ok(r05[3] && r05[3].length === 1 && r05[3][0].codigo === "Z9", "05/4: só o órfão antigo Z9 aparece");
ok(r05[6] && r05[6].every(x => Number(x.sobrou_codigo_antigo) === 0), "05/7: Sem Venda zero");

console.log(`\nRESULTADO: ${passou} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

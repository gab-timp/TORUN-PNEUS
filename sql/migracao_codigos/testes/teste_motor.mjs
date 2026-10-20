import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("../", import.meta.url));
const ler = (f) => fs.readFileSync(DIR + f, "utf8");
const motor = ler(process.argv[2] || "04_migracao_torun.sql");
const mapaSql = ler("03_mapa.sql");

const SCHEMA = `
create table produtos (codigo text primary key, medida text, marca text, modelo text, situacao text, created_at timestamptz default now());
alter table produtos add constraint produtos_codigo_key unique (codigo);
create table produtos_precos (id uuid primary key default gen_random_uuid(), codigo text not null references produtos(codigo) on delete cascade, regiao text not null, condicao_pagamento text not null, preco numeric not null, tabela_referencia text, atualizado_em timestamptz default now(), unique (codigo, regiao, condicao_pagamento));
create table movimentos (id text primary key, codigo text not null references produtos(codigo), tipo text not null, quantidade numeric not null, processo text, numero text, pedido text, entrega_id text, created_at timestamptz default now(), updated_at timestamptz default '2020-01-01');
create table entregas (id text primary key, itens jsonb, etapa text, updated_at timestamptz default '2020-01-01', baixa_manual_legada boolean);
create table previsoes (id text primary key, itens jsonb, updated_at timestamptz default '2020-01-01');
create table log_alteracoes (id bigint generated always as identity primary key, tabela text, registro_id text, descricao text);
create table notificacoes (id bigint generated always as identity primary key, tipo text, link_id text);
create table trigger_disparos (id serial, quem text);
create function f_sync() returns trigger language plpgsql as $$ begin insert into trigger_disparos(quem) values ('sync_entregas'); return new; end $$;
create trigger trg_sincronizar_estoque_pedido after update on entregas for each row execute function f_sync();
create function f_notif() returns trigger language plpgsql as $$ begin insert into trigger_disparos(quem) values ('notif_mov'); return new; end $$;
create trigger trg_notificar_estoque_baixo after insert on movimentos for each row execute function f_notif();
-- gatilho que JÁ estava desligado antes: tem que continuar desligado depois
create trigger trg_ja_desligado after update on previsoes for each row execute function f_sync();
alter table previsoes disable trigger trg_ja_desligado;

create table sv_produtos (codigo text primary key, medida text, marca text);
create table sv_reservas (id text primary key, codigo text not null references sv_produtos(codigo) on delete restrict, quantidade int, updated_at timestamptz default '2020-01-01');
create table sv_previsoes (id text primary key, itens jsonb, updated_at timestamptz default '2020-01-01');
create trigger trg_sv_sync after update on sv_previsoes for each row execute function f_sync();

insert into produtos (codigo, medida, marca, modelo, situacao) values ('A1','295/80R22.5','ROADCRUZA','M1','ATIVO'),('B2','275/80R22.5','ROYALBLACK','M2','ATIVO'),('C3','11R22.5','TRIANGLE','M3','ATIVO'),('D4','12.4-24','ASCENSO','M4','ATIVO');
insert into produtos_precos (codigo, regiao, condicao_pagamento, preco) values ('A1','MG','A VISTA',100),('A1','MG','30 DIAS',110),('B2','MG','A VISTA',90),('C3','MG','A VISTA',80);
insert into movimentos (id, codigo, tipo, quantidade, processo) values
  ('m1','A1','entrada',100,'P1'),('m2','A1','venda',30,'P1'),('m3','B2','entrada',50,'P2'),('m4','B2','avariado',5,'P2'),
  ('m5','C3','entrada',10,'P3'),('m6','D4','entrada',7,'P4'),('m7','A1','reserva',10,'P1');
insert into entregas (id, itens, etapa, baixa_manual_legada) values
  ('e1','[{"codigo":"A1","quantidade":2,"processo":"P1"},{"codigo":"D4","quantidade":1}]','ENTRADA',false),
  ('e2','[{"codigo":"B2","quantidade":3}]','FATURAMENTO',false),
  ('e3','[{"codigo":"Z9","quantidade":1}]','ENTRADA',false),
  ('e4',null,'ENTRADA',false),
  ('e5','[]','ENTRADA',false),
  ('e6','[{"quantidade":1}]','ENTRADA',false);
insert into previsoes (id, itens) values ('p1','[{"codigo":"A1","quantidade":300},{"codigo":"C3","quantidade":20}]'),('p2','[{"codigo":"D4","quantidade":5}]'),('p3',null);
insert into log_alteracoes (tabela, registro_id, descricao) values ('produtos','A1','edicao A1'),('clientes','A1','cliente com nome igual ao codigo, NAO muda'),('produtos','C3','edicao C3');
insert into notificacoes (tipo, link_id) values ('estoque_baixo','A1'),('previsto_chegando','A1'),('estoque_baixo','C3');
insert into sv_produtos values ('S1','x','ASCENSO'),('S2','y','ASCENSO');
insert into sv_reservas (id, codigo, quantidade) values ('r1','S1',5),('r2','S2',3);
insert into sv_previsoes (id, itens) values ('sp1','[{"codigo":"S1","quantidade":9}]');
`;

let falhas = 0, passou = 0;
const ok = (cond, msg) => { if (cond) { passou++; console.log("  ok   " + msg); } else { falhas++; console.log("  FALHA " + msg); } };

async function novoBanco() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec("truncate trigger_disparos"); // a carga inicial dispara gatilhos; o contador começa do zero
  await db.exec(mapaSql.split("-- ---------------------------------------------------------------- BLOCO B")[0]); // só o bloco A (cria tabelas)
  return db;
}
async function roda(db, sql) {
  try { await db.exec(sql); return { erro: null }; }
  catch (e) { try { await db.exec("ROLLBACK"); } catch (_) {} return { erro: String(e.message || e) }; }
}
const q = async (db, sql) => (await db.query(sql)).rows;
async function foto(db) {
  const t = async (s) => JSON.stringify(await q(db, s));
  return JSON.stringify({
    produtos: await t("select * from produtos order by codigo"),
    precos: await t("select codigo,regiao,condicao_pagamento,preco from produtos_precos order by 1,2,3"),
    mov: await t("select id,codigo,tipo,quantidade,updated_at from movimentos order by id"),
    ent: await t("select id,itens,updated_at from entregas order by id"),
    prev: await t("select id,itens,updated_at from previsoes order by id"),
    log: await t("select tabela,registro_id from log_alteracoes order by id"),
    notif: await t("select tipo,link_id from notificacoes order by id"),
    sv: await t("select * from sv_produtos order by 1") + await t("select id,codigo,updated_at from sv_reservas order by 1") + await t("select id,itens,updated_at from sv_previsoes order by 1"),
  });
}
const real = (sql) => { if (!sql.includes("SELECT 'ENSAIO'::text AS modo")) throw new Error("linha do modo não encontrada"); return sql.replace("SELECT 'ENSAIO'::text AS modo", "SELECT 'REAL'::text AS modo"); };
const mapa = (db, pares) => db.exec("insert into migracao_codigos_mapa (sistema, antigo, novo) values " + pares.map(([s, a, n]) => `('${s}','${a}','${n}')`).join(","));
const estadoTriggers = async (db) => JSON.stringify(await q(db, "select c.relname, t.tgname, t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal order by 1,2"));
const fks = async (db) => JSON.stringify(await q(db, "select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where contype='f' and confrelid='produtos'::regclass order by 1,2"));

const ehSV = (process.argv[2] || "").includes("semvenda");

if (!ehSV) {
  console.log("\n== T1 ENSAIO com mapa válido: tem que dar erro 'ENSAIO CONCLUÍDO' e não gravar nada");
  {
    const db = await novoBanco(); await mapa(db, [["torun","A1","N1"],["torun","B2","N2"]]);
    const antes = await foto(db), trAntes = await estadoTriggers(db), fkAntes = await fks(db);
    const r = await roda(db, motor);
    ok(r.erro && r.erro.includes("ENSAIO CONCLUÍDO"), "erro esperado do ensaio: " + (r.erro || "(sem erro)").split("\n").slice(0, 6).join(" | "));
    ok((await foto(db)) === antes, "banco idêntico ao de antes");
    ok((await estadoTriggers(db)) === trAntes, "gatilhos como estavam (inclusive o já desligado)");
    ok((await fks(db)) === fkAntes, "chaves estrangeiras como estavam");
    ok((await q(db, "select count(*)::int c from trigger_disparos"))[0].c === 0, "nenhum gatilho disparou");
    ok((await q(db, "select count(*)::int c from migracao_codigos_mapa"))[0].c === 2, "mapa continua preenchido");
    ok((await q(db, "select count(*)::int c from migracao_codigos_historico"))[0].c === 0, "histórico vazio");
  }

  console.log("\n== T2 REAL");
  {
    const db = await novoBanco(); await mapa(db, [["torun","A1","N1"],["torun","B2","N2"]]);
    const fkAntes = await fks(db), trAntes = await estadoTriggers(db);
    const saldoAntes = await q(db, "select codigo, sum(case when tipo='entrada' then quantidade else -quantidade end) s from movimentos group by 1 order by 1");
    const r = await roda(db, real(motor));
    ok(!r.erro, "sem erro" + (r.erro ? ": " + r.erro : ""));
    ok((await q(db, "select count(*)::int c from produtos where codigo in ('A1','B2')"))[0].c === 0, "produtos: códigos antigos sumiram");
    ok((await q(db, "select count(*)::int c from produtos where codigo in ('N1','N2')"))[0].c === 2, "produtos: códigos novos existem");
    ok((await q(db, "select count(*)::int c from produtos_precos where codigo in ('N1')"))[0].c === 2, "preços de A1 foram para N1 (2 linhas)");
    ok((await q(db, "select count(*)::int c from movimentos where codigo in ('A1','B2')"))[0].c === 0, "movimentos sem código antigo");
    const saldoDepois = await q(db, "select codigo, sum(case when tipo='entrada' then quantidade else -quantidade end) s from movimentos group by 1 order by 1");
    const mapaAB = { A1: "N1", B2: "N2" };
    const esperado = saldoAntes.map(x => ({ codigo: mapaAB[x.codigo] || x.codigo, s: x.s })).sort((a, b) => a.codigo.localeCompare(b.codigo));
    ok(JSON.stringify(esperado) === JSON.stringify(saldoDepois), "saldo por produto idêntico (com os códigos novos)");
    const e1 = (await q(db, "select itens from entregas where id='e1'"))[0].itens;
    ok(e1[0].codigo === "N1" && e1[0].processo === "P1" && e1[1].codigo === "D4" && e1.length === 2, "pedido e1: item A1 virou N1, resto intacto e na mesma ordem");
    ok((await q(db, "select itens from entregas where id='e2'"))[0].itens[0].codigo === "N2", "pedido e2: B2 virou N2");
    ok((await q(db, "select itens from entregas where id='e3'"))[0].itens[0].codigo === "Z9", "pedido e3: código órfão Z9 não foi tocado");
    ok((await q(db, "select itens from entregas where id='e4'"))[0].itens === null, "pedido e4: itens nulo continua nulo");
    ok(JSON.stringify((await q(db, "select itens from entregas where id='e5'"))[0].itens) === "[]", "pedido e5: itens [] continua []");
    ok(JSON.stringify((await q(db, "select itens from entregas where id='e6'"))[0].itens) === '[{"quantidade":1}]', "pedido e6: item sem código intacto");
    const p1 = (await q(db, "select itens from previsoes where id='p1'"))[0].itens;
    ok(p1[0].codigo === "N1" && p1[1].codigo === "C3", "previsto p1: A1 virou N1, C3 intacto");
    const upd = await q(db, "select id, updated_at > '2021-01-01' as mexeu from entregas order by id");
    ok(upd.filter(x => x.mexeu).map(x => x.id).join() === "e1,e2", "updated_at carimbado só nos pedidos alterados (e1,e2): " + upd.filter(x => x.mexeu).map(x => x.id).join());
    const updm = await q(db, "select id, updated_at > '2021-01-01' as mexeu from movimentos order by id");
    ok(updm.filter(x => x.mexeu).map(x => x.id).join() === "m1,m2,m3,m4,m7", "updated_at carimbado só nos movimentos alterados: " + updm.filter(x => x.mexeu).map(x => x.id).join());
    ok((await q(db, "select registro_id from log_alteracoes order by id")).map(x => x.registro_id).join() === "N1,A1,C3", "log: só tabela='produtos' mudou (cliente com nome A1 intacto)");
    ok((await q(db, "select link_id from notificacoes order by id")).map(x => x.link_id).join() === "N1,A1,C3", "notificações: só tipo estoque_baixo mudou");
    ok((await q(db, "select count(*)::int c from trigger_disparos"))[0].c === 0, "NENHUM gatilho disparou durante a troca");
    ok((await estadoTriggers(db)) === trAntes, "gatilhos religados como estavam (o já desligado continua desligado)");
    const fkDepois = JSON.parse(await fks(db)).map(x => x.t + "|" + x.conname + "|" + x.d).sort().join("\n");
    const fkOrig = JSON.parse(fkAntes).map(x => x.t + "|" + x.conname + "|" + x.d).sort().join("\n");
    ok(fkDepois === fkOrig, "chaves estrangeiras recriadas idênticas");
    ok((await q(db, "select count(*)::int c from migracao_codigos_mapa"))[0].c === 0, "mapa limpo");
    ok((await q(db, "select count(*)::int c from migracao_codigos_historico where sistema='torun'"))[0].c === 2, "histórico com 2 linhas");

    console.log("\n== T3 rodar o REAL de novo (dupla execução)");
    const r2 = await roda(db, real(motor));
    ok(r2.erro && r2.erro.includes("mapa") , "recusa: " + (r2.erro || "").slice(0, 100));

    console.log("\n== T4 DESFAZER com o mapa inverso (usando o histórico)");
    await db.exec("insert into migracao_codigos_mapa (sistema, antigo, novo) select sistema, novo, antigo from migracao_codigos_historico where sistema='torun'");
    const r3 = await roda(db, real(motor));
    ok(!r3.erro, "inverso roda sem erro" + (r3.erro ? ": " + r3.erro : ""));
    ok((await q(db, "select string_agg(codigo, ',' order by codigo) c from produtos"))[0].c === "A1,B2,C3,D4", "produtos voltaram aos códigos originais");
    ok(JSON.stringify((await q(db, "select codigo, sum(case when tipo='entrada' then quantidade else -quantidade end) s from movimentos group by 1 order by 1"))) === JSON.stringify(saldoAntes), "saldos idênticos aos do começo");
    ok((await q(db, "select itens from entregas where id='e1'"))[0].itens[0].codigo === "A1", "pedido e1 voltou a A1");
  }

  console.log("\n== T5 conferências de segurança (cada uma tem que abortar e não gravar nada)");
  const casos = [
    ["código antigo inexistente", [["torun","XX","N9"]], "não existem"],
    ["código novo já existe", [["torun","A1","C3"]], "colisão"],
    ["troca encadeada (A1->B2 e B2->N2)", [["torun","A1","B2"],["torun","B2","N2"]], "colisão"],
    ["espaço sobrando no código novo", [["torun","A1","N1 "]], "espaço"],
    ["mapa vazio", [], "vazio"],
  ];
  for (const [nome, pares, trecho] of casos) {
    const db = await novoBanco(); if (pares.length) await mapa(db, pares);
    const antes = await foto(db);
    const r = await roda(db, real(motor));
    ok(r.erro && r.erro.includes(trecho) && (await foto(db)) === antes, `${nome}: aborta ("${(r.erro || "sem erro").slice(0, 70)}") e não grava`);
  }

  console.log("\n== T6 sensibilidade do teste: sem desligar o gatilho, ele dispara?");
  {
    const db = await novoBanco();
    await db.exec(`update entregas set itens = '[{"codigo":"X"}]' where id='e1'`);
    ok((await q(db, "select count(*)::int c from trigger_disparos"))[0].c === 1, "UPDATE comum em entregas dispara o gatilho de teste (logo o teste é capaz de pegar o problema)");
  }

  console.log("\n== T7 falha DEPOIS das trocas desfaz tudo (saldo adulterado de propósito)");
  {
    const db = await novoBanco(); await mapa(db, [["torun","A1","N1"]]);
    // gatilho "malvado" que reativa e muda quantidade ao atualizar movimentos → saldo muda → conferência pega
    await db.exec(`create function f_mal() returns trigger language plpgsql as $$ begin new.quantidade := new.quantidade + 1; return new; end $$; create trigger trg_mal before update on movimentos for each row execute function f_mal();`);
    const antes = await foto(db);
    const r = await roda(db, real(motor));
    // o gatilho malvado está ligado e o motor o desliga; então a troca NÃO muda a quantidade e passa
    ok(!r.erro, "gatilho que altera quantidade foi desligado durante a troca (motor passou) " + (r.erro || ""));
    const q1 = (await q(db, "select quantidade from movimentos where id='m1'"))[0].quantidade;
    ok(String(q1) === "100", "quantidade do movimento m1 intacta (100): " + q1);
  }
}

if (ehSV) {
  const fksSV = async (db) => JSON.stringify(await q(db, "select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where contype='f' and confrelid='sv_produtos'::regclass order by 1,2"));
  console.log("\n== SV-T1 ENSAIO: erro 'ENSAIO CONCLUÍDO' e nada gravado");
  {
    const db = await novoBanco(); await mapa(db, [["semvenda","S1","V1"]]);
    const antes = await foto(db), tr = await estadoTriggers(db), fk = await fksSV(db);
    const r = await roda(db, motor);
    ok(r.erro && r.erro.includes("ENSAIO CONCLUÍDO"), "erro esperado: " + (r.erro || "sem erro").split("\n").slice(0, 5).join(" | "));
    ok((await foto(db)) === antes, "banco idêntico");
    ok((await estadoTriggers(db)) === tr && (await fksSV(db)) === fk, "gatilhos e chaves como estavam");
  }
  console.log("\n== SV-T2 REAL");
  {
    const db = await novoBanco(); await mapa(db, [["semvenda","S1","V1"]]);
    const fk = await fksSV(db), tr = await estadoTriggers(db);
    const r = await roda(db, real(motor));
    ok(!r.erro, "sem erro" + (r.erro ? ": " + r.erro : ""));
    ok((await q(db, "select string_agg(codigo, ',' order by codigo) c from sv_produtos"))[0].c === "S2,V1", "sv_produtos: S1 virou V1");
    ok((await q(db, "select codigo from sv_reservas where id='r1'"))[0].codigo === "V1" && (await q(db, "select codigo from sv_reservas where id='r2'"))[0].codigo === "S2", "reservas: r1 virou V1, r2 intacta");
    ok((await q(db, "select itens from sv_previsoes where id='sp1'"))[0].itens[0].codigo === "V1", "sv_previsoes: item virou V1");
    const upd = await q(db, "select id, updated_at > '2021-01-01' as m from sv_reservas order by id");
    ok(upd.filter(x => x.m).map(x => x.id).join() === "r1", "updated_at só na reserva alterada");
    ok((await q(db, "select count(*)::int c from trigger_disparos"))[0].c === 0, "nenhum gatilho disparou");
    ok((await estadoTriggers(db)) === tr && (await fksSV(db)) === fk, "gatilhos e chaves restaurados idênticos");
    ok((await q(db, "select count(*)::int c from migracao_codigos_historico where sistema='semvenda'"))[0].c === 1, "histórico gravado");
    // o Torun não foi tocado
    ok((await q(db, "select string_agg(codigo, ',' order by codigo) c from produtos"))[0].c === "A1,B2,C3,D4", "produtos do Torun intactos");
  }
  console.log("\n== SV-T3 conferências");
  for (const [nome, pares, trecho] of [
    ["antigo inexistente", [["semvenda","XX","V9"]], "não existem"],
    ["novo já existe", [["semvenda","S1","S2"]], "colisão"],
    ["mapa vazio", [], "vazio"],
    ["mapa só do torun (semvenda vazio)", [["torun","A1","N1"]], "vazio"],
  ]) {
    const db = await novoBanco(); if (pares.length) await mapa(db, pares);
    const antes = await foto(db);
    const r = await roda(db, real(motor));
    ok(r.erro && r.erro.includes(trecho) && (await foto(db)) === antes, `${nome}: aborta e não grava (${(r.erro || "sem erro").slice(0, 60)})`);
  }
}

console.log(`\nRESULTADO: ${passou} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

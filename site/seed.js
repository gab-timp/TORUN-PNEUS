const SEED_PRODUTOS = [
  {
    "codigo": "ROADT000001",
    "medida": "295/80R22.5 SL101 154/149M 18PR - ROADTRACK"
  },
  {
    "codigo": "ROADT000002",
    "medida": "295/80R22.5 DV210 154/149M 18PR - ROADTRACK"
  },
  {
    "codigo": "ROADT000003",
    "medida": "275/80R22.5 SL102 18PR149/146M - ROADTRACK"
  },
  {
    "codigo": "ROADT000006",
    "medida": "295/80R22.5 SL102 154/149M 18PR - ROADTRACK"
  },
  {
    "codigo": "ROADT000008",
    "medida": "295/80R22.5 DV211 18PR154/149M - ROADTRACK"
  },
  {
    "codigo": "ROYALB000001",
    "medida": "295/80R22.5 154/149M 18PR SL101 TL- ROYALBLACK"
  },
  {
    "codigo": "ROYALB000002",
    "medida": "295/80R22.5 18PR 154/149M SL102 - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000003",
    "medida": "295/80R22.5 154/149M 18PR DV211 - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000004",
    "medida": "275/80R22.5 18PR 149/146M SL102 - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000005",
    "medida": "275/80R22.5 18PR 149/146M DV211 - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000006",
    "medida": "295/80R22.5 154/149M 18PR DV210 TL- ROYALBLACK"
  },
  {
    "codigo": "ROYALB000007",
    "medida": "295/80R22.5 154/149K DM311 18PR TL-ROYALBLACK"
  },
  {
    "codigo": "ROYALB000008",
    "medida": "295/80R22.5 154/149J DM325 18PR TL -ROYALBLACK"
  },
  {
    "codigo": "ROYALB000009",
    "medida": "315/80R22.5 20PR 157/154L SL101- ROYALBLACK"
  },
  {
    "codigo": "ROYALB000010",
    "medida": "295/80R22.5 154/149M AV210 18PR TL- ROYALBLACK"
  },
  {
    "codigo": "ROYALB000011",
    "medida": "295/80R22.5 154/149M AV211 18 PR - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000012",
    "medida": "275/80R22.5 149/146 M SL101 18PR - ROYALBLACK"
  },
  {
    "codigo": "ROYALB000013",
    "medida": "275/80R22.5 149/146M AV210 18PR - ROYALBLACK"
  },
  {
    "codigo": "TRI000001",
    "medida": "215/75R17.5 16 PR 135/133L TR685 - TRIANGLE"
  },
  {
    "codigo": "TRI000018",
    "medida": "215/75R17.5 16 PR 135/133L TR689A:- TRIANGLE"
  }
];

const SEED_MOVIMENTOS = [
  {
    "tipo": "entrada",
    "codigo": "ROADT000001",
    "quantidade": 126,
    "numero": "2493",
    "processo": "0167-25",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000001",
    "quantidade": 126,
    "numero": "HISTÓRICO",
    "processo": "0167-25",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000001",
    "quantidade": 420,
    "numero": "2495",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000001",
    "quantidade": 4,
    "numero": "3164",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000001",
    "quantidade": 2,
    "numero": "3215",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000001",
    "quantidade": 413,
    "numero": "HISTÓRICO",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000006",
    "quantidade": 104,
    "numero": "2495",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000006",
    "quantidade": 2,
    "numero": "3144",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000006",
    "quantidade": 102,
    "numero": "HISTÓRICO",
    "processo": "0185-25",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000003",
    "quantidade": 100,
    "numero": "2496",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000003",
    "quantidade": 34,
    "numero": "HISTÓRICO",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000001",
    "quantidade": 5,
    "numero": "2496",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000001",
    "quantidade": 5,
    "numero": "HISTÓRICO",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000002",
    "quantidade": 11,
    "numero": "2496",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000002",
    "quantidade": 4,
    "numero": "3164",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000002",
    "quantidade": 7,
    "numero": "HISTÓRICO",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000006",
    "quantidade": 5,
    "numero": "2496",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000006",
    "quantidade": 5,
    "numero": "HISTÓRICO",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROADT000008",
    "quantidade": 40,
    "numero": "2496",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROADT000008",
    "quantidade": 40,
    "numero": "HISTÓRICO",
    "processo": "185-25-2",
    "data": "2025-12-19",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "TRI000001",
    "quantidade": 208,
    "numero": "2394",
    "processo": "0144-25",
    "data": "2025-12-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "TRI000001",
    "quantidade": 208,
    "numero": "HISTÓRICO",
    "processo": "0144-25",
    "data": "2025-12-02",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "TRI000018",
    "quantidade": 140,
    "numero": "2394",
    "processo": "0144-25",
    "data": "2025-12-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "TRI000018",
    "quantidade": 140,
    "numero": "HISTÓRICO",
    "processo": "0144-25",
    "data": "2025-12-02",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 50,
    "numero": "N/D",
    "processo": "0254-25",
    "data": "2026-01-28",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 2,
    "numero": "3214",
    "processo": "0254-25",
    "data": "2026-01-28",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 48,
    "numero": "HISTÓRICO",
    "processo": "0254-25",
    "data": "2026-01-28",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 200,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "3106",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3107",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 26,
    "numero": "3108",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 26,
    "numero": "3109",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 8,
    "numero": "3147",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3150",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3153",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 14,
    "numero": "3160",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 40,
    "numero": "3161",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3183",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "3214",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3215",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3218",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 6,
    "numero": "3219",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 8,
    "numero": "3220",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3225",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 20,
    "numero": "3279",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 1,
    "numero": "3672",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 19,
    "numero": "Retirada Março/2026",
    "processo": "0333-25",
    "data": "2026-03-15",
    "obs": "Saída em lote (mês), sem NF discriminada na planilha"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000004",
    "quantidade": 80,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 2,
    "numero": "3214",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3219",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3225",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 20,
    "numero": "3246",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3258",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3393",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 6,
    "numero": "3471",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 8,
    "numero": "3537",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3586",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 6,
    "numero": "3588",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "3595",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "4095",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000005",
    "quantidade": 32,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 12,
    "numero": "3760",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 20,
    "numero": "3899",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000006",
    "quantidade": 66,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3205",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 60,
    "numero": "Retirada Março/2026",
    "processo": "0333-25",
    "data": "2026-03-15",
    "obs": "Saída em lote (mês), sem NF discriminada na planilha"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000007",
    "quantidade": 40,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 4,
    "numero": "3164",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 4,
    "numero": "3602",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 28,
    "numero": "Retirada Março/2026",
    "processo": "0333-25",
    "data": "2026-03-15",
    "obs": "Saída em lote (mês), sem NF discriminada na planilha"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 4,
    "numero": "Retirada Abril/2026",
    "processo": "0333-25",
    "data": "2026-04-15",
    "obs": "Saída em lote (mês), sem NF discriminada na planilha"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000008",
    "quantidade": 16,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000008",
    "quantidade": 16,
    "numero": "HISTÓRICO",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saídas sem NF discriminada na planilha (retiradas por mês / histórico, mês exato não identificado)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000009",
    "quantidade": 30,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000009",
    "quantidade": 30,
    "numero": "Retirada Março/2026",
    "processo": "0333-25",
    "data": "2026-03-15",
    "obs": "Saída em lote (mês), sem NF discriminada na planilha"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000010",
    "quantidade": 30,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000010",
    "quantidade": 20,
    "numero": "3160",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000010",
    "quantidade": 10,
    "numero": "3225",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000011",
    "quantidade": 30,
    "numero": "2926",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000011",
    "quantidade": 6,
    "numero": "3225",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000011",
    "quantidade": 24,
    "numero": "3620",
    "processo": "0333-25",
    "data": "2026-03-09",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000001",
    "quantidade": 74,
    "numero": "3346",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 4,
    "numero": "3450",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 1,
    "numero": "3672",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 38,
    "numero": "3864",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 6,
    "numero": "3981",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 4,
    "numero": "4097",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 12,
    "numero": "4128",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 4,
    "numero": "4142",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000006",
    "quantidade": 184,
    "numero": "3346",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3378",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 30,
    "numero": "3411",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3450",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 8,
    "numero": "3498",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 100,
    "numero": "3533",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3592",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3597",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 12,
    "numero": "3622",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 16,
    "numero": "3645",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 2,
    "numero": "3692",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000001",
    "quantidade": 262,
    "numero": "3346",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 8,
    "numero": "3498",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 30,
    "numero": "3514",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 30,
    "numero": "3575",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 20,
    "numero": "3644",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 100,
    "numero": "3863",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 20,
    "numero": "3962",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000001",
    "quantidade": 54,
    "numero": "3981",
    "processo": "0333-25-2",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000005",
    "quantidade": 34,
    "numero": "3132",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 12,
    "numero": "3778",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 6,
    "numero": "3860",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 4,
    "numero": "3975",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 4,
    "numero": "3980",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 4,
    "numero": "3988",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000005",
    "quantidade": 4,
    "numero": "4012",
    "processo": "0011-26",
    "data": "2026-04-07",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000010",
    "quantidade": 170,
    "numero": "3350",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000010",
    "quantidade": 70,
    "numero": "3431",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000010",
    "quantidade": 24,
    "numero": "3509",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000010",
    "quantidade": 76,
    "numero": "3599",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000007",
    "quantidade": 60,
    "numero": "3350",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 8,
    "numero": "3430",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 8,
    "numero": "3460",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 8,
    "numero": "3485",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 24,
    "numero": "3509",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 8,
    "numero": "3519",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000007",
    "quantidade": 4,
    "numero": "3601",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000004",
    "quantidade": 294,
    "numero": "3475",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3597",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "3840",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "3860",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 40,
    "numero": "3899",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 2,
    "numero": "3944",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "3962",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 40,
    "numero": "3975",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 30,
    "numero": "3981",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "3988",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 5,
    "numero": "4006",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "4012",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 4,
    "numero": "4011",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 14,
    "numero": "4081",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 50,
    "numero": "4140",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 50,
    "numero": "4141",
    "processo": "3003-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 262,
    "numero": "3476",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 72,
    "numero": "3492",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 6,
    "numero": "3577",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3588",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "3597",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3626",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3686",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 40,
    "numero": "3737",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3780",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 77,
    "numero": "3792",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3858",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3991",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "4006",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "4072",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 19,
    "numero": "4161",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "transferencia",
    "codigo": "ROYALB000002",
    "quantidade": 14,
    "numero": "Transferência",
    "processo": "3004-26",
    "data": "2026-05-06",
    "obs": "Transferência importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000008",
    "quantidade": 24,
    "numero": "3350",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000008",
    "quantidade": 24,
    "numero": "3431",
    "processo": "3029-26",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "N/D",
    "processo": "",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "3361",
    "processo": "",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 2,
    "numero": "N/D",
    "processo": "",
    "data": "2026-04-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 2,
    "numero": "3361",
    "processo": "",
    "data": "2026-04-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 82,
    "numero": "3694",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 2,
    "numero": "3944",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 15,
    "numero": "3984",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 4,
    "numero": "3959",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 8,
    "numero": "3985",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 39,
    "numero": "4129",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 13,
    "numero": "4161",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "avariado",
    "codigo": "ROYALB000002",
    "quantidade": 1,
    "numero": "Avariado",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Avariado importado da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 160,
    "numero": "3694",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 12,
    "numero": "3760",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 48,
    "numero": "3841",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 48,
    "numero": "3860",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "3868",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "3869",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 6,
    "numero": "3944",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "3979",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "3980",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "3991",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "4000",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 8,
    "numero": "4012",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 14,
    "numero": "4068",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000008",
    "quantidade": 14,
    "numero": "3694",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000008",
    "quantidade": 14,
    "numero": "3700",
    "processo": "0333-25-3",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 254,
    "numero": "3719",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 16,
    "numero": "3951",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 46,
    "numero": "3993",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 80,
    "numero": "4061",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 20,
    "numero": "4062",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 48,
    "numero": "4063",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 44,
    "numero": "4068",
    "processo": "3005-26",
    "data": "2026-05-29",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 24,
    "numero": "3684",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 24,
    "numero": "4068",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 14,
    "numero": "3684",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 11,
    "numero": "4132",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000006",
    "quantidade": 40,
    "numero": "3684",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 8,
    "numero": "3845",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "3860",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 8,
    "numero": "3972",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 6,
    "numero": "3992",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 8,
    "numero": "4081",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000006",
    "quantidade": 4,
    "numero": "4154",
    "processo": "3034-26",
    "data": "2026-05-27",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000004",
    "quantidade": 10,
    "numero": "3902",
    "processo": "3003/26",
    "data": "2026-06-17",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000004",
    "quantidade": 6,
    "numero": "4072",
    "processo": "3003/26",
    "data": "2026-06-17",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000008",
    "quantidade": 100,
    "numero": "4098",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000008",
    "quantidade": 4,
    "numero": "4135",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000010",
    "quantidade": 50,
    "numero": "4098",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000002",
    "quantidade": 74,
    "numero": "4098",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 35,
    "numero": "4130",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000002",
    "quantidade": 39,
    "numero": "4132",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000011",
    "quantidade": 50,
    "numero": "4098",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000003",
    "quantidade": 238,
    "numero": "4098",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 30,
    "numero": "4111",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "4109",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 12,
    "numero": "4110",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "4133",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 8,
    "numero": "4153",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 60,
    "numero": "4156",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 8,
    "numero": "4154",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 46,
    "numero": "4167",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "venda",
    "codigo": "ROYALB000003",
    "quantidade": 4,
    "numero": "4158",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Saída importada da planilha ESTOQUE (NF discriminada na coluna)"
  },
  {
    "tipo": "reserva",
    "codigo": "ROYALB000003",
    "quantidade": 12,
    "numero": "PED. 146",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Reserva importada da planilha ESTOQUE"
  },
  {
    "tipo": "reserva",
    "codigo": "ROYALB000003",
    "quantidade": 50,
    "numero": "PED 147",
    "processo": "3060-26-2",
    "data": "2026-07-02",
    "obs": "Reserva importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000012",
    "quantidade": 114,
    "numero": "4136",
    "processo": "3033-26",
    "data": "2026-07-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000004",
    "quantidade": 100,
    "numero": "4136",
    "processo": "3033-26",
    "data": "2026-07-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000013",
    "quantidade": 40,
    "numero": "4136",
    "processo": "3033-26",
    "data": "2026-07-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  },
  {
    "tipo": "entrada",
    "codigo": "ROYALB000005",
    "quantidade": 40,
    "numero": "4136",
    "processo": "3033-26",
    "data": "2026-07-09",
    "obs": "Entrada importada da planilha ESTOQUE"
  }
];

/*
  Dados iniciais de vendas/faturamento importados de "DETALHAMENTO MES DE JUNHO 26.xlsx"
  (aba CONTROLE VAREJO).
*/
const SEED_CLIENTES = [
  {
    "nome": "CACILDA  MACHNICKI HRESKO",
    "estado": "SC",
    "cidade": "PORTO UNIÃO"
  },
  {
    "nome": "CARROCERIAS LINSHALM",
    "estado": "SC",
    "cidade": "TIMBÓ"
  },
  {
    "nome": "CARROCERIAS LINSHALM LTDA",
    "estado": "SC",
    "cidade": "TIMBÓ"
  },
  {
    "nome": "CERAMICA PRINCESA E TRANSPORTES",
    "estado": "SC",
    "cidade": "RIO DO SUL"
  },
  {
    "nome": "CLERIO DOS REIS LIMA",
    "estado": "MG",
    "cidade": "UNAI"
  },
  {
    "nome": "CONSETE TRANSPORTES",
    "estado": "MG",
    "cidade": "SETE LAGOAS"
  },
  {
    "nome": "CRISTIANO RAMOS TRANSP.",
    "estado": "SC",
    "cidade": "ITUPORANGA"
  },
  {
    "nome": "FM PNEUS LTDA",
    "estado": "SP",
    "cidade": "VÁRZEA PAULISTA"
  },
  {
    "nome": "FVMA TRANSPORTES",
    "estado": "MG",
    "cidade": "BELO HORIZONTE"
  },
  {
    "nome": "JPARDIM BRASIL",
    "estado": "SC",
    "cidade": "ITAJAÍ"
  },
  {
    "nome": "NATAN PNEUS",
    "estado": "MT",
    "cidade": "VÁRZEA GRANDE"
  },
  {
    "nome": "ORNELAS RESENDE",
    "estado": "SC",
    "cidade": "CLIENTE RETIRA"
  },
  {
    "nome": "R.A COMERCIO E SERVIÇOS DE PNEUS",
    "estado": "SC",
    "cidade": "NAVEGANTES"
  },
  {
    "nome": "TRANSPOTES JA1000",
    "estado": "SC",
    "cidade": "AGRONOMICA"
  },
  {
    "nome": "TRUCK CENTER TRANSPORTES",
    "estado": "SC",
    "cidade": "TIJUCAS"
  },
  {
    "nome": "W AVILA TRANSPORTES",
    "estado": "SC",
    "cidade": "SETE LAGOAS"
  }
];

const SEED_VENDAS = [
  {
    "data": "2026-07-01",
    "numeroPedido": "1",
    "numeroNFVenda": "4095",
    "numeroNFEntrada": "2926",
    "cliente": "CONSETE TRANSPORTES",
    "quantidadePneus": 4,
    "valorVenda": 6137.2,
    "formaPagamento": "BOLETO TRADEMASTER 30/60",
    "vendedor": "CARLOS",
    "comissao": 117.85,
    "valorFrete": 434.82,
    "transportadora": "PAJUÇARA",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-01",
    "numeroPedido": "135",
    "numeroNFVenda": "4097",
    "numeroNFEntrada": "3346",
    "cliente": "CLERIO DOS REIS LIMA",
    "quantidadePneus": 4,
    "valorVenda": 6548.0,
    "formaPagamento": "CARTAO 6X",
    "vendedor": "ROGÉRIO",
    "comissao": 261.92,
    "valorFrete": 439.82,
    "transportadora": "PAJUÇARA",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-06",
    "numeroPedido": "136",
    "numeroNFVenda": "4109",
    "numeroNFEntrada": "4098",
    "cliente": "TRANSPOTES JA1000",
    "quantidadePneus": 4,
    "valorVenda": 6740.0,
    "formaPagamento": "BOLETO TRADEMASTER 30 DIAS",
    "vendedor": "ROGÉRIO",
    "comissao": 262.5,
    "valorFrete": 168.5,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-06",
    "numeroPedido": "137",
    "numeroNFVenda": "4110",
    "numeroNFEntrada": "4098",
    "cliente": "JPARDIM BRASIL",
    "quantidadePneus": 12,
    "valorVenda": 18600.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 186.0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-06",
    "numeroPedido": "17",
    "numeroNFVenda": "4111",
    "numeroNFEntrada": "4098",
    "cliente": "NATAN PNEUS",
    "quantidadePneus": 30,
    "valorVenda": 53460.0,
    "formaPagamento": "ENTRADA + BOLETO PROPRIO",
    "vendedor": "ALESSANDRO",
    "comissao": 1069.2,
    "valorFrete": 3100.0,
    "transportadora": "CIVARDI",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-08",
    "numeroPedido": "138",
    "numeroNFVenda": "4128",
    "numeroNFEntrada": "3346",
    "cliente": "FVMA TRANSPORTES",
    "quantidadePneus": 12,
    "valorVenda": 18336.0,
    "formaPagamento": "CARTÃO 1X",
    "vendedor": "ROGÉRIO",
    "comissao": 550.08,
    "valorFrete": 970.85,
    "transportadora": "PAJUÇARA",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-08",
    "numeroPedido": "67",
    "numeroNFVenda": "4130",
    "numeroNFEntrada": "4098",
    "cliente": "CARROCERIAS LINSHALM",
    "quantidadePneus": 35,
    "valorVenda": 44800.0,
    "formaPagamento": "BOLETO PROPRIO  14 DIAS",
    "vendedor": "LEONARDO",
    "comissao": 896.0,
    "valorFrete": 1041.92,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-08",
    "numeroPedido": "68",
    "numeroNFVenda": "4129",
    "numeroNFEntrada": "3694",
    "cliente": "CARROCERIAS LINSHALM",
    "quantidadePneus": 39,
    "valorVenda": 49920.0,
    "formaPagamento": "BOLETO PROPRIO 14DIAS",
    "vendedor": "LEONARDO",
    "comissao": 998.4,
    "valorFrete": 1041.92,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-09",
    "numeroPedido": "5",
    "numeroNFVenda": "4132",
    "numeroNFEntrada": "3684-4098",
    "cliente": "ORNELAS RESENDE",
    "quantidadePneus": 50,
    "valorVenda": 64000.0,
    "formaPagamento": "BOLETO PROPRIO 15 DIAS",
    "vendedor": "ANDERSON",
    "comissao": 0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-09",
    "numeroPedido": "140",
    "numeroNFVenda": "4133",
    "numeroNFEntrada": "4098",
    "cliente": "W AVILA TRANSPORTES",
    "quantidadePneus": 4,
    "valorVenda": 6940.0,
    "formaPagamento": "CARTÃO 4X",
    "vendedor": "ROGÉRIO",
    "comissao": 277.6,
    "valorFrete": 173.5,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-09",
    "numeroPedido": "139",
    "numeroNFVenda": "4135",
    "numeroNFEntrada": "4098",
    "cliente": "CRISTIANO RAMOS TRANSP.",
    "quantidadePneus": 4,
    "valorVenda": 7680.0,
    "formaPagamento": "BOLETO TRADEMASTER 30/60/90/120",
    "vendedor": "ROGÉRIO",
    "comissao": 286.44,
    "valorFrete": 192.0,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-10",
    "numeroPedido": "6",
    "numeroNFVenda": "4140",
    "numeroNFEntrada": "3475",
    "cliente": "FM PNEUS LTDA",
    "quantidadePneus": 50,
    "valorVenda": 64000.0,
    "formaPagamento": "PIX",
    "vendedor": "ANDERSON",
    "comissao": 0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-10",
    "numeroPedido": "7",
    "numeroNFVenda": "4141",
    "numeroNFEntrada": "3475",
    "cliente": "FM PNEUS LTDA",
    "quantidadePneus": 50,
    "valorVenda": 64000.0,
    "formaPagamento": "PIX",
    "vendedor": "ANDERSON",
    "comissao": 0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-10",
    "numeroPedido": "141",
    "numeroNFVenda": "4142",
    "numeroNFEntrada": "3346",
    "cliente": "FVMA TRANSPORTES",
    "quantidadePneus": 4,
    "valorVenda": 6236.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 249.44,
    "valorFrete": 423.23,
    "transportadora": "PAJUÇARA",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-14",
    "numeroPedido": "142",
    "numeroNFVenda": "4153",
    "numeroNFEntrada": "4098",
    "cliente": "CACILDA  MACHNICKI HRESKO",
    "quantidadePneus": 8,
    "valorVenda": 13480.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 539.2,
    "valorFrete": 337.0,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-15",
    "numeroPedido": "1",
    "numeroNFVenda": "4156",
    "numeroNFEntrada": "4098",
    "cliente": "TRUCK CENTER TRANSPORTES",
    "quantidadePneus": 60,
    "valorVenda": 81600.0,
    "formaPagamento": "PIX+BOLETO PROPRIO 25DIAS/50",
    "vendedor": "AGNALDO",
    "comissao": 1632.0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-15",
    "numeroPedido": "143",
    "numeroNFVenda": "4154",
    "numeroNFEntrada": "3684/4098",
    "cliente": "R.A COMERCIO E SERVIÇOS DE PNEUS",
    "quantidadePneus": 12,
    "valorVenda": 17680.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 707.2,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-15",
    "numeroPedido": "145",
    "numeroNFVenda": "4158",
    "numeroNFEntrada": "4098",
    "cliente": "CERAMICA PRINCESA E TRANSPORTES",
    "quantidadePneus": 4,
    "valorVenda": 6520.0,
    "formaPagamento": "BOLETO TRADEMASTER 7 DIAS",
    "vendedor": "ROGÉRIO",
    "comissao": 194.41,
    "valorFrete": 163.0,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-16",
    "numeroPedido": "69",
    "numeroNFVenda": "4161",
    "numeroNFEntrada": "3476-3694",
    "cliente": "CARROCERIAS LINSHALM LTDA",
    "quantidadePneus": 32,
    "valorVenda": 40960.0,
    "formaPagamento": "BOLETO PRÓPRIO 14 DIAS",
    "vendedor": "LEONARDO",
    "comissao": 819.2,
    "valorFrete": 1024.0,
    "transportadora": "LR TRANSPORTES",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-17",
    "numeroPedido": "144",
    "numeroNFVenda": "4167",
    "numeroNFEntrada": "4098",
    "cliente": "R.A COMERCIO E SERVIÇOS DE PNEUS",
    "quantidadePneus": 46,
    "valorVenda": 69920.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 2796.8,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-20",
    "numeroPedido": "146",
    "numeroNFVenda": "4196",
    "numeroNFEntrada": "4098",
    "cliente": "JPARDIM BRASIL",
    "quantidadePneus": 12,
    "valorVenda": 18240.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 729.6,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  },
  {
    "data": "2026-07-20",
    "numeroPedido": "147",
    "numeroNFVenda": "4217",
    "numeroNFEntrada": "4098",
    "cliente": "JPARDIM BRASIL",
    "quantidadePneus": 0,
    "valorVenda": 76000.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 3040.0,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx (quantidade não contabilizada no total de pneus vendidos, conforme fórmula original da planilha)"
  },
  {
    "data": "2026-07-21",
    "numeroPedido": "148",
    "numeroNFVenda": "",
    "numeroNFEntrada": "2926/3684",
    "cliente": "R.A COMERCIO E SERVIÇOS DE PNEUS",
    "quantidadePneus": 4,
    "valorVenda": 5560.0,
    "formaPagamento": "PIX",
    "vendedor": "ROGÉRIO",
    "comissao": 222.4,
    "valorFrete": null,
    "transportadora": "Cliente retira",
    "obs": "Importado de DETALHAMENTO MES DE JUNHO 26.xlsx"
  }
];

const SEED_PREVISOES = [
  {
    "numeroProcesso": "0167-25",
    "itens": [
      {
        "codigo": "ROADT000001",
        "quantidade": 126
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0185-25",
    "itens": [
      {
        "codigo": "ROADT000001",
        "quantidade": 420
      },
      {
        "codigo": "ROADT000006",
        "quantidade": 104
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "185-25-2",
    "itens": [
      {
        "codigo": "ROADT000003",
        "quantidade": 100
      },
      {
        "codigo": "ROADT000001",
        "quantidade": 5
      },
      {
        "codigo": "ROADT000002",
        "quantidade": 11
      },
      {
        "codigo": "ROADT000006",
        "quantidade": 5
      },
      {
        "codigo": "ROADT000008",
        "quantidade": 40
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0144-25",
    "itens": [
      {
        "codigo": "TRI000001",
        "quantidade": 208
      },
      {
        "codigo": "TRI000018",
        "quantidade": 140
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0254-25",
    "itens": [
      {
        "codigo": "ROYALB000003",
        "quantidade": 50
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0333-25",
    "itens": [
      {
        "codigo": "ROYALB000002",
        "quantidade": 200
      },
      {
        "codigo": "ROYALB000004",
        "quantidade": 80
      },
      {
        "codigo": "ROYALB000005",
        "quantidade": 32
      },
      {
        "codigo": "ROYALB000006",
        "quantidade": 66
      },
      {
        "codigo": "ROYALB000007",
        "quantidade": 40
      },
      {
        "codigo": "ROYALB000008",
        "quantidade": 16
      },
      {
        "codigo": "ROYALB000009",
        "quantidade": 30
      },
      {
        "codigo": "ROYALB000010",
        "quantidade": 30
      },
      {
        "codigo": "ROYALB000011",
        "quantidade": 30
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0333-25-2",
    "itens": [
      {
        "codigo": "ROYALB000001",
        "quantidade": 336
      },
      {
        "codigo": "ROYALB000006",
        "quantidade": 184
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0011-26",
    "itens": [
      {
        "codigo": "ROYALB000005",
        "quantidade": 34
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3029-26",
    "itens": [
      {
        "codigo": "ROYALB000010",
        "quantidade": 170
      },
      {
        "codigo": "ROYALB000007",
        "quantidade": 60
      },
      {
        "codigo": "ROYALB000008",
        "quantidade": 24
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3003-26",
    "itens": [
      {
        "codigo": "ROYALB000004",
        "quantidade": 294
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3004-26",
    "itens": [
      {
        "codigo": "ROYALB000002",
        "quantidade": 262
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "0333-25-3",
    "itens": [
      {
        "codigo": "ROYALB000002",
        "quantidade": 82
      },
      {
        "codigo": "ROYALB000003",
        "quantidade": 160
      },
      {
        "codigo": "ROYALB000008",
        "quantidade": 14
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3005-26",
    "itens": [
      {
        "codigo": "ROYALB000003",
        "quantidade": 254
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3034-26",
    "itens": [
      {
        "codigo": "ROYALB000003",
        "quantidade": 24
      },
      {
        "codigo": "ROYALB000002",
        "quantidade": 14
      },
      {
        "codigo": "ROYALB000006",
        "quantidade": 40
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3003/26",
    "itens": [
      {
        "codigo": "ROYALB000004",
        "quantidade": 10
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3060-26-2",
    "itens": [
      {
        "codigo": "ROYALB000008",
        "quantidade": 100
      },
      {
        "codigo": "ROYALB000010",
        "quantidade": 50
      },
      {
        "codigo": "ROYALB000002",
        "quantidade": 74
      },
      {
        "codigo": "ROYALB000011",
        "quantidade": 50
      },
      {
        "codigo": "ROYALB000003",
        "quantidade": 238
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3033-26",
    "itens": [
      {
        "codigo": "ROYALB000012",
        "quantidade": 114
      },
      {
        "codigo": "ROYALB000004",
        "quantidade": 100
      },
      {
        "codigo": "ROYALB000013",
        "quantidade": 40
      },
      {
        "codigo": "ROYALB000005",
        "quantidade": 40
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  },
  {
    "numeroProcesso": "3060-26",
    "itens": [
      {
        "codigo": "ROYALB000005",
        "quantidade": 40
      },
      {
        "codigo": "ROYALB000002",
        "quantidade": 426
      },
      {
        "codigo": "ROYALB000007",
        "quantidade": 60
      }
    ],
    "obs": "Importado da planilha ESTOQUE"
  }
];

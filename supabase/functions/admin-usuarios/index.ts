// Função do Supabase (Edge Function) "admin-usuarios": cria o login de um usuário novo, libera o acesso de um login
// que já existe e lista os logins que ainda não têm acesso. SÓ ADMINISTRADOR consegue chamar.
//
// Por que existe: criar login exige a chave de serviço do Supabase (service role), que nunca pode ir para o navegador.
// Aqui ela fica no servidor. O site chama por sb.functions.invoke("admin-usuarios", { body: { acao, ... } }) e esta
// função confere, com o login de quem chamou, se essa pessoa é administradora (user_roles.is_admin) ANTES de fazer
// qualquer coisa. Como publicar: veja o LEIAME.md desta pasta.
//
// Ações (campo "acao" do corpo):
//   "pendentes" -> lista os logins que existem mas não têm linha em user_roles (não veem sistema nenhum).
//   "criar"     -> cria o login (já confirmado, com a senha provisória) e grava as permissões. Se gravar as permissões
//                  falhar, apaga o login que acabou de criar (não sobra login "solto").
//   "liberar"   -> grava as permissões de um login que já existe (ex.: criado à mão no painel do Supabase).
//
// O arquivo também roda no Node (só a lógica, sem o Supabase) para os testes: a parte do Deno fica no fim, protegida
// por typeof Deno. Sem imports no topo de propósito.

type Resposta = { status: number; corpo: Record<string, unknown> };

export type Dependencias = {
  // devolve o id de quem chamou (pelo token do cabeçalho Authorization) ou null se o token não vale
  usuarioDaRequisicao: (token: string) => Promise<{ id: string } | null>;
  // cliente do Supabase com a chave de serviço
  admin: any;
};

const PAPEIS_VAREJO = ["editor", "viewer", "representante"];
const PAPEIS_CRM = ["executivo", "financeiro", "gestao"];
const SISTEMAS_CRM = ["atacado", "encomenda"];
const CAMPOS_BOOLEANOS = [
  "is_admin", "pode_autorizar_gerencia", "pode_exportar_backup", "pode_acessar_sem_venda", "pode_acessar_portal_representante"
];

const erro = (status: number, mensagem: string): Resposta => ({ status, corpo: { erro: mensagem } });

function emailValido(e: unknown): e is string {
  return typeof e === "string" && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Confere e limpa o "perfil" que vem do site. Só passa campo conhecido e do tipo certo; o que não vier fica de fora
// (assim uma coluna que ainda não existe no banco não derruba o cadastro).
export function limparPerfil(p: any): { valores?: Record<string, unknown>; erro?: string } {
  if (p === undefined || p === null || typeof p !== "object") return { valores: {} };
  const v: Record<string, unknown> = {};
  if (p.role !== undefined) {
    if (!PAPEIS_VAREJO.includes(p.role)) return { erro: "Papel do Torun inválido." };
    v.role = p.role;
  }
  for (const campo of CAMPOS_BOOLEANOS) {
    if (p[campo] === undefined) continue;
    if (typeof p[campo] !== "boolean") return { erro: `Valor inválido em ${campo}.` };
    v[campo] = p[campo];
  }
  if (p.crm_papel !== undefined) {
    if (p.crm_papel !== null && !PAPEIS_CRM.includes(p.crm_papel)) return { erro: "Papel do CRM inválido." };
    if (p.crm_sistema !== undefined && p.crm_sistema !== null && !SISTEMAS_CRM.includes(p.crm_sistema)) return { erro: "Sistema do CRM inválido." };
    if (p.crm_papel === "executivo" && !SISTEMAS_CRM.includes(p.crm_sistema)) return { erro: "Executivo precisa de um sistema (Atacado ou Encomenda)." };
    v.crm_papel = p.crm_papel;
    // só o executivo tem sistema próprio; financeiro e gestão veem os dois
    v.crm_sistema = p.crm_papel === "executivo" ? p.crm_sistema : null;
  }
  if (p.visible_views !== undefined) {
    if (p.visible_views !== null) {
      if (!Array.isArray(p.visible_views) || p.visible_views.length > 60 ||
          !p.visible_views.every((t: unknown) => typeof t === "string" && /^[a-z0-9_-]{1,40}$/.test(t))) {
        return { erro: "Lista de telas inválida." };
      }
    }
    v.visible_views = p.visible_views;
  }
  return { valores: v };
}

async function exigirAdministrador(token: string, d: Dependencias): Promise<Resposta | null> {
  if (!token) return erro(401, "Faça login de novo e tente outra vez.");
  const quem = await d.usuarioDaRequisicao(token);
  if (!quem) return erro(401, "Seu login expirou. Entre de novo e tente outra vez.");
  const { data, error } = await d.admin.from("user_roles").select("is_admin").eq("user_id", quem.id).maybeSingle();
  if (error) return erro(500, "Não foi possível conferir suas permissões.");
  if (!data || data.is_admin !== true) return erro(403, "Só administrador pode criar ou liberar usuários.");
  return null;
}

export async function tratar(body: any, token: string, d: Dependencias): Promise<Resposta> {
  const negado = await exigirAdministrador(token, d);
  if (negado) return negado;
  if (!body || typeof body !== "object") return erro(400, "Pedido inválido.");

  if (body.acao === "pendentes") {
    const todos: any[] = [];
    for (let pagina = 1; pagina <= 10; pagina++) {
      const { data, error } = await d.admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) return erro(500, "Não foi possível listar os logins.");
      todos.push(...(data.users || []));
      if ((data.users || []).length < 200) break;
    }
    const { data: linhas, error: erroLinhas } = await d.admin.from("user_roles").select("user_id");
    if (erroLinhas) return erro(500, "Não foi possível listar as permissões.");
    const comPerfil = new Set((linhas || []).map((l: any) => l.user_id));
    const pendentes = todos
      .filter(u => u.email && !comPerfil.has(u.id))
      .map(u => ({ user_id: u.id, email: u.email, criado_em: u.created_at }));
    return { status: 200, corpo: { ok: true, pendentes } };
  }

  if (body.acao === "criar" || body.acao === "liberar") {
    const nome = typeof body.nome === "string" ? body.nome.replace(/\s+/g, " ").trim() : "";
    if (!nome || nome.length > 80) return erro(400, "Informe o nome (até 80 letras).");
    const perfil = limparPerfil(body.perfil);
    if (perfil.erro) return erro(400, perfil.erro);

    if (body.acao === "criar") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!emailValido(email)) return erro(400, "E-mail inválido.");
      const senha = typeof body.senha === "string" ? body.senha : "";
      if (senha.length < 8 || senha.length > 72) return erro(400, "A senha provisória precisa ter de 8 a 72 caracteres.");

      const criado = await d.admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (criado.error || !criado.data || !criado.data.user) {
        const msg = String((criado.error && criado.error.message) || "");
        if (/already|registered|exists/i.test(msg)) return erro(409, "Esse e-mail já tem login. Use “Liberar acesso” na lista.");
        return erro(400, "Não foi possível criar o login: " + msg);
      }
      const id = criado.data.user.id;
      const gravou = await d.admin.from("user_roles").upsert({ user_id: id, email, nome, ...perfil.valores }, { onConflict: "user_id" });
      if (gravou.error) {
        await d.admin.auth.admin.deleteUser(id); // não deixa login sem permissões
        return erro(500, "O login não foi criado porque as permissões não gravaram: " + gravou.error.message);
      }
      return { status: 200, corpo: { ok: true, user_id: id, email } };
    }

    // liberar: login que já existe
    const id = body.user_id;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return erro(400, "Login inválido.");
    const achado = await d.admin.auth.admin.getUserById(id);
    if (achado.error || !achado.data || !achado.data.user || !achado.data.user.email) return erro(404, "Esse login não existe mais.");
    const existente = await d.admin.from("user_roles").select("user_id").eq("user_id", id).maybeSingle();
    if (existente.error) return erro(500, "Não foi possível conferir as permissões atuais.");
    if (existente.data) return erro(409, "Essa pessoa já tem acesso. Edite pela lista.");
    const email = String(achado.data.user.email).toLowerCase();
    const gravou = await d.admin.from("user_roles").insert({ user_id: id, email, nome, ...perfil.valores });
    if (gravou.error) return erro(500, "Não foi possível gravar as permissões: " + gravou.error.message);
    return { status: 200, corpo: { ok: true, user_id: id, email } };
  }

  return erro(400, "Ação desconhecida.");
}

// ---------- parte do Supabase (só roda no servidor, nunca nos testes) ----------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// @ts-ignore: Deno só existe no servidor do Supabase
if (typeof Deno !== "undefined") {
  // @ts-ignore
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  // @ts-ignore
  const url = Deno.env.get("SUPABASE_URL");
  // @ts-ignore
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });
  const deps: Dependencias = {
    admin,
    usuarioDaRequisicao: async (token: string) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data || !data.user ? null : { id: data.user.id };
    }
  };
  // @ts-ignore
  Deno.serve(async (req: Request) => {
    const responder = (r: Resposta) => new Response(JSON.stringify(r.corpo), { status: r.status, headers: { ...CORS, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return responder(erro(405, "Use POST."));
    let corpo: any;
    try { corpo = await req.json(); } catch (_e) { return responder(erro(400, "Pedido inválido.")); }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    try {
      return responder(await tratar(corpo, token, deps));
    } catch (e) {
      console.error("admin-usuarios:", e instanceof Error ? e.message : String(e)); // sem corpo do pedido: tem senha
      return responder(erro(500, "Erro inesperado na função. Tente de novo."));
    }
  });
}

import { Router, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { agentRest, agentRpc, authRequest, catalogRest, config, evolution, UpstreamError } from "../lib/upstream";

const router = Router();
type Operator = { user_id: string; display_name: string; signature?: string | null; role: "admin" | "supervisor" | "attendant"; active: boolean };
type AuthRequest = Request & { operator?: Operator };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId = (id: string) => { if (!uuid.test(id)) throw new UpstreamError("ID inválido", 400); return id; };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Falha inesperada";
const mediaTypes = new Set(["audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm", "image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
const profileCache = new Map<string, { url: string; until: number }>();

async function sessionFor(req: AuthRequest, id: string) {
  const [sessions, handoffs] = await Promise.all([
    agentRest("chat_sessions", { params: { select: "*", id: `eq.${safeId(id)}`, limit: "1" } }),
    agentRest("human_handoffs", { params: { select: "*", session_id: `eq.${id}`, order: "created_at.desc", limit: "1" } }),
  ]);
  const session = sessions?.[0];
  if (!session) throw new UpstreamError("Conversa não encontrada", 404);
  if (!visibleTo(req.operator!, session, handoffs?.[0], await teamIdsFor(req.operator!))) throw new UpstreamError("Conversa não autorizada", 403);
  return session;
}

async function instanceForSession(sessionId: string) {
  const session = await agentRest("chat_sessions", { params: { select: "channel_id", id: `eq.${sessionId}`, limit: "1" } }).then((rows) => rows?.[0], () => null);
  if (session?.channel_id) {
    const channels = await agentRest("panel_channels", { params: { select: "instance_name", id: `eq.${session.channel_id}`, limit: "1" } });
    if (channels?.[0]?.instance_name) return channels[0].instance_name;
  }
  const rows = await agentRest("chat_messages", { params: { select: "metadata", session_id: `eq.${sessionId}`, order: "created_at.desc", limit: "20" } });
  const fromMessage = (rows as any[]).map((row) => row.metadata?.instance).find((value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value));
  return fromMessage || config.instance();
}

async function providerMessage(instance: string, providerId: string) {
  const found = await evolution(`/chat/findMessages/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify({ where: { key: { id: providerId } } }) });
  return found?.messages?.records?.[0] ?? found?.records?.[0] ?? null;
}

async function operatorFor(accessToken: string): Promise<Operator> {
  const user = await authRequest("user", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!user?.id) throw new UpstreamError("Sessão expirada", 401);
  let rows: any[];
  try { rows = await agentRest("panel_operators", { params: { select: "user_id,display_name,signature,role,active", user_id: `eq.${user.id}`, limit: "1" } }); }
  catch (error) {
    if (!(error instanceof UpstreamError) || error.status !== 400) throw error;
    rows = await agentRest("panel_operators", { params: { select: "user_id,display_name,role,active", user_id: `eq.${user.id}`, limit: "1" } });
  }
  const operator = rows?.[0] as Operator | undefined;
  if (!operator?.active) throw new UpstreamError("Operador sem acesso ao painel", 403);
  return operator;
}

function setTokens(res: Response, session: any) {
  if (!session?.access_token || !session?.refresh_token) throw new UpstreamError("Autenticação incompleta", 502);
  res.cookie("eva_access", session.access_token, { ...cookieOptions, maxAge: Math.max(60, Number(session.expires_in ?? 3600)) * 1000 });
  res.cookie("eva_refresh", session.refresh_token, { ...cookieOptions, maxAge: 30 * 24 * 3600 * 1000 });
}

async function requireOperator(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.eva_access as string | undefined;
    let operator: Operator;
    try {
      if (!token) throw new UpstreamError("Sessão ausente", 401);
      operator = await operatorFor(token);
    } catch (error) {
      if (!(error instanceof UpstreamError) || error.status !== 401 || !req.cookies?.eva_refresh) throw error;
      const refreshed = await authRequest("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: req.cookies.eva_refresh }) });
      operator = await operatorFor(refreshed.access_token);
      setTokens(res, refreshed);
    }
    req.operator = operator;
    next();
  } catch (error) { next(error); }
}
const roleAllowed = (operator: Operator, roles: Operator["role"][]) => {
  if (!roles.includes(operator.role)) throw new UpstreamError("Sem permissão para esta ação", 403);
};
async function teamIdsFor(operator: Operator): Promise<Set<string>> {
  if (operator.role !== "attendant") return new Set();
  const rows = await agentRest("panel_team_members", { params: { select: "team_id", user_id: `eq.${operator.user_id}`, active: "eq.true" } }).catch(() => []);
  return new Set((rows as any[]).map((row) => row.team_id));
}
const visibleTo = (operator: Operator, session: any, handoff: any, teamIds: Set<string>) =>
  operator.role !== "attendant" || handoff?.assigned_to === operator.display_name
  || !session.assigned_team_id || teamIds.has(session.assigned_team_id);
const signedReply = (operator: Operator, message: string) => {
  const raw = String(operator.signature || operator.display_name).replace(/[\r\n*]/g, " ").trim().slice(0, 80).replace(/:$/, "");
  return `*${raw}:*\n${message}`;
};
const invitePath = (req: Request) => {
  const host = req.get("host");
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const publicUrl = process.env.PANEL_PUBLIC_URL?.trim() || (host ? `${protocol}://${host}/` : "");
  return publicUrl ? `invite?redirect_to=${encodeURIComponent(publicUrl)}` : "invite";
};

router.get("/setup", (_req, res) => {
  const required = ["SUPABASE_AGENT_URL", "SUPABASE_AGENT_ANON_KEY", "SUPABASE_AGENT_SERVICE_ROLE_KEY", "SUPABASE_CATALOG_URL", "SUPABASE_CATALOG_SERVICE_ROLE_KEY", "EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"];
  res.json({ configured: required.every((name) => Boolean(process.env[name]?.trim())), missing: required.filter((name) => !process.env[name]?.trim()) });
});

router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!email || !password) throw new UpstreamError("Informe e-mail e senha", 400);
  let session: any;
  try { session = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }); }
  catch (error) {
    if (error instanceof UpstreamError && [400, 401].includes(error.status)) throw new UpstreamError("E-mail ou senha inválidos", 401);
    throw error;
  }
  const operator = await operatorFor(session.access_token);
  setTokens(res, session);
  res.json({ operator });
});
router.post("/auth/accept-invite", async (req, res) => {
  const accessToken = String(req.body?.accessToken ?? "");
  const refreshToken = String(req.body?.refreshToken ?? "");
  const password = String(req.body?.password ?? "");
  if (!accessToken || !refreshToken || password.length < 10 || password.length > 128) throw new UpstreamError("Use uma senha de 10 a 128 caracteres", 400);
  const operator = await operatorFor(accessToken);
  await authRequest("user", { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password }) });
  setTokens(res, { access_token: accessToken, refresh_token: refreshToken, expires_in: 3600 });
  res.json({ operator });
});
router.post("/auth/logout", (_req, res) => {
  res.clearCookie("eva_access", cookieOptions);
  res.clearCookie("eva_refresh", cookieOptions);
  res.json({ ok: true });
});
router.get("/auth/me", (req, res, next) => {
  if (!req.cookies?.eva_access && !req.cookies?.eva_refresh) return res.json({ operator: null });
  return requireOperator(req, res, next);
}, (req: AuthRequest, res) => res.json({ operator: req.operator }));

router.use(requireOperator);

router.post("/auth/change-password", async (req: AuthRequest, res) => {
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (!currentPassword || newPassword.length < 10 || newPassword.length > 128) throw new UpstreamError("Informe a senha atual e uma nova senha de 10 a 128 caracteres", 400);
  if (currentPassword === newPassword) throw new UpstreamError("Escolha uma senha diferente da atual", 400);
  const key = config.agentKey();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const account = await authRequest(`admin/users/${req.operator!.user_id}`, { headers });
  if (!account?.email) throw new UpstreamError("Conta de acesso não encontrada", 404);
  let verified: any;
  try { verified = await authRequest("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: account.email, password: currentPassword }) }); }
  catch (error) {
    if (error instanceof UpstreamError && [400, 401].includes(error.status)) throw new UpstreamError("Senha atual incorreta", 400);
    throw error;
  }
  const verifiedUser = await authRequest("user", { headers: { Authorization: `Bearer ${verified.access_token}` } });
  if (verifiedUser?.id !== req.operator!.user_id) throw new UpstreamError("Não foi possível confirmar a conta", 403);
  await authRequest(`admin/users/${req.operator!.user_id}`, { method: "PUT", headers, body: JSON.stringify({ password: newPassword }) });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "operator_password_changed", details: { user_id: req.operator!.user_id } } });
  res.clearCookie("eva_access", cookieOptions);
  res.clearCookie("eva_refresh", cookieOptions);
  res.json({ changed: true });
});

const knowledgeInput = (body: any) => {
  const title = String(body?.title ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const audience = String(body?.audience ?? "all");
  if (!title || title.length > 160 || !content || content.length > 16000) throw new UpstreamError("Informe título e conteúdo (até 16 mil caracteres)", 400);
  if (!["all", "inquilino", "proprietario", "corretor"].includes(audience)) throw new UpstreamError("Público inválido", 400);
  return { title, content, audience };
};
async function writeKnowledge(method: "POST" | "PATCH", params: Record<string, string>, body: Record<string, unknown>) {
  const headers = { Prefer: "return=representation" };
  try { return await agentRest("agent_knowledge", { method, params, body, headers }); }
  catch (error) {
    if (!(error instanceof UpstreamError) || error.status !== 400 || !/audience/i.test(error.message)) throw error;
    if (body.audience !== "all") throw new UpstreamError("Ative a classificação por público no banco antes de salvar esta informação", 409);
    const { audience: _audience, ...legacyBody } = body;
    return agentRest("agent_knowledge", { method, params, body: legacyBody, headers });
  }
}
router.get("/knowledge", async (_req, res) => {
  const fields = "id,title,content,status,scope,source_type,source_path,version,created_at,updated_at,approved_at";
  try {
    const entries = await agentRest("agent_knowledge", { params: { select: `${fields},audience`, order: "updated_at.desc", limit: "200" } });
    res.json({ entries, audienceEnabled: true });
  } catch (error) {
    if (!(error instanceof UpstreamError) || error.status !== 400 || !/audience/i.test(error.message)) throw error;
    const entries = await agentRest("agent_knowledge", { params: { select: fields, order: "updated_at.desc", limit: "200" } });
    res.json({ entries: (entries as any[]).map((entry) => ({ ...entry, audience: "all" })), audienceEnabled: false });
  }
});
router.get("/knowledge/gaps", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const events = await agentRest("agent_events", { params: { select: "id,session_id,created_at,payload", event_type: "eq.agent_decision", order: "created_at.desc", limit: "200" } });
  const gaps = (events as any[]).filter((event) => event.payload?.knowledge_gap === true).slice(0, 30).map((event) => ({
    id: event.id, session_id: event.session_id, created_at: event.created_at,
    question: String(event.payload?.combined_content ?? "").slice(0, 600),
    reason: String(event.payload?.handoff_reason ?? "Sem fonte aprovada").slice(0, 200),
  }));
  res.json({ gaps });
});
router.get("/knowledge/suggestions", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const suggestions = await agentRest("agent_knowledge_suggestions", { params: { select: "id,session_id,suggested_title,suggested_content,created_at", status: "eq.pending", order: "created_at.desc", limit: "100" } });
  res.json({ suggestions });
});
router.post("/knowledge/suggestions/:id/review", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  if (typeof req.body?.accept !== "boolean") throw new UpstreamError("Informe se aceita a sugestão", 400);
  const result = await agentRpc("panel_review_knowledge_suggestion", { p_suggestion_id: safeId(String(req.params.id)), p_operator_id: req.operator!.user_id, p_accept: req.body.accept });
  res.json(result);
});
router.post("/knowledge", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const input = knowledgeInput(req.body);
  const created = await writeKnowledge("POST", { select: "*" }, { ...input, status: "draft", scope: "global", created_by: req.operator!.user_id });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "knowledge_created", details: { knowledge_id: created[0].id } } });
  res.status(201).json({ entry: created[0] });
});
router.post("/knowledge/documents", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const title = String(req.body?.title ?? "").trim();
  const audience = String(req.body?.audience ?? "all");
  if (!["all", "inquilino", "proprietario", "corretor"].includes(audience)) throw new UpstreamError("Público inválido", 400);
  const mime = String(req.body?.mimeType ?? "").split(";")[0].toLowerCase();
  const raw = String(req.body?.base64 ?? "");
  const filename = String(req.body?.fileName ?? "documento").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 100);
  if (!title || title.length > 160 || !["application/pdf", "text/plain"].includes(mime) || !raw || raw.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(raw)) throw new UpstreamError("Anexe PDF ou TXT de até 5 MB", 400);
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new UpstreamError("Arquivo excede 5 MB", 413);
  const path = `${randomUUID()}/${filename}`;
  const uploaded = await fetch(`${config.agentUrl()}/storage/v1/object/eva-knowledge/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}`, "Content-Type": mime },
    body: new Uint8Array(bytes), signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!uploaded?.ok) throw new UpstreamError("Não foi possível arquivar o documento", 502);
  const created = await writeKnowledge("POST", { select: "*" }, { title, audience, content: "Aguardando revisão e transcrição do documento anexado.", status: "draft", scope: "global", source_type: "document", source_path: path, created_by: req.operator!.user_id });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "knowledge_document_uploaded", details: { knowledge_id: created[0].id, file_name: filename } } });
  res.status(201).json({ entry: created[0] });
});
router.get("/knowledge/:id/document", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const rows = await agentRest("agent_knowledge", { params: { select: "source_path", id: `eq.${id}`, source_type: "eq.document", limit: "1" } });
  const path = rows?.[0]?.source_path;
  if (!path) throw new UpstreamError("Documento não encontrado", 404);
  const stored = await fetch(`${config.agentUrl()}/storage/v1/object/authenticated/eva-knowledge/${String(path).split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!stored?.ok) throw new UpstreamError("Documento arquivado indisponível", 502);
  const bytes = Buffer.from(await stored.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new UpstreamError("Documento excede o limite", 413);
  const filename = String(path).split("/").pop()!.replace(/[^\p{L}\p{N}._-]/gu, "_");
  res.setHeader("Content-Type", filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(bytes);
});
router.patch("/knowledge/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const input = knowledgeInput(req.body);
  const updated = await writeKnowledge("PATCH", { id: `eq.${id}`, select: "*" }, input);
  if (!updated?.length) throw new UpstreamError("Conhecimento não encontrado", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "knowledge_edited", details: { knowledge_id: id, version: updated[0].version } } });
  res.json({ entry: updated[0] });
});
router.post("/knowledge/:id/approve", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const current = await agentRest("agent_knowledge", { params: { select: "content,source_type", id: `eq.${id}`, limit: "1" } });
  if (current?.[0]?.source_type === "document" && String(current[0].content ?? "").startsWith("Aguardando revisão e transcrição")) throw new UpstreamError("Revise e transcreva o documento antes de aprovar", 409);
  const updated = await agentRest("agent_knowledge", { method: "PATCH", params: { id: `eq.${id}`, select: "*" }, body: { status: "approved", approved_by: req.operator!.user_id, approved_at: new Date().toISOString() }, headers: { Prefer: "return=representation" } });
  if (!updated?.length) throw new UpstreamError("Conhecimento não encontrado", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "knowledge_approved", details: { knowledge_id: id, version: updated[0].version } } });
  res.json({ entry: updated[0] });
});
router.post("/knowledge/:id/archive", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const updated = await agentRest("agent_knowledge", { method: "PATCH", params: { id: `eq.${id}`, select: "*" }, body: { status: "archived", approved_by: null, approved_at: null }, headers: { Prefer: "return=representation" } });
  if (!updated?.length) throw new UpstreamError("Conhecimento não encontrado", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "knowledge_archived", details: { knowledge_id: id } } });
  res.json({ entry: updated[0] });
});

const tagInput = (body: any) => {
  const name = String(body?.name ?? "").trim();
  const color = String(body?.color ?? "").trim();
  if (!name || name.length > 40 || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new UpstreamError("Informe um nome de até 40 caracteres e uma cor válida", 400);
  return { name, color };
};
router.get("/tags", async (_req, res) => {
  const tags = await agentRest("tags", { params: { select: "id,slug,name,color,category,active", active: "eq.true", order: "name.asc" } });
  res.json({ tags });
});
router.post("/tags", async (req: AuthRequest, res) => {
  const input = tagInput(req.body);
  const created = await agentRest("tags", { method: "POST", params: { select: "id,slug,name,color,category,active" }, body: { ...input, slug: `custom_${randomUUID().replace(/-/g, "")}`, category: "service" }, headers: { Prefer: "return=representation" } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "create_tag", details: { tag_id: created[0].id, ...input } } });
  res.status(201).json({ tag: created[0] });
});
router.patch("/tags/:id", async (req: AuthRequest, res) => {
  const id = safeId(String(req.params.id));
  const input = tagInput(req.body);
  const updated = await agentRest("tags", { method: "PATCH", params: { id: `eq.${id}`, active: "eq.true", select: "id,slug,name,color,category,active" }, body: input, headers: { Prefer: "return=representation" } });
  if (!updated?.[0]) throw new UpstreamError("Etiqueta não encontrada", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "edit_tag", details: { tag_id: id, ...input } } });
  res.json({ tag: updated[0] });
});
router.delete("/tags/:id", async (req: AuthRequest, res) => {
  const id = safeId(String(req.params.id));
  const updated = await agentRest("tags", { method: "PATCH", params: { id: `eq.${id}`, active: "eq.true", select: "id" }, body: { active: false }, headers: { Prefer: "return=representation" } });
  if (!updated?.[0]) throw new UpstreamError("Etiqueta não encontrada", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "delete_tag", details: { tag_id: id } } });
  res.json({ ok: true });
});
router.put("/contacts/:contactId/tags/:tagId", async (req: AuthRequest, res) => {
  const contactId = safeId(String(req.params.contactId));
  const tagId = safeId(String(req.params.tagId));
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") throw new UpstreamError("Informe se a etiqueta deve estar ativa", 400);
  const result = await agentRpc("panel_set_contact_tag", { p_contact_id: contactId, p_tag_id: tagId, p_enabled: enabled, p_operator_id: req.operator!.user_id });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: enabled ? "apply_tag" : "remove_tag", details: { contact_id: contactId, tag_id: tagId } } });
  res.json(result);
});

router.get("/operators", async (_req, res) => {
  const rows = await agentRest("panel_operators", { params: { select: "user_id,display_name,role", active: "eq.true", order: "display_name.asc" } });
  const routingReady = await agentRest("panel_operators", { params: { select: "routing_schema_version", limit: "0" } }).then(() => true, () => false);
  res.json({ operators: rows, routingReady });
});
router.get("/operators/manage", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const [operators, authUsers] = await Promise.all([
    agentRest("panel_operators", { params: { select: "user_id,display_name,role,active,created_at", order: "display_name.asc" } }),
    authRequest("admin/users?page=1&per_page=1000", { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` } }),
  ]);
  const authById = new Map((authUsers?.users ?? []).map((user: any) => [user.id, user]));
  res.json({ operators: (operators as any[]).map((operator) => {
    const user: any = authById.get(operator.user_id);
    return { ...operator, email: user?.email ?? null, email_confirmed_at: user?.email_confirmed_at ?? null, invited_at: user?.invited_at ?? null };
  }) });
});
router.patch("/operators/me", async (req: AuthRequest, res) => {
  const signature = String(req.body?.signature ?? "").replace(/[\r\n*]/g, " ").trim().replace(/:$/, "");
  if (signature.length > 80) throw new UpstreamError("Assinatura deve ter até 80 caracteres", 400);
  const rows = await agentRest("panel_operators", { method: "PATCH", params: { user_id: `eq.${req.operator!.user_id}`, select: "user_id,display_name,signature,role,active" }, body: { signature: signature || null }, headers: { Prefer: "return=representation" } });
  res.json({ operator: rows?.[0] });
});

router.post("/operators", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const displayName = String(req.body?.displayName ?? "").trim();
  const role = String(req.body?.role ?? "attendant");
  const password = String(req.body?.password ?? "");
  const teamIds = req.body?.teamIds ?? [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || displayName.length > 80 || !["admin", "supervisor", "attendant"].includes(role)) throw new UpstreamError("Informe e-mail, nome e função válidos", 400);
  if (password.length < 10 || password.length > 128) throw new UpstreamError("Use uma senha de 10 a 128 caracteres", 400);
  if (!Array.isArray(teamIds) || teamIds.length > 20 || teamIds.some((id) => typeof id !== "string" || !uuid.test(id)) || new Set(teamIds).size !== teamIds.length) throw new UpstreamError("Equipes inválidas", 400);
  if (teamIds.length) {
    const available = await agentRest("panel_teams", { params: { select: "id", active: "eq.true" } });
    const activeIds = new Set((available as any[]).map((team) => team.id));
    if (teamIds.some((id) => !activeIds.has(id))) throw new UpstreamError("Uma equipe selecionada não está disponível", 409);
  }
  const key = config.agentKey();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const authUsers = await authRequest("admin/users?page=1&per_page=1000", { headers });
  const existing = (authUsers?.users ?? []).find((user: any) => String(user.email ?? "").trim().toLowerCase() === email);
  const previous = existing ? await agentRest("panel_operators", { params: { select: "user_id,active", user_id: `eq.${existing.id}`, limit: "1" } }) : [];
  if (previous?.[0]?.active) throw new UpstreamError("Este e-mail já pertence a um usuário ativo. Edite o cadastro existente.", 409);
  const account = existing
    ? await authRequest(`admin/users/${existing.id}`, { method: "PUT", headers, body: JSON.stringify({ password, email_confirm: true, user_metadata: { display_name: displayName } }) })
    : await authRequest("admin/users", { method: "POST", headers, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } }) });
  const userId = existing?.id ?? account?.id ?? account?.user?.id;
  if (!userId || !uuid.test(userId)) throw new UpstreamError("Não foi possível identificar o usuário no Supabase Auth", 502);
  const rows = await agentRest("panel_operators", { method: "POST", params: { on_conflict: "user_id", select: "user_id,display_name,role,active" }, body: { user_id: userId, display_name: displayName, role, active: true }, headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
  if (teamIds.length) await agentRest("panel_team_members", { method: "POST", params: { on_conflict: "team_id,user_id" }, body: teamIds.map((teamId) => ({ team_id: teamId, user_id: userId, active: true })), headers: { Prefer: "resolution=merge-duplicates" } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: existing ? "operator_reactivated_with_password" : "operator_created_with_password", details: { user_id: userId, role, team_ids: teamIds } } });
  res.status(existing ? 200 : 201).json({ operator: rows?.[0], reactivated: Boolean(existing) });
});
router.put("/operators/:id/password", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const id = safeId(String(req.params.id));
  if (id === req.operator!.user_id) throw new UpstreamError("Altere sua própria senha em Configurações", 409);
  const password = String(req.body?.password ?? "");
  if (password.length < 10 || password.length > 128) throw new UpstreamError("Use uma senha de 10 a 128 caracteres", 400);
  const rows = await agentRest("panel_operators", { params: { select: "user_id,active", user_id: `eq.${id}`, limit: "1" } });
  if (!rows?.[0]?.active) throw new UpstreamError("Usuário não encontrado ou removido", 404);
  const key = config.agentKey();
  await authRequest(`admin/users/${id}`, { method: "PUT", headers: { apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify({ password, email_confirm: true }) });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "operator_password_reset", details: { user_id: id } } });
  res.json({ changed: true });
});

router.post("/operators/invite", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const displayName = String(req.body?.displayName ?? "").trim();
  const role = String(req.body?.role ?? "attendant");
  const teamIds = req.body?.teamIds ?? [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || displayName.length > 80 || !["admin", "supervisor", "attendant"].includes(role)) throw new UpstreamError("Informe e-mail, nome e função válidos", 400);
  if (!Array.isArray(teamIds) || teamIds.length > 20 || teamIds.some((id) => typeof id !== "string" || !uuid.test(id)) || new Set(teamIds).size !== teamIds.length) throw new UpstreamError("Equipes inválidas", 400);
  if (teamIds.length) {
    const available = await agentRest("panel_teams", { params: { select: "id", active: "eq.true" } });
    const activeIds = new Set((available as any[]).map((team) => team.id));
    if (teamIds.some((id) => !activeIds.has(id))) throw new UpstreamError("Uma equipe selecionada não está disponível", 409);
  }
  const authUsers = await authRequest("admin/users?page=1&per_page=1000", { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` } });
  const existing = (authUsers?.users ?? []).find((user: any) => String(user.email ?? "").trim().toLowerCase() === email);
  const existingOperator = existing ? await agentRest("panel_operators", { params: { select: "user_id,active", user_id: `eq.${existing.id}`, limit: "1" } }) : [];
  if (existingOperator?.[0]?.active) throw new UpstreamError("Este e-mail já pertence a um usuário ativo. Edite o cadastro existente.", 409);
  // Remover um operador preserva sua identidade no Auth e o histórico vinculado ao mesmo ID.
  // Contas confirmadas voltam a usar a senha anterior; só contas novas ou pendentes recebem convite.
  const needsInvite = !existing || !existing.email_confirmed_at;
  const invited = needsInvite ? await authRequest(invitePath(req), { method: "POST", headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` }, body: JSON.stringify({ email, data: { display_name: displayName } }) }) : null;
  const userId = existing?.id ?? invited?.id ?? invited?.user?.id;
  if (!userId || !uuid.test(userId)) throw new UpstreamError("Não foi possível identificar o usuário no Supabase Auth.", 502);
  if (invited && (invited?.id ?? invited?.user?.id) !== userId) throw new UpstreamError("O convite retornou uma conta diferente. Confira o usuário no Supabase Auth.", 502);
  const rows = await agentRest("panel_operators", { method: "POST", params: { on_conflict: "user_id", select: "user_id,display_name,role,active" }, body: { user_id: userId, display_name: displayName, role, active: true }, headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
  if (teamIds.length) await agentRest("panel_team_members", { method: "POST", params: { on_conflict: "team_id,user_id" }, body: teamIds.map((teamId) => ({ team_id: teamId, user_id: userId, active: true })), headers: { Prefer: "resolution=merge-duplicates" } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: existing ? "operator_reactivated" : "operator_invited", details: { user_id: userId, role, team_ids: teamIds, invitation_sent: needsInvite } } });
  res.status(existing ? 200 : 201).json({ operator: rows?.[0], invitationSent: needsInvite, reactivated: Boolean(existing) });
});
router.post("/operators/:id/resend-invite", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const id = safeId(String(req.params.id));
  const operators = await agentRest("panel_operators", { params: { select: "user_id,active", user_id: `eq.${id}`, limit: "1" } });
  if (!operators?.[0]?.active) throw new UpstreamError("Usuário não encontrado ou removido", 404);
  const user = await authRequest(`admin/users/${id}`, { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` } });
  if (!user?.email) throw new UpstreamError("E-mail do usuário não encontrado", 404);
  if (user.email_confirmed_at) throw new UpstreamError("Este usuário já confirmou o e-mail", 409);
  const invited = await authRequest(invitePath(req), { method: "POST", headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` }, body: JSON.stringify({ email: user.email }) });
  if ((invited?.id ?? invited?.user?.id) !== id) throw new UpstreamError("O convite foi enviado para outra conta. Confira o usuário no Supabase Auth.", 502);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "operator_invite_resent", details: { user_id: id } } });
  res.json({ sent: true });
});
router.delete("/operators/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const id = safeId(String(req.params.id));
  if (id === req.operator!.user_id) throw new UpstreamError("Você não pode remover sua própria conta", 409);
  const operators = await agentRest("panel_operators", { params: { select: "user_id,display_name,active", user_id: `eq.${id}`, limit: "1" } });
  const operator = operators?.[0];
  if (!operator?.active) throw new UpstreamError("Usuário não encontrado ou já removido", 404);
  const handoffs = await agentRest("human_handoffs", { params: { select: "id", assigned_to: `eq.${operator.display_name}`, resolved_at: "is.null", status: "in.(requested,pending,accepted,active,em_atendimento,in_progress)", limit: "1" } });
  if (handoffs.length) throw new UpstreamError("Transfira os atendimentos ativos deste usuário antes de removê-lo", 409);
  const rows = await agentRest("panel_operators", { method: "PATCH", params: { user_id: `eq.${id}`, active: "eq.true", select: "user_id" }, body: { active: false }, headers: { Prefer: "return=representation" } });
  if (!rows?.length) throw new UpstreamError("Usuário não encontrado", 404);
  await agentRest("panel_team_members", { method: "PATCH", params: { user_id: `eq.${id}` }, body: { active: false } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "operator_removed", details: { user_id: id } } });
  res.json({ removed: true, historyPreserved: true });
});
router.patch("/operators/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const id = safeId(String(req.params.id));
  if (id === req.operator!.user_id && req.body?.active === false) throw new UpstreamError("Você não pode desativar sua própria conta", 409);
  const changes: Record<string, unknown> = {};
  if (req.body?.displayName !== undefined) {
    const name = String(req.body.displayName).trim();
    if (!name || name.length > 80) throw new UpstreamError("Nome inválido", 400);
    const previous = await agentRest("panel_operators", { params: { select: "display_name", user_id: `eq.${id}`, limit: "1" } });
    if (!previous?.[0]) throw new UpstreamError("Usuário não encontrado", 404);
    if (name !== previous[0].display_name) {
      const handoffs = await agentRest("human_handoffs", { params: { select: "id", assigned_to: `eq.${previous[0].display_name}`, resolved_at: "is.null", status: "in.(requested,pending,accepted,active,em_atendimento,in_progress)", limit: "1" } });
      if (handoffs.length) throw new UpstreamError("Transfira os atendimentos ativos deste usuário antes de alterar o nome", 409);
    }
    changes.display_name = name;
  }
  if (req.body?.role !== undefined) {
    if (!["admin", "supervisor", "attendant"].includes(req.body.role)) throw new UpstreamError("Função inválida", 400);
    changes.role = req.body.role;
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== "boolean") throw new UpstreamError("Estado inválido", 400);
    changes.active = req.body.active;
  }
  if (!Object.keys(changes).length) throw new UpstreamError("Nenhuma alteração informada", 400);
  const rows = await agentRest("panel_operators", { method: "PATCH", params: { user_id: `eq.${id}`, select: "user_id,display_name,role,active" }, body: changes, headers: { Prefer: "return=representation" } });
  if (!rows?.length) throw new UpstreamError("Usuário não encontrado", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "operator_updated", details: { user_id: id, changes } } });
  res.json({ operator: rows[0] });
});
router.get("/teams", async (_req, res) => {
  const [teams, members] = await Promise.all([
    agentRest("panel_teams", { params: { select: "id,name,description,ai_enabled,active,created_at", order: "name.asc" } }),
    agentRest("panel_team_members", { params: { select: "team_id,user_id,active" } }),
  ]);
  res.json({ teams, members });
});
router.post("/teams", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const name = String(req.body?.name ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  if (!name || name.length > 80 || description.length > 500) throw new UpstreamError("Nome ou descrição inválidos", 400);
  const rows = await agentRest("panel_teams", { method: "POST", params: { select: "*" }, body: { name, description, ai_enabled: false, active: true }, headers: { Prefer: "return=representation" } });
  res.status(201).json({ team: rows[0] });
});
router.patch("/teams/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const name = String(req.body?.name ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const aiEnabled = req.body?.aiEnabled;
  if (!name || name.length > 80 || description.length > 500 || typeof aiEnabled !== "boolean") throw new UpstreamError("Dados da equipe inválidos", 400);
  const rows = await agentRest("panel_teams", { method: "PATCH", params: { id: `eq.${id}`, active: "eq.true", select: "*" }, body: { name, description, ai_enabled: aiEnabled }, headers: { Prefer: "return=representation" } });
  if (!rows?.length) throw new UpstreamError("Equipe não encontrada", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "team_updated", details: { team_id: id, name, ai_enabled: aiEnabled } } });
  res.json({ team: rows[0] });
});
router.delete("/teams/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const id = safeId(String(req.params.id));
  const [channels, sessions] = await Promise.all([
    agentRest("panel_channels", { params: { select: "id", default_team_id: `eq.${id}`, active: "eq.true", limit: "1" } }),
    agentRest("chat_sessions", { params: { select: "id", assigned_team_id: `eq.${id}`, closed_at: "is.null", limit: "1" } }),
  ]);
  if (channels.length || sessions.length) throw new UpstreamError("Transfira as conversas abertas e altere os canais desta equipe antes de removê-la", 409);
  const rows = await agentRest("panel_teams", { method: "PATCH", params: { id: `eq.${id}`, active: "eq.true", select: "id" }, body: { active: false, ai_enabled: false }, headers: { Prefer: "return=representation" } });
  if (!rows?.length) throw new UpstreamError("Equipe não encontrada", 404);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "team_archived", details: { team_id: id } } });
  res.json({ archived: true });
});
router.put("/teams/:id/members/:userId", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const teamId = safeId(String(req.params.id));
  const userId = safeId(String(req.params.userId));
  const active = req.body?.active;
  if (typeof active !== "boolean") throw new UpstreamError("Informe active", 400);
  const rows = await agentRest("panel_team_members", { method: "POST", params: { on_conflict: "team_id,user_id", select: "*" }, body: { team_id: teamId, user_id: userId, active }, headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
  res.json({ member: rows[0] });
});
async function teamAccess(operator: Operator, teamId: string, requireActive = false) {
  if (requireActive) {
    const teams = await agentRest("panel_teams", { params: { select: "id", id: `eq.${teamId}`, active: "eq.true", limit: "1" } });
    if (!teams?.length) throw new UpstreamError("Equipe indisponível para novas mensagens", 404);
  }
  if (["admin", "supervisor"].includes(operator.role)) return;
  const members = await agentRest("panel_team_members", { params: { select: "team_id", team_id: `eq.${teamId}`, user_id: `eq.${operator.user_id}`, active: "eq.true", limit: "1" } });
  if (!members?.length) throw new UpstreamError("Você não participa desta equipe", 403);
}
router.get("/internal/directory", async (_req: AuthRequest, res) => {
  const operators = await agentRest("panel_operators", { params: { select: "user_id,display_name,role,active", order: "display_name.asc" } });
  res.json({ operators });
});
router.get("/internal/conversations", async (req: AuthRequest, res) => {
  const myId = req.operator!.user_id;
  const teams = req.operator!.role === "attendant"
    ? await agentRest("panel_team_members", { params: { select: "team_id", user_id: `eq.${myId}`, active: "eq.true" } })
    : await agentRest("panel_teams", { params: { select: "id" } });
  const ids = (teams as Array<{ team_id?: string; id?: string }>).map((row) => row.team_id ?? row.id).filter(Boolean) as string[];
  const filter = [`sender_user_id.eq.${myId}`, `recipient_user_id.eq.${myId}`, ...(ids.length ? [`team_id.in.(${ids.join(",")})`] : [])].join(",");
  const rows = await agentRest("panel_internal_messages", { params: { select: "id,team_id,recipient_user_id,sender_user_id,body,created_at,media_mime_type", or: `(${filter})`, order: "created_at.desc", limit: "500" } });
  const latest = new Map<string, unknown>();
  for (const row of rows as any[]) {
    const key = row.team_id ? `team:${row.team_id}` : `peer:${row.sender_user_id === myId ? row.recipient_user_id : row.sender_user_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  res.json({ latest: Object.fromEntries(latest) });
});
router.get("/internal/messages", async (req: AuthRequest, res) => {
  const teamId = req.query.teamId ? safeId(String(req.query.teamId)) : null;
  const peerId = req.query.peerId ? safeId(String(req.query.peerId)) : null;
  const before = req.query.before ? String(req.query.before) : null;
  if (before && (!Number.isFinite(Date.parse(before)) || before.length > 35)) throw new UpstreamError("Data de paginação inválida", 400);
  if (Boolean(teamId) === Boolean(peerId)) throw new UpstreamError("Escolha uma equipe ou um usuário", 400);
  if (teamId) {
    await teamAccess(req.operator!, teamId);
    const messages = await agentRest("panel_internal_messages", { params: { select: "*", team_id: `eq.${teamId}`, ...(before ? { created_at: `lt.${before}` } : {}), order: "created_at.desc", limit: "51" } });
    res.json({ messages: messages.slice(0, 50).reverse(), hasMore: messages.length > 50 }); return;
  }
  const myId = req.operator!.user_id;
  const messages = await agentRest("panel_internal_messages", { params: { select: "*", or: `(and(sender_user_id.eq.${myId},recipient_user_id.eq.${peerId}),and(sender_user_id.eq.${peerId},recipient_user_id.eq.${myId}))`, ...(before ? { created_at: `lt.${before}` } : {}), order: "created_at.desc", limit: "51" } });
  res.json({ messages: messages.slice(0, 50).reverse(), hasMore: messages.length > 50 });
});
router.post("/internal/messages", async (req: AuthRequest, res) => {
  const teamId = req.body?.teamId ? safeId(String(req.body.teamId)) : null;
  const recipientUserId = req.body?.recipientUserId ? safeId(String(req.body.recipientUserId)) : null;
  const body = String(req.body?.body ?? "").trim();
  const sessionId = req.body?.sessionId ? safeId(String(req.body.sessionId)) : null;
  if (Boolean(teamId) === Boolean(recipientUserId) || !body || body.length > 5000) throw new UpstreamError("Destinatário ou mensagem inválidos", 400);
  if (sessionId) await sessionFor(req, sessionId);
  if (teamId) await teamAccess(req.operator!, teamId, true);
  if (recipientUserId) {
    const operators = await agentRest("panel_operators", { params: { select: "user_id", user_id: `eq.${recipientUserId}`, active: "eq.true", limit: "1" } });
    if (!operators?.length) throw new UpstreamError("Destinatário indisponível", 404);
  }
  const rows = await agentRest("panel_internal_messages", { method: "POST", params: { select: "*" }, body: { sender_user_id: req.operator!.user_id, team_id: teamId, recipient_user_id: recipientUserId, session_id: sessionId, body }, headers: { Prefer: "return=representation" } });
  res.status(201).json({ message: rows[0] });
});

router.post("/internal/audio", async (req: AuthRequest, res) => {
  const teamId = req.body?.teamId ? safeId(String(req.body.teamId)) : null;
  const recipientUserId = req.body?.recipientUserId ? safeId(String(req.body.recipientUserId)) : null;
  const mime = String(req.body?.mimeType ?? "").split(";")[0].toLowerCase();
  const raw = String(req.body?.base64 ?? "");
  const duration = Math.round(Number(req.body?.durationSeconds ?? 0));
  if (Boolean(teamId) === Boolean(recipientUserId) || !["audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg"].includes(mime) || !raw || raw.length > 4_200_000 || !/^[A-Za-z0-9+/=]+$/.test(raw) || !Number.isFinite(duration) || duration < 1 || duration > 600) throw new UpstreamError("Áudio inválido ou maior que 3 MB", 400);
  if (teamId) await teamAccess(req.operator!, teamId, true);
  if (recipientUserId) {
    const users = await agentRest("panel_operators", { params: { select: "user_id", user_id: `eq.${recipientUserId}`, active: "eq.true", limit: "1" } });
    if (!users?.length) throw new UpstreamError("Destinatário indisponível", 404);
  }
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new UpstreamError("Áudio maior que 3 MB", 413);
  const extension = mime === "audio/ogg" ? "ogg" : mime === "audio/mp4" ? "m4a" : mime === "audio/mpeg" ? "mp3" : "webm";
  const path = `${randomUUID()}.${extension}`;
  const storageUrl = `${config.agentUrl()}/storage/v1/object/aluga-internal-chat/${path}`;
  const uploaded = await fetch(storageUrl, { method: "POST", headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}`, "Content-Type": mime }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!uploaded?.ok) throw new UpstreamError("Não foi possível salvar o áudio interno", 502);
  try {
    const rows = await agentRest("panel_internal_messages", { method: "POST", params: { select: "*" }, body: { sender_user_id: req.operator!.user_id, team_id: teamId, recipient_user_id: recipientUserId, body: "[Áudio]", media_path: path, media_mime_type: mime, media_duration_seconds: duration }, headers: { Prefer: "return=representation" } });
    res.status(201).json({ message: rows[0] });
  } catch (error) {
    await fetch(storageUrl, { method: "DELETE", headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` } }).catch(() => undefined);
    throw error;
  }
});
router.get("/internal/media/:id", async (req: AuthRequest, res) => {
  const id = safeId(String(req.params.id));
  const rows = await agentRest("panel_internal_messages", { params: { select: "team_id,recipient_user_id,sender_user_id,media_path,media_mime_type", id: `eq.${id}`, limit: "1" } });
  const message = rows?.[0];
  if (!message?.media_path || !message.media_mime_type?.startsWith("audio/")) throw new UpstreamError("Áudio não encontrado", 404);
  if (message.team_id) await teamAccess(req.operator!, message.team_id);
  else if (![message.sender_user_id, message.recipient_user_id].includes(req.operator!.user_id)) throw new UpstreamError("Sem acesso a este áudio", 403);
  const stored = await fetch(`${config.agentUrl()}/storage/v1/object/authenticated/aluga-internal-chat/${encodeURIComponent(message.media_path)}`, { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!stored?.ok) throw new UpstreamError("Áudio arquivado indisponível", 502);
  const bytes = Buffer.from(await stored.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new UpstreamError("Áudio acima do limite", 413);
  res.setHeader("Content-Type", message.media_mime_type);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(bytes);
});

router.get("/conversations", async (req: AuthRequest, res) => {
  const recent = await agentRest("chat_sessions", { params: { select: "*", order: "created_at.desc", limit: "500" } });
  const byContact = new Map<string, any>();
  for (const session of recent as any[]) {
    const key = `${String(session.contact_id ?? session.phone ?? session.id)}:${String(session.channel_id ?? "legacy")}`;
    const current = byContact.get(key);
    const isOpen = (item: any) => !item.closed_at && item.status !== "encerrado";
    if (!current || (!isOpen(current) && isOpen(session))) byContact.set(key, session);
  }
  const sessions = [...byContact.values()].sort((a, b) =>
    String(b.last_message_at ?? b.created_at).localeCompare(String(a.last_message_at ?? a.created_at))
  ).slice(0, 100);
  const ids = sessions.map((item) => item.contact_id).filter((id) => typeof id === "string" && uuid.test(id));
  const sessionIds = sessions.map((item) => item.id).filter((id) => typeof id === "string" && uuid.test(id));
  const [contacts, handoffs, tagLinks, tags, recentMessages] = await Promise.all([
    ids.length ? agentRest("contacts", { params: { select: "*", id: `in.(${[...new Set(ids)].join(",")})` } }) : [],
    sessionIds.length ? agentRest("human_handoffs", { params: { select: "*", session_id: `in.(${sessionIds.join(",")})`, order: "created_at.desc", limit: "200" } }) : [],
    ids.length ? agentRest("contact_tags", { params: { select: "contact_id,tag_id", contact_id: `in.(${[...new Set(ids)].join(",")})`, removed_at: "is.null", limit: "500" } }) : [],
    agentRest("tags", { params: { select: "id,slug,name,color", active: "eq.true" } }),
    sessionIds.length ? agentRest("chat_messages", { params: { select: "session_id,metadata,direction,sender_type", session_id: `in.(${sessionIds.join(",")})`, order: "created_at.desc", limit: "1000" } }) : [],
  ]);
  const contactById = new Map((contacts as any[]).map((item) => [item.id, item]));
  const handoffBySession = new Map<string, any>();
  for (const item of handoffs as any[]) if (!handoffBySession.has(item.session_id)) handoffBySession.set(item.session_id, item);
  const tagById = new Map((tags as any[]).map((item) => [item.id, item]));
  const tagsByContact = new Map<string, any[]>();
  for (const item of tagLinks as any[]) tagsByContact.set(item.contact_id, [...(tagsByContact.get(item.contact_id) ?? []), tagById.get(item.tag_id)].filter(Boolean));
  const channelBySession = new Map<string, string>();
  for (const item of recentMessages as any[]) if (!channelBySession.has(item.session_id) && typeof item.metadata?.instance === "string") channelBySession.set(item.session_id, item.metadata.instance);
  const answeredByLIA = new Set((recentMessages as any[]).filter((item) => item.direction === "outbound" && item.sender_type === "ai").map((item) => item.session_id));
  const teamIds = await teamIdsFor(req.operator!);
  res.json({ conversations: sessions.filter((session) => visibleTo(req.operator!, session, handoffBySession.get(session.id), teamIds)).map((session) => ({ ...session, initial_new: !answeredByLIA.has(session.id), channel: channelBySession.get(session.id) ?? config.instance(), contact: contactById.get(session.contact_id) ?? null, handoff: handoffBySession.get(session.id) ?? null, tags: tagsByContact.get(session.contact_id) ?? [] })) });
});

router.post("/conversations/:id/route", async (req: AuthRequest, res) => {
  const target = String(req.body?.target ?? "");
  const targetUserId = req.body?.targetUserId == null ? null : safeId(String(req.body.targetUserId));
  const teamId = req.body?.teamId == null ? null : safeId(String(req.body.teamId));
  if (!["new", "operator", "eva", "team"].includes(target) || (target === "operator") !== Boolean(targetUserId) || (target === "team") !== Boolean(teamId)) throw new UpstreamError("Destino inválido", 400);
  const session = await sessionFor(req, String(req.params.id));
  if (target === "eva") {
    if (session.metadata?.ai_admission === "unverified" && req.body?.historyReviewed !== true) throw new UpstreamError("Revise o contexto anterior antes de ativar a LIA nesta conversa", 409);
    if (!session.channel_id || !session.assigned_team_id) throw new UpstreamError("Defina a equipe responsável antes de ativar a LIA", 409);
    const [channels, teams] = await Promise.all([
      agentRest("panel_channels", { params: { select: "id", id: `eq.${session.channel_id}`, default_team_id: `eq.${session.assigned_team_id}`, ai_enabled: "eq.true", active: "eq.true", limit: "1" } }),
      agentRest("panel_teams", { params: { select: "id", id: `eq.${session.assigned_team_id}`, ai_enabled: "eq.true", active: "eq.true", limit: "1" } }),
    ]);
    if (!channels.length || !teams.length) throw new UpstreamError("Ative a LIA na equipe e no canal antes de transferir esta conversa", 409);
  }
  const result = target === "team"
    ? await agentRpc("panel_route_to_team", { p_session_id: session.id, p_operator_id: req.operator!.user_id, p_team_id: teamId })
    : await agentRpc("panel_route_session", { p_session_id: session.id, p_operator_id: req.operator!.user_id, p_target: target, p_target_user_id: targetUserId });
  res.json(result);
});

router.get("/conversations/:id", async (req: AuthRequest, res) => {
  const id = safeId(req.params.id as string);
  const [sessions, handoffs] = await Promise.all([
    agentRest("chat_sessions", { params: { select: "*", id: `eq.${id}`, limit: "1" } }),
    agentRest("human_handoffs", { params: { select: "*", session_id: `eq.${id}`, order: "created_at.desc", limit: "20" } }),
  ]);
  const session = sessions?.[0];
  if (!session) throw new UpstreamError("Conversa não encontrada", 404);
  if (!visibleTo(req.operator!, session, handoffs?.[0], await teamIdsFor(req.operator!))) throw new UpstreamError("Conversa não autorizada", 403);
  const [messages, interests] = await Promise.all([
    agentRest("chat_messages", { params: { select: "*", session_id: `eq.${id}`, order: "created_at.asc", limit: "200" } }),
    agentRest("property_interests", { params: { select: "*", session_id: `eq.${id}`, order: "created_at.desc", limit: "50" } }),
  ]);
  res.json({ session, messages, handoffs, interests });
});

router.patch("/conversations/:id/contact", async (req: AuthRequest, res) => {
  const session = await sessionFor(req, String(req.params.id));
  if (!session.contact_id) throw new UpstreamError("Conversa sem contato", 422);
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim();
  const fields = req.body?.fields;
  if (name.length > 120 || email.length > 254 || notes.length > 4000 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new UpstreamError("Dados de contato inválidos", 400);
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length > 12 || Object.entries(fields).some(([key, value]) => key.length > 40 || !/^[\p{L}\p{N} _-]+$/u.test(key) || typeof value !== "string" || value.length > 300)) throw new UpstreamError("Campos personalizados inválidos", 400);
  const contacts = await agentRest("contacts", { params: { select: "id,metadata", id: `eq.${session.contact_id}`, limit: "1" } });
  const contact = contacts?.[0];
  if (!contact) throw new UpstreamError("Contato não encontrado", 404);
  const metadata = { ...(contact.metadata ?? {}), panel_fields: { email, notes, fields } };
  const updated = await agentRest("contacts", { method: "PATCH", params: { id: `eq.${session.contact_id}`, select: "*" }, body: { name: name || null, metadata }, headers: { Prefer: "return=representation" } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, session_id: session.id, action: "edit_contact", details: { contact_id: session.contact_id, fields: Object.keys(fields) } } });
  res.json({ contact: updated?.[0] });
});

router.get("/conversations/:id/avatar", async (req: AuthRequest, res) => {
  const session = await sessionFor(req, String(req.params.id));
  const instance = await instanceForSession(session.id);
  const number = String(session.phone ?? "").replace(/@.*$/, "").replace(/\D/g, "");
  const key = `${instance}:${number}`;
  const cached = profileCache.get(key);
  let url = cached && cached.until > Date.now() ? cached.url : null;
  if (url === null) {
    try {
      const result = await evolution(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify({ number }) });
      url = String(result?.profilePictureUrl ?? result?.profilePicUrl ?? "");
      if (url && !/^https:\/\/[^\s]+$/.test(url)) url = "";
    } catch { url = ""; }
    profileCache.set(key, { url, until: Date.now() + 5 * 60_000 });
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  if (url) return res.redirect(302, url);
  const initials = String(req.query.initials ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="#DCEAFB"/><text x="24" y="25" text-anchor="middle" dominant-baseline="central" fill="#315A83" font-family="Arial,sans-serif" font-size="17" font-weight="700">${initials}</text></svg>`);
});

router.get("/conversations/:id/media/:messageId", async (req: AuthRequest, res) => {
  const session = await sessionFor(req, String(req.params.id));
  const messageId = safeId(String(req.params.messageId));
  const rows = await agentRest("chat_messages", { params: { select: "id,provider_message_id,media_mime_type,media_filename,media_url,metadata", id: `eq.${messageId}`, session_id: `eq.${session.id}`, limit: "1" } });
  const message = rows?.[0];
  if (!message) throw new UpstreamError("Mídia não encontrada", 404);
  let base64 = "";
  let mime = String(message.media_mime_type ?? "").split(";")[0].toLowerCase();
  if (!message.provider_message_id) throw new UpstreamError("Arquivo antigo indisponível na Evolution", 404);
  const instance = typeof message.metadata?.instance === "string" ? message.metadata.instance : await instanceForSession(session.id);
  const archived = await agentRest("chat_media_archive", { params: { select: "storage_path,mime_type,size_bytes", instance_name: `eq.${instance}`, provider_message_id: `eq.${message.provider_message_id}`, limit: "1" } }).then((rows) => rows?.[0], () => null);
  if (archived?.storage_path && archived.size_bytes <= 20 * 1024 * 1024) {
    const objectPath = String(archived.storage_path).split("/").map(encodeURIComponent).join("/");
    const stored = await fetch(`${config.agentUrl()}/storage/v1/object/authenticated/eva-media/${objectPath}`, { headers: { apikey: config.agentKey(), Authorization: `Bearer ${config.agentKey()}` }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (stored?.ok) {
      const bytes = Buffer.from(await stored.arrayBuffer());
      if (bytes.length <= 20 * 1024 * 1024) {
        const storedMime = String(archived.mime_type ?? mime).split(";")[0].toLowerCase();
        if (!mediaTypes.has(storedMime)) throw new UpstreamError("Formato de mídia não suportado", 415);
        const filename = String(message.media_filename ?? "documento").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120);
        res.setHeader("Content-Type", storedMime);
        res.setHeader("Content-Disposition", `${storedMime.startsWith("audio/") || storedMime.startsWith("image/") ? "inline" : "attachment"}; filename="${filename}"`);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.send(bytes);
        return;
      }
    }
  }
  const original = await providerMessage(instance, message.provider_message_id);
  if (!original) throw new UpstreamError("Arquivo não encontrado na Evolution", 404);
  try {
    const media = await evolution(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify({ message: original, convertToMp4: false }) }, 30000);
    base64 = String(media?.base64 ?? "").replace(/^data:[^,]+,/, "");
    mime = String(media?.mimetype ?? media?.mimeType ?? mime).split(";")[0].toLowerCase();
  } catch { throw new UpstreamError("Esta mídia não está mais disponível na Evolution", 404); }
  if (!mediaTypes.has(mime) || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new UpstreamError("Formato de mídia não suportado", 415);
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 15 * 1024 * 1024) throw new UpstreamError("Arquivo excede 15 MB", 413);
  const filename = String(message.media_filename ?? "documento").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `${mime.startsWith("audio/") || mime.startsWith("image/") ? "inline" : "attachment"}; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(bytes);
});

router.post("/conversations/:id/assist", async (req: AuthRequest, res) => {
  const session = await sessionFor(req, String(req.params.id));
  const mode = String(req.body?.mode ?? "");
  const draft = String(req.body?.draft ?? "").trim();
  if (!['suggest', 'improve'].includes(mode) || (mode === 'improve' && (!draft || draft.length > 4000))) throw new UpstreamError("Pedido de assistência inválido", 400);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new UpstreamError("Configure OPENAI_API_KEY no servidor para usar a assistência", 503);
  const rows = await agentRest("chat_messages", { params: { select: "sender_type,direction,normalized_content,content,created_at", session_id: `eq.${session.id}`, order: "created_at.desc", limit: "16" } });
  const history = (rows as any[]).reverse().map((row) => `${row.direction === 'inbound' ? 'Cliente' : row.sender_type === 'human' ? 'Atendente' : 'LIA'}: ${String(row.normalized_content || row.content || '').slice(0, 800)}`).join("\n");
  const instructions = mode === "suggest"
    ? "Sugira uma resposta curta em português brasileiro para o atendente imobiliário. Avance o atendimento sem repetir perguntas já respondidas. Não invente imóveis, preços, disponibilidade nem promessas. Use no máximo dois blocos curtos. Retorne apenas o texto sugerido."
    : "Aprimore apenas o rascunho do atendente em português brasileiro: corrija ortografia e clareza, preserve fatos, intenção e tom natural. Não invente informações, preços ou promessas. Retorne apenas o texto revisado.";
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_ASSIST_MODEL || "gpt-4.1-mini", store: false, instructions, input: `Contexto da conversa:\n${history}\n\n${mode === "improve" ? `Rascunho a revisar:\n${draft}` : "Sugira a próxima resposta do atendente."}`, max_output_tokens: 300 }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new UpstreamError("Assistência de IA indisponível no momento", 502);
  const data: any = await response.json();
  const suggestion = String(data.output_text ?? data.output?.flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("\n") ?? "").trim();
  if (!suggestion) throw new UpstreamError("IA não retornou uma sugestão", 502);
  res.json({ suggestion: suggestion.slice(0, 4000) });
});

router.post("/conversations/:id/assume", async (req: AuthRequest, res) => {
  const result = await agentRpc("panel_assume_session", { p_session_id: safeId(req.params.id as string), p_operator_id: req.operator!.user_id });
  res.json(result);
});
router.post("/conversations/:id/claim", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const session = await sessionFor(req, String(req.params.id));
  if (session.closed_at || session.ai_enabled || session.status !== "atendimento_humano") throw new UpstreamError("Atendimento humano não está ativo", 409);
  const [handoffs, pending] = await Promise.all([
    agentRest("human_handoffs", { params: { select: "*", session_id: `eq.${session.id}`, status: "in.(active,accepted,em_atendimento)", order: "created_at.desc", limit: "1" } }),
    agentRest("panel_outbound", { params: { select: "id", session_id: `eq.${session.id}`, status: "in.(reserved,uncertain)", limit: "1" } }),
  ]);
  const handoff = handoffs?.[0];
  if (!handoff) throw new UpstreamError("Transferência humana ativa não encontrada", 409);
  if (pending?.length) throw new UpstreamError("Há um envio sem confirmação nesta conversa. Confira os alertas antes de assumir.", 409);
  if (handoff.assigned_to === req.operator!.display_name) { res.json({ assigned_to: handoff.assigned_to }); return; }
  const previous = String(handoff.assigned_to ?? "");
  const assignedFilter = previous ? `eq.${previous}` : "is.null";
  const updated = await agentRest("human_handoffs", { method: "PATCH", params: { id: `eq.${handoff.id}`, status: `eq.${handoff.status}`, assigned_to: assignedFilter, select: "id,assigned_to,status" }, body: { assigned_to: req.operator!.display_name, updated_at: new Date().toISOString(), metadata: { ...(handoff.metadata ?? {}), panel_claimed_from: previous, panel_claimed_by: req.operator!.user_id } }, headers: { Prefer: "return=representation" } });
  if (!updated?.[0]) throw new UpstreamError("A atribuição mudou. Atualize a conversa e tente novamente.", 409);
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, session_id: session.id, action: "claim_handoff", details: { handoff_id: handoff.id, from: previous, to: req.operator!.display_name } } });
  res.json({ assigned_to: req.operator!.display_name, previous });
});
router.post("/conversations/:id/finish", async (req: AuthRequest, res) => {
  const outcome = req.body?.outcome;
  if (outcome !== "resume_ai" && outcome !== "close_session") throw new UpstreamError("Ação inválida", 400);
  const session = await sessionFor(req, String(req.params.id));
  if (outcome === "resume_ai" && session.metadata?.ai_admission === "unverified" && req.body?.historyReviewed !== true) throw new UpstreamError("Revise o contexto anterior antes de devolver esta conversa à LIA", 409);
  const result = await agentRpc("panel_finish_session", { p_session_id: session.id, p_operator_id: req.operator!.user_id, p_outcome: outcome });
  res.json(result);
});
router.post("/conversations/:id/reply", async (req: AuthRequest, res) => {
  const sessionId = safeId(req.params.id as string);
  const draft = String(req.body?.text ?? "").trim();
  const text = signedReply(req.operator!, draft);
  const requestKey = safeId(String(req.body?.requestKey ?? randomUUID()));
  if (!draft || text.length > 4000) throw new UpstreamError("Mensagem deve ter até 4.000 caracteres com a assinatura", 400);
  const reservation = await agentRpc("panel_takeover_and_reserve_outbound", { p_session_id: sessionId, p_operator_id: req.operator!.user_id, p_request_key: requestKey, p_body: text });
  if (!reservation.created) { res.status(reservation.status === "sent" ? 200 : 202).json({ ...reservation, requestKey }); return; }
  try {
    const sessions = await agentRest("chat_sessions", { params: { select: "phone", id: `eq.${sessionId}`, limit: "1" } });
    const number = String(sessions?.[0]?.phone ?? "").replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    if (!number) throw new UpstreamError("Telefone da conversa ausente", 422);
    const response = await evolution(`/message/sendText/${encodeURIComponent(await instanceForSession(sessionId))}`, { method: "POST", body: JSON.stringify({ number, text }) }, 30000);
    const providerId = response?.key?.id ?? response?.data?.key?.id ?? response?.message?.key?.id;
    if (!providerId || typeof providerId !== "string") throw new UpstreamError("Evolution não confirmou o ID da mensagem; verifique antes de reenviar", 502);
    const result = await agentRpc("panel_confirm_outbound", { p_request_key: requestKey, p_provider_message_id: providerId });
    res.json({ ...result, requestKey });
  } catch (error) {
    await agentRpc("panel_mark_uncertain_outbound", { p_request_key: requestKey, p_reason: errorText(error) }).catch(() => undefined);
    res.status(202).json({ status: "uncertain", requestKey, message: "Envio sem confirmação completa. Confira a conversa antes de tentar novamente." });
  }
});

router.post("/conversations/:id/audio", async (req: AuthRequest, res) => {
  const sessionId = safeId(String(req.params.id));
  const requestKey = safeId(String(req.body?.requestKey ?? randomUUID()));
  const mime = String(req.body?.mimeType ?? "").split(";")[0].toLowerCase();
  const audio = String(req.body?.base64 ?? "");
  if (!["audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg"].includes(mime) || audio.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(audio)) throw new UpstreamError("Áudio inválido ou maior que 5 MB", 400);
  const label = `[Áudio ${requestKey}]`;
  const reservation = await agentRpc("panel_takeover_and_reserve_outbound", { p_session_id: sessionId, p_operator_id: req.operator!.user_id, p_request_key: requestKey, p_body: label });
  if (!reservation.created) { res.status(reservation.status === "sent" ? 200 : 202).json({ ...reservation, requestKey }); return; }
  try {
    const session = await sessionFor(req, sessionId);
    const number = String(session.phone ?? "").replace(/@.*$/, "").replace(/\D/g, "");
    if (!number) throw new UpstreamError("Telefone da conversa ausente", 422);
    const instance = await instanceForSession(sessionId);
    const response = await evolution(`/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify({ number, audio, encoding: true }) }, 30000);
    const providerId = response?.key?.id ?? response?.data?.key?.id ?? response?.message?.key?.id;
    if (!providerId || typeof providerId !== "string") throw new UpstreamError("Evolution não confirmou o áudio", 502);
    await agentRpc("panel_confirm_outbound", { p_request_key: requestKey, p_provider_message_id: providerId });
    const saved = await agentRest("chat_messages", { method: "PATCH", params: { session_id: `eq.${sessionId}`, provider_message_id: `eq.${providerId}` }, body: { content: "[Áudio]", normalized_content: "[Áudio enviado pelo atendente]", message_type: "audio", media_mime_type: mime, metadata: { source: "panel", instance, delivery_status: "sent", outbound_id: reservation.id } } }).then(() => true, () => false);
    res.json({ status: "sent", requestKey, warning: saved ? undefined : "Áudio enviado, mas o histórico ainda precisa ser atualizado." });
  } catch (error) {
    await agentRpc("panel_mark_uncertain_outbound", { p_request_key: requestKey, p_reason: errorText(error) }).catch(() => undefined);
    res.status(202).json({ status: "uncertain", requestKey, message: "Envio de áudio sem confirmação completa. Confira a conversa antes de tentar novamente." });
  }
});

router.post("/conversations/:id/file", async (req: AuthRequest, res) => {
  const sessionId = safeId(String(req.params.id));
  const requestKey = safeId(String(req.body?.requestKey ?? randomUUID()));
  const kind = String(req.body?.kind ?? "");
  const mime = String(req.body?.mimeType ?? "").split(";")[0].toLowerCase();
  const fileName = String(req.body?.fileName ?? "arquivo").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 120);
  const media = String(req.body?.base64 ?? "");
  const valid = kind === "sticker" ? mime === "image/webp" : kind === "image" ? ["image/jpeg", "image/png", "image/webp"].includes(mime) : kind === "document" && mediaTypes.has(mime) && !mime.startsWith("audio/");
  if (!valid || media.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(media)) throw new UpstreamError("Arquivo inválido ou maior que 5 MB", 400);
  const label = `[${kind === "sticker" ? "Figurinha" : kind === "image" ? "Imagem" : "Documento"} ${requestKey}]`;
  const reservation = await agentRpc("panel_takeover_and_reserve_outbound", { p_session_id: sessionId, p_operator_id: req.operator!.user_id, p_request_key: requestKey, p_body: label });
  if (!reservation.created) { res.status(reservation.status === "sent" ? 200 : 202).json({ ...reservation, requestKey }); return; }
  try {
    const session = await sessionFor(req, sessionId);
    const number = String(session.phone ?? "").replace(/@.*$/, "").replace(/\D/g, "");
    if (!number) throw new UpstreamError("Telefone da conversa ausente", 422);
    const instance = await instanceForSession(sessionId);
    const endpoint = kind === "sticker" ? "sendSticker" : "sendMedia";
    const payload = kind === "sticker" ? { number, sticker: media } : { number, mediatype: kind, mimetype: mime, media, fileName };
    const response = await evolution(`/message/${endpoint}/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify(payload) }, 30000);
    const providerId = response?.key?.id ?? response?.data?.key?.id ?? response?.message?.key?.id;
    if (!providerId || typeof providerId !== "string") throw new UpstreamError("Evolution não confirmou o arquivo", 502);
    await agentRpc("panel_confirm_outbound", { p_request_key: requestKey, p_provider_message_id: providerId });
    const saved = await agentRest("chat_messages", { method: "PATCH", params: { session_id: `eq.${sessionId}`, provider_message_id: `eq.${providerId}` }, body: { content: `[${kind === "sticker" ? "Figurinha" : kind === "image" ? "Imagem" : "Documento"}]`, normalized_content: null, message_type: kind, media_mime_type: mime, media_filename: fileName, metadata: { source: "panel", instance, delivery_status: "sent", outbound_id: reservation.id } } }).then(() => true, () => false);
    res.json({ status: "sent", requestKey, warning: saved ? undefined : "Arquivo enviado, mas o histórico ainda precisa ser atualizado." });
  } catch (error) {
    await agentRpc("panel_mark_uncertain_outbound", { p_request_key: requestKey, p_reason: errorText(error) }).catch(() => undefined);
    res.status(202).json({ status: "uncertain", requestKey, message: "Envio sem confirmação completa. Confira a conversa antes de tentar novamente." });
  }
});

router.get("/properties", async (req, res) => {
  const rows = await catalogRest("properties", { params: { select: "source_property_id,title,property_type,neighborhood,city,rental_price,price,area,bedrooms,parking,url,transaction_type,context_transaction_type,updated_at", order: "updated_at.desc", limit: "200" } });
  res.json({ properties: (rows as any[]).map((property) => ({
    ...property,
    id: property.source_property_id,
    code: property.source_property_id,
  })) });
});
router.get("/connection", async (_req, res) => {
  res.json({ instance: config.instance(), data: await evolution(`/instance/connectionState/${encodeURIComponent(config.instance())}`) });
});
router.get("/connection/instances", async (_req, res) => {
  const rows = await evolution("/instance/fetchInstances");
  res.json({ instances: (Array.isArray(rows) ? rows : []).map((row: any) => ({ name: row.name, state: row.connectionStatus, profileName: row.profileName, number: row.ownerJid })) });
});
router.get("/channels", async (_req, res) => {
  const channels = await agentRest("panel_channels", { params: { select: "id,instance_name,display_name,purpose,instructions,default_team_id,ai_enabled,active", order: "display_name.asc" } });
  res.json({ channels });
});
router.patch("/channels/:id", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const id = safeId(String(req.params.id));
  const displayName = String(req.body?.displayName ?? "").trim();
  const purpose = String(req.body?.purpose ?? "").trim();
  const instructions = String(req.body?.instructions ?? "").trim();
  const defaultTeamId = req.body?.defaultTeamId ? safeId(String(req.body.defaultTeamId)) : null;
  if (!displayName || displayName.length > 80 || purpose.length > 500 || instructions.length > 4000 || typeof req.body?.aiEnabled !== "boolean" || typeof req.body?.active !== "boolean") throw new UpstreamError("Configuração de canal inválida", 400);
  if (req.body.aiEnabled) {
    if (!defaultTeamId) throw new UpstreamError("Escolha uma equipe com a LIA ativada", 400);
    const teams = await agentRest("panel_teams", { params: { select: "id", id: `eq.${defaultTeamId}`, active: "eq.true", ai_enabled: "eq.true", limit: "1" } });
    if (!teams.length) throw new UpstreamError("Ative a LIA na equipe antes de ativá-la neste canal", 409);
  }
  const channel = await agentRpc("panel_update_channel", { p_channel_id: id, p_operator_id: req.operator!.user_id, p_display_name: displayName, p_purpose: purpose, p_instructions: instructions, p_default_team_id: defaultTeamId, p_ai_enabled: req.body.aiEnabled, p_active: req.body.active });
  res.json({ channel });
});
router.post("/connection/instances", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const name = String(req.body?.name ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{3,48}$/.test(name)) throw new UpstreamError("Nome da instância inválido", 400);
  const sourceWebhook = await evolution(`/webhook/find/${encodeURIComponent(config.instance())}`);
  if (!sourceWebhook?.url || !sourceWebhook?.enabled) throw new UpstreamError("Webhook principal não está configurado. Configure-o antes de criar outro canal.", 409);
  await evolution("/instance/create", { method: "POST", body: JSON.stringify({ instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: true }) }, 30000);
  try {
    await evolution(`/webhook/set/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify({ webhook: { enabled: true, url: sourceWebhook.url, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE"] } }) });
  } catch {
    throw new UpstreamError(`Instância ${name} criada, mas o webhook não foi configurado. Verifique a Evolution antes de conectar o número.`, 502);
  }
  await agentRest("panel_channels", { method: "POST", params: { on_conflict: "instance_name" }, body: { instance_name: name, display_name: name, ai_enabled: false, active: true }, headers: { Prefer: "resolution=merge-duplicates" } });
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "create_channel", details: { instance: name } } });
  res.status(201).json({ name, webhookConfigured: true });
});
router.get("/connection/instances/:name/qr", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const name = String(req.params.name);
  if (!/^[a-zA-Z0-9_-]{3,48}$/.test(name)) throw new UpstreamError("Instância inválida", 400);
  const rows = await evolution("/instance/fetchInstances");
  if (!Array.isArray(rows) || !rows.some((row: any) => row.name === name)) throw new UpstreamError("Instância não encontrada", 404);
  res.json({ instance: name, data: await evolution(`/instance/connect/${encodeURIComponent(name)}`) });
});
router.post("/connection/instances/:name/disconnect", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const name = String(req.params.name);
  if (!/^[a-zA-Z0-9_-]{3,48}$/.test(name)) throw new UpstreamError("Instância inválida", 400);
  const rows = await evolution("/instance/fetchInstances");
  if (!Array.isArray(rows) || !rows.some((row: any) => row.name === name)) throw new UpstreamError("Instância não encontrada", 404);
  let result: unknown;
  try { result = await evolution(`/instance/logout/${encodeURIComponent(name)}`, { method: "DELETE" }, 30000); }
  catch (error) {
    // Some Evolution versions close the socket before returning an error.
    const state = await evolution(`/instance/connectionState/${encodeURIComponent(name)}`).catch(() => null);
    if (!["close", "closed", "disconnected"].includes(String(state?.instance?.state ?? state?.state).toLowerCase())) throw error;
    result = { state: state?.instance?.state ?? state?.state };
  }
  await agentRest("panel_audit_log", { method: "POST", body: { operator_id: req.operator!.user_id, action: "instance_disconnected", details: { instance: name } } });
  res.json({ disconnected: true, result });
});
router.get("/connection/qr", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  res.json({ instance: config.instance(), data: await evolution(`/instance/connect/${encodeURIComponent(config.instance())}`) });
});
router.get("/alerts", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin", "supervisor"]);
  const [events, outbound] = await Promise.all([
    agentRest("agent_events", { params: { select: "id,session_id,event_type,tool_name,success,error_message,created_at", success: "eq.false", order: "created_at.desc", limit: "100" } }),
    agentRest("panel_outbound", { params: { select: "id,session_id,operator_id,body,status,provider_message_id,created_at", status: "in.(reserved,uncertain)", order: "created_at.desc", limit: "100" } }),
  ]);
  res.json({ events, outbound });
});

router.post("/alerts/outbound/:id/reconcile", async (req: AuthRequest, res) => {
  roleAllowed(req.operator!, ["admin"]);
  const status = String(req.body?.status ?? "");
  const providerId = String(req.body?.providerMessageId ?? "").trim();
  if (!(["sent", "failed"] as string[]).includes(status) || (status === "sent" && !providerId)) {
    throw new UpstreamError("Informe o resultado e, se enviada, o ID da mensagem", 400);
  }
  const result = await agentRpc("panel_reconcile_outbound", {
    p_outbound_id: safeId(req.params.id as string), p_operator_id: req.operator!.user_id,
    p_status: status, p_provider_message_id: providerId || null,
  });
  res.json(result);
});

export function panelError(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = error instanceof UpstreamError ? error.status : Number((error as any)?.status) === 413 ? 413 : 500;
  res.status(status).json({ error: status === 500 ? "Erro interno no painel" : status === 413 ? "Arquivo maior que o limite de 5 MB" : errorText(error) });
}
export default router;

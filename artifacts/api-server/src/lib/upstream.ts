export class UpstreamError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new UpstreamError(`Configure ${name} no servidor.`, 503);
  return value.replace(/\/$/, "");
}

export const config = {
  agentUrl: () => required("SUPABASE_AGENT_URL"),
  agentKey: () => required("SUPABASE_AGENT_SERVICE_ROLE_KEY"),
  anonKey: () => required("SUPABASE_AGENT_ANON_KEY"),
  catalogUrl: () => required("SUPABASE_CATALOG_URL"),
  catalogKey: () => required("SUPABASE_CATALOG_SERVICE_ROLE_KEY"),
  evolutionUrl: () => required("EVOLUTION_API_URL"),
  evolutionKey: () => required("EVOLUTION_API_KEY"),
  instance: () => required("EVOLUTION_INSTANCE"),
};

export async function remoteJson(url: string, init: RequestInit = {}, timeoutMs = 12000): Promise<any> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) { throw new UpstreamError(error instanceof Error ? error.message : "Serviço indisponível", 502); }
  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw.slice(0, 200) }; }
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : typeof data?.msg === "string" ? data.msg : typeof data?.error_description === "string" ? data.error_description : typeof data?.error === "string" ? data.error : `Serviço respondeu ${response.status}`;
    const status = [400, 401, 403, 404, 409].includes(response.status) ? response.status : 502;
    throw new UpstreamError(message, status);
  }
  return data;
}

type RestInit = { method?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> };
async function rest(base: string, key: string, resource: string, options: RestInit = {}): Promise<any> {
  const url = new URL(`${base}/rest/v1/${resource}`);
  Object.entries(options.params ?? {}).forEach(([name, value]) => url.searchParams.set(name, value));
  return remoteJson(url.toString(), {
    method: options.method ?? "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export const agentRest = (resource: string, options?: RestInit) => rest(config.agentUrl(), config.agentKey(), resource, options);
export const catalogRest = (resource: string, options?: RestInit) => rest(config.catalogUrl(), config.catalogKey(), resource, options);
export const agentRpc = (name: string, body: Record<string, unknown>) => agentRest(`rpc/${name}`, { method: "POST", body });

export async function authRequest(path: string, init: RequestInit): Promise<any> {
  return remoteJson(`${config.agentUrl()}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: config.anonKey(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export async function evolution(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<any> {
  return remoteJson(`${config.evolutionUrl()}${path}`, {
    ...init,
    headers: { apikey: config.evolutionKey(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  }, timeoutMs);
}

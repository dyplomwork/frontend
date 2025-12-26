export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

const LS_TOKEN = 'casino_sim_token_v1'

function getEnv(key: string): string {
  return (import.meta as any)?.env?.[key] ?? ''
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function getToken(): string {
  if (!isBrowser()) return ''
  return localStorage.getItem(LS_TOKEN) ?? ''
}

function resolveServiceBase(path: string): string {
  // твой текущий base
  return getEnv('VITE_API_BASE_URL') || 'https://api.scxdrop.online'
}

function looksLikeJsonString(s: string): boolean {
  const t = s.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

export type ApiCallOptions = RequestInit & {
  baseUrl?: string
  noAuth?: boolean
  /**
   * Если true — принудительно считаем body JSON
   * (даже если это строка)
   */
  json?: boolean
}

/**
 * Minimal fetch wrapper with:
 * - JSON body support (object -> JSON.stringify)
 * - correct Content-Type for JSON strings
 * - Bearer token (if present)
 */
export async function api<T>(path: string, opts: ApiCallOptions = {}): Promise<T> {
  if (!isBrowser()) throw new ApiError(0, 'API is not available during SSR/prerender')

  const headers: Record<string, string> = { ...(opts.headers as any || {}) }

  const hasBody = Object.prototype.hasOwnProperty.call(opts, 'body') && opts.body != null

  // ---- JSON handling (FIX) ----
  let body = opts.body as any

  const wantsJson =
    !!opts.json ||
    (hasBody && typeof body === 'string' && looksLikeJsonString(body)) ||
    (hasBody && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer))

  // если body — объект и это JSON, сериализуем
  if (hasBody && wantsJson && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body)
  }

  // если это JSON (строка или сериализованный объект) — ставим Content-Type
  if (hasBody && wantsJson && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json;charset=UTF-8'
  }
  // ---- /JSON handling ----

  const token = getToken()
  if (!opts.noAuth && token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const baseUrl = opts.baseUrl ?? resolveServiceBase(path)
  const url = joinUrl(baseUrl, path)

  const { baseUrl: _ignoredBaseUrl, noAuth: _ignoredNoAuth, json: _ignoredJson, ...fetchOpts } = opts
  const res = await fetch(url, { ...fetchOpts, body, headers })

  const raw = await res.text().catch(() => '')
  let data: any = {}
  if (raw) {
    try { data = JSON.parse(raw) } catch { data = raw }
  }

  if (!res.ok) {
    const msg =
      (typeof data === 'object' && data && (data.message || data.error)) ||
      `HTTP ${res.status}`
    throw new ApiError(res.status, msg, data)
  }

  return data as T
}

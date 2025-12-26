export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data?: any){
    super(message)
    this.status = status
    this.data = data
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

/**
 * Token storage key. Keep this stable so you can swap backends without breaking existing sessions.
 */
const LS_TOKEN = 'casino_sim_token_v1'

/**
 * Backend wiring (microservices-friendly)
 *
 * - VITE_API_BASE_URL: default base URL for all requests. Example: https://api.example.com
 * - Optional per-service overrides:
 *   - VITE_API_AUTH_URL
 *   - VITE_API_BALANCE_URL
 *   - VITE_API_CASES_URL
 *   - VITE_API_PLINKO_URL
 *   - VITE_API_ROULETTE_URL
 *   - VITE_API_TICKETS_URL
 *   - VITE_API_ADMIN_URL
 *
 * Routing:
 * - If you call api('/api/auth/login', ...) → service='AUTH' → uses VITE_API_AUTH_URL if set
 * - Otherwise falls back to VITE_API_BASE_URL
 * - If none are set, request stays relative (same-origin) — удобно для dev/proxy.
 */
function getEnv(key: string): string {
  return (import.meta as any)?.env?.[key] ?? ''
}

function joinUrl(base: string, path: string): string {
  if(!base) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function getToken(): string {
  if(!isBrowser()) return ''
  return localStorage.getItem(LS_TOKEN) ?? ''
}

function resolveServiceBase(path: string): string {
  // Expecting /api/<service>/...
  const m = path.match(/^\/api\/([^\/]+)/)
  const service = m?.[1]?.toUpperCase()

  // 1) per-service override: VITE_API_<SERVICE>_URL
  if(service) {
    const perService = getEnv(`VITE_API_${service}_URL`)
    if(perService) return perService
  }

  // 2) global base
  return 'https://api.scxdrop.online'
}

export type ApiCallOptions = RequestInit & {
  /**
   * Force a specific base URL for this call (useful for one-off calls or migrations).
   * If provided, it overrides env-based routing.
   */
  baseUrl?: string

  /**
   * If true, do NOT attach Authorization header even if token exists.
   * Useful for login/register endpoints.
   */
  noAuth?: boolean
}

/**
 * Minimal fetch wrapper with:
 * - conditional JSON Content-Type
 * - Bearer token (if present)
 * - microservice base-url routing
 */
export async function api<T>(path: string, opts: ApiCallOptions = {}): Promise<T> {
  if(!isBrowser()) throw new ApiError(0, 'API is not available during SSR/prerender')

  const headers: Record<string, string> = { ...(opts.headers as any || {}) }

  const hasBody = Object.prototype.hasOwnProperty.call(opts, 'body') && opts.body != null

  // ставим JSON Content-Type только если body есть и это НЕ FormData и НЕ строка
  if (hasBody && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  // auth header (если не отключено)
  const token = getToken()
  if(!opts.noAuth && token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const baseUrl = opts.baseUrl ?? resolveServiceBase(path)
  const url = joinUrl(baseUrl, path)

  const { baseUrl: _ignoredBaseUrl, noAuth: _ignoredNoAuth, ...fetchOpts } = opts
  const res = await fetch(url, { ...fetchOpts, headers })

  // Try JSON first, fallback to text
  const raw = await res.text().catch(() => '')
  let data: any = {}
  if(raw) {
    try { data = JSON.parse(raw) } catch { data = raw }
  }

  if(!res.ok) {
    const msg =
      (typeof data === 'object' && data && (data.message || data.error)) ||
      `HTTP ${res.status}`
    throw new ApiError(res.status, msg, data)
  }

  return data as T
}

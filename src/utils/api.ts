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
 * If your new backend uses a different token strategy, change the auth store instead of this key.
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
 * How routing works:
 * - If you call api('/api/auth/login', ...) → service = 'auth' → uses VITE_API_AUTH_URL if provided
 * - Otherwise it falls back to VITE_API_BASE_URL
 *
 * If none are set, requests stay relative (same-origin), which is convenient for local dev/proxying.
 */
function getEnv(key: string): string {
  // Vite exposes env vars on import.meta.env
  return (import.meta as any)?.env?.[key] ?? ''
}

function joinUrl(base: string, path: string): string {
  if(!base) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function resolveServiceBase(path: string): string {
  // Expecting /api/<service>/...
  const m = path.match(/^\/api\/([^\/]+)/)
  const service = m?.[1]?.toUpperCase()
  if(!service) return getEnv('VITE_API_BASE_URL')

  const override = getEnv(`VITE_API_${service}_URL`)
  if(override) return override
  return getEnv('VITE_API_BASE_URL')
}

export type ApiCallOptions = RequestInit & {
  /**
   * Force a specific base URL for this call (useful for one-off calls or migrations).
   * If provided, it overrides env-based routing.
   */
  baseUrl?: string
}

/**
 * Minimal fetch wrapper with:
 * - JSON headers
 * - Bearer token (if present)
 * - microservice base-url routing
 */
export async function api<T>(path: string, opts: ApiCallOptions = {}): Promise<T> {
  if(!isBrowser()) throw new ApiError(0, 'API is not available during SSR/prerender')

  const token = localStorage.getItem(LS_TOKEN)

  const headers: Record<string,string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as any || {})
  }
  if(token) headers['Authorization'] = `Bearer ${token}`

  const baseUrl = opts.baseUrl ?? resolveServiceBase(path)
  const url = joinUrl(baseUrl, path)

  const { baseUrl: _ignored, ...fetchOpts } = opts
  const res = await fetch(url, { ...fetchOpts, headers })

  const data = await res.json().catch(()=> ({}))
  if(!res.ok) throw new ApiError(res.status, data?.message || `HTTP ${res.status}`, data)
  return data as T
}

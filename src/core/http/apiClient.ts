import { getApiBaseUrl } from '../config/env'
import { getToken, canUseStorage, clearToken, clearCachedUser } from '../auth/storage'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function looksLikeJsonString(s: string): boolean {
  const t = s.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

export type ApiCallOptions = Omit<RequestInit, 'body' | 'headers'> & {
  baseUrl?: string
  noAuth?: boolean
  headers?: Record<string, string>
  body?: unknown
  /** If true — force treating body as JSON (even if it's a string) */
  json?: boolean
}

export async function api<T>(path: string, opts: ApiCallOptions = {}): Promise<T> {
  if (!canUseStorage()) throw new ApiError(0, 'API is not available during SSR/prerender')

  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const hasBody = Object.prototype.hasOwnProperty.call(opts, 'body') && opts.body != null

  let body = opts.body as any
  const wantsJson =
    !!opts.json ||
    (hasBody && typeof body === 'string' && looksLikeJsonString(body)) ||
    (hasBody && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer))

  // Serialize JSON bodies
  if (hasBody && wantsJson && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body)
  }

  if (hasBody && wantsJson && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json;charset=UTF-8'
  }

  const token = getToken()
  if (!opts.noAuth && token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const baseUrl = opts.baseUrl ?? getApiBaseUrl()
  const url = joinUrl(baseUrl, path)

  const { baseUrl: _ignoredBaseUrl, noAuth: _ignoredNoAuth, json: _ignoredJson, ...fetchOpts } = opts
  const res = await fetch(url, { ...fetchOpts, body, headers })

  const raw = await res.text().catch(() => '')
  let data: any = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.noAuth) {
      clearToken()
      clearCachedUser()
    }

    const fromBody = (typeof data === 'object' && data && ((data as any).message || (data as any).error))
    const msg = fromBody || (res.status === 401 ? 'Нужен вход' : `HTTP ${res.status}`)
    throw new ApiError(res.status, String(msg), data)
  }

  return data as T
}

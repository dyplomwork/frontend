import { getApiBaseUrl } from '../config/env'
import { getToken, canUseStorage } from '../auth/storage'

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

export type ApiCallOptions = Omit<RequestInit, 'body' | 'headers' | 'signal'> & {
  baseUrl?: string
  noAuth?: boolean
  headers?: Record<string, string>
  body?: unknown
  json?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export async function api<T>(path: string, opts: ApiCallOptions = {}): Promise<T> {
  if (!canUseStorage()) throw new ApiError(0, 'API is not available during SSR/prerender')

  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const hasBody = Object.prototype.hasOwnProperty.call(opts, 'body') && opts.body != null

  let body: any = opts.body
  const wantsJson =
    !!opts.json ||
    (hasBody && typeof body === 'string' && looksLikeJsonString(body)) ||
    (hasBody && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer))

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

  const controller = new AbortController()
  const signals: AbortSignal[] = []
  if (opts.signal) signals.push(opts.signal)
  signals.push(controller.signal)

  const onAbort = () => controller.abort()
  for (const s of signals) {
    if (s.aborted) controller.abort()
    else s.addEventListener('abort', onAbort, { once: true })
  }

  let timeoutId: number | null = null
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timeoutId = window.setTimeout(() => controller.abort(), opts.timeoutMs)
  }

  const { baseUrl: _ignoredBaseUrl, noAuth: _ignoredNoAuth, json: _ignoredJson, timeoutMs: _ignoredTimeout, signal: _ignoredSignal, ...fetchOpts } = opts

  let res: Response
  try {
    res = await fetch(url, { ...fetchOpts, body, headers, signal: controller.signal })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError(0, 'Request timeout')
    throw new ApiError(0, 'Network error')
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId)
    for (const s of signals) {
      try { s.removeEventListener('abort', onAbort) } catch {}
    }
  }

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
    const msg = (typeof data === 'object' && data && (data.message || data.error)) || `HTTP ${res.status}`
    throw new ApiError(res.status, String(msg), data)
  }

  return data as T
}

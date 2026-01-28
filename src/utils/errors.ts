import { ApiError } from '../core/http/apiClient'

export type NormalizedError = {
  status: number
  message: string
}

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof ApiError) {
    const message = err.message || (err.status ? `HTTP ${err.status}` : 'Network error')
    return { status: err.status || 0, message }
  }
  if (typeof err === 'object' && err && 'status' in err) {
    const status = Number((err as any).status) || 0
    const message = String((err as any).message || (status ? `HTTP ${status}` : 'Network error'))
    return { status, message }
  }
  if (err instanceof Error) return { status: 0, message: err.message || 'Error' }
  return { status: 0, message: String(err ?? 'Error') }
}

export function userMessageForStatus(status: number, fallback: string) {
  return userMessageForStatusI18n(status, fallback)
}

export function userMessageForStatusI18n(
  status: number,
  fallback: string,
  t?: (key: string, vars?: any) => string,
) {
  const tr = t ?? ((_: string) => fallback)
  if (status === 401) return t ? tr('ui.s_need_login') : fallback
  if (status === 403) return t ? tr('ui.s_forbidden') : fallback
  if (status === 429) return t ? tr('ui.s_too_many_requests') : fallback
  if (status >= 500) return t ? tr('ui.s_server_unavailable') : fallback
  return fallback
}

export function reportError(err: unknown) {
  if (import.meta.env.DEV) console.error(err)
}

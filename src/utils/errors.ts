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
  if (status === 401) return 'Нужен вход в аккаунт'
  if (status === 403) return 'Недостаточно прав'
  if (status === 429) return 'Слишком много запросов. Попробуйте позже'
  if (status >= 500) return 'Сервер временно недоступен'
  return fallback
}

export function reportError(err: unknown) {
  if (import.meta.env.DEV) console.error(err)
}

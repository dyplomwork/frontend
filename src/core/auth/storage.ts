const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

export const LS_TOKEN = 'casino_sim_token_v1'
export const LS_USER = 'casino_sim_user_v1'

export function getToken(): string {
  if (!isBrowser()) return ''
  return localStorage.getItem(LS_TOKEN) ?? ''
}

export function setToken(token: string): void {
  if (!isBrowser()) return
  localStorage.setItem(LS_TOKEN, token)
}

export function clearToken(): void {
  if (!isBrowser()) return
  localStorage.removeItem(LS_TOKEN)
}

export function getCachedUser<T>(): T | null {
  if (!isBrowser()) return null
  const raw = localStorage.getItem(LS_USER)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setCachedUser<T>(user: T | null): void {
  if (!isBrowser()) return
  if (!user) {
    localStorage.removeItem(LS_USER)
    return
  }
  localStorage.setItem(LS_USER, JSON.stringify(user))
}

export function clearCachedUser(): void {
  if (!isBrowser()) return
  localStorage.removeItem(LS_USER)
}

export function canUseStorage(): boolean {
  return isBrowser()
}

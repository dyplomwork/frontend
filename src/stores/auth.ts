import { defineStore } from 'pinia'
import { api } from '../utils/api'
import {
  canUseStorage,
  clearCachedUser,
  clearToken,
  getCachedUser,
  getToken,
  setCachedUser,
  setToken,
} from '../core/auth/storage'
import { reportError } from '../utils/errors'

export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  role: Role
  balance: number
  avatar_url?: string | null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: false,
    _balanceFetchAt: 0,
    _balanceFetchPromise: null as Promise<any> | null,
  }),
  getters: {
    role(state): Role {
      return state.user?.role || 'guest'
    },
    isAuthed(state): boolean {
      return !!state.user
    },
    isAdmin(): boolean {
      return this.role === 'admin'
    },
  },
  actions: {
    async init() {
      if (!canUseStorage()) {
        this.user = null
        return
      }
      const token = getToken()
      const cached = getCachedUser<User>()
      if (cached) this.user = cached
      if (this.user) return
      if (!token) {
        this.user = this.user
        return
      }
      try {
        this.loading = true
        const res = await api<{ ok: boolean; balance: number }>('/api/v1/accounts/users/me/balance', {
          method: 'GET',
        })

        this.user = {
          ...(this.user ?? { id: '', nickname: '', role: 'user' as Role }),
          balance: Number(res.balance),
        }
        setCachedUser(this.user)
      } catch (err: any) {
        if (err?.status === 401) {
          clearToken()
          clearCachedUser()
          this.user = null
        } else {
          reportError(err)
        }
      } finally {
        this.loading = false
      }
    },

    async register(payload: { nickname: string; password: string }) {
      if (!canUseStorage()) return { ok: false as const }
      const res = await api<{ ok: boolean; token: string; user: User }>('/api/v1/accounts/auth/register', {
        method: 'POST',
        json: true,
        body: payload,
      })
      setToken(res.token)
      this.user = res.user
      setCachedUser(res.user)
      await this.fetchBalance().catch(reportError)
      return { ok: true as const }
    },

    async login(login: string, password: string) {
      if (!canUseStorage()) return { ok: false as const }
      const res = await api<{ ok: boolean; token: string; user: User }>('/api/v1/accounts/auth/login', {
        method: 'POST',
        json: true,
        body: { login, password },
      })
      setToken(res.token)
      this.user = res.user
      setCachedUser(res.user)
      await this.fetchBalance().catch(reportError)
      return { ok: true as const }
    },

    async loginWithGoogle(idToken: string) {
      if (!canUseStorage()) return { ok: false as const }
      const res = await api<{ ok: boolean; token: string; user: User }>('/api/v1/accounts/auth/google', {
        method: 'POST',
        json: true,
        body: { idToken },
      })
      setToken(res.token)
      this.user = res.user
      setCachedUser(res.user)
      await this.fetchBalance().catch(reportError)
      return { ok: true as const }
    },

    async logout() {
      if (!canUseStorage()) {
        this.user = null
        return
      }
      try {
        await api('/api/v1/accounts/logout', { method: 'POST' })
      } catch (e) {
        reportError(e)
      }
      clearToken()
      clearCachedUser()
      this.user = null
    },

    async refreshMe() {
      if (!canUseStorage()) return
      try {
        let res: any
        try {
          res = await api<{ ok: boolean; user: User }>('/api/v1/accounts/users/me', { method: 'GET' })
        } catch {
          res = await api<{ ok: boolean; user: User }>('/api/me')
        }
        this.user = res.user
        setCachedUser(res.user)
      } catch (e) {
        reportError(e)
      }
    },

    async fetchMe() {
      return this.fetchBalance()
    },

    async fetchBalance(opts?: { force?: boolean; ttlMs?: number }) {
      if (!canUseStorage()) return { ok: false as const }
      if (!this.user) return { ok: false as const, message: 'Not logged in' }

      const u = this.user

      const ttlMs = opts?.ttlMs ?? 10_000
      const now = Date.now()
      if (!opts?.force && this._balanceFetchAt && now - this._balanceFetchAt < ttlMs) {
        return { ok: true as const, balance: this.user.balance }
      }

      if (this._balanceFetchPromise) return this._balanceFetchPromise

      this._balanceFetchPromise = (async () => {
        const res = await api<{ ok: boolean; balance: number; role?: string; nickname?: string }>('/api/v1/accounts/users/me/balance', {
          method: 'GET',
        })
        // Sync role and nickname from DB in case admin changed them
        this.user = {
          ...u,
          balance: Number(res.balance),
          ...(res.role ? { role: res.role as any } : {}),
          ...(res.nickname ? { nickname: res.nickname } : {}),
        }
        setCachedUser(this.user)
        this._balanceFetchAt = Date.now()
        return { ok: true as const, balance: res.balance }
      })()

      try {
        return await this._balanceFetchPromise
      } finally {
        this._balanceFetchPromise = null
      }
    },

    async applyBalance(delta: number) {
      if (!canUseStorage()) return { ok: false as const }
      if (!this.user) return { ok: false as const, message: 'Not logged in' }
      const res = await api<{ ok: boolean; balance: number }>('/api/balance/apply', {
        method: 'POST',
        json: true,
        body: { delta },
      })
      this.user = { ...this.user, balance: res.balance }
      setCachedUser(this.user)
      return { ok: true as const }
    },
  },
})

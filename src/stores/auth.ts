// src/stores/auth.ts
import { defineStore } from 'pinia'
import { api, ApiError } from '../utils/api'

export type User = {
  id: number
  email?: string
  username?: string
  balance: number
}

type AuthState = {
  user: User | null
  token: string
  loading: boolean
  message: string
}

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'


const LS_TOKEN = 'casino_sim_token_v1'
const LS_USER = 'casino_sim_user_v1'

/**
 * Microservices paths
 */
const PATHS = {
  register: '/api/v1/accounts/auth/register',
  login: '/api/v1/accounts/auth/login',
  meBalance: '/api/v1/accounts/users/me/balance',
  applyBalance: '/api/v1/accounts/users/me/balance/apply',
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: '',
    loading: false,
    message: '',
  }),

  getters: {
    isAuthed: (s) => !!s.token && !!s.user,
  },

  actions: {
    setMessage(msg: string) {
      this.message = msg
    },

    loadFromStorage() {
      if (!isBrowser()) return
      const t = localStorage.getItem(LS_TOKEN) || ''
      const u = localStorage.getItem(LS_USER) || ''
      this.token = t
      if (u) {
        try {
          this.user = JSON.parse(u)
        } catch {
          this.user = null
        }
      }
    },

    saveToStorage() {
      if (!isBrowser()) return
      if (this.token) localStorage.setItem(LS_TOKEN, this.token)
      else localStorage.removeItem(LS_TOKEN)

      if (this.user) localStorage.setItem(LS_USER, JSON.stringify(this.user))
      else localStorage.removeItem(LS_USER)
    },


    async init() {
      this.message = ''
      this.loadFromStorage()

      if (!this.token) return


      if (this.user) {
        try {
          await this.fetchBalance()
        } catch {

        }
        return
      }

      // Если user в кеше нет, всё равно можно попробовать подтянуть баланс (как минимум создадим user-объект)
      try {
        const res = await api<{ ok: boolean; balance: number }>(PATHS.meBalance, { method: 'GET' })
        this.user = { id: 0, balance: Number(res.balance) } // id неизвестен — если нужен, добавь отдельный /me endpoint
        this.saveToStorage()
      } catch {
        // молча
      }
    },

    /**
     * Регистрация
     * Ожидаем от backend что-то типа:
     * { ok:true, token:"...", user:{...} } или { token:"..." }
     * Подстроено максимально гибко.
     */
    async register(payload: { email?: string; username?: string; password: string }) {
      this.loading = true
      this.message = ''
      try {
        const res = await api<any>(PATHS.register, {
          method: 'POST',
          body: payload,
        })

        const token = res?.token || res?.accessToken || res?.data?.token || ''
        if (token) this.token = token

        const user = res?.user || res?.data?.user || null
        if (user) {
          this.user = {
            id: Number(user.id ?? 0),
            email: user.email,
            username: user.username,
            balance: Number(user.balance ?? 0),
          }
        } else if (!this.user) {

          this.user = { id: 0, balance: 0 }
        }

        this.saveToStorage()


        await this.fetchBalance().catch(() => {})

        return { ok: true as const }
      } catch (e: any) {
        this.message = e instanceof ApiError ? e.message : 'Register failed'
        return { ok: false as const, error: this.message }
      } finally {
        this.loading = false
      }
    },


    async login(payload: { email?: string; username?: string; password: string }) {
      this.loading = true
      this.message = ''
      try {
        const res = await api<any>(PATHS.login, {
          method: 'POST',
          body: payload,
        })

        const token = res?.token || res?.accessToken || res?.data?.token || ''
        if (token) this.token = token

        const user = res?.user || res?.data?.user || null
        if (user) {
          this.user = {
            id: Number(user.id ?? 0),
            email: user.email,
            username: user.username,
            balance: Number(user.balance ?? 0),
          }
        } else if (!this.user) {
          this.user = { id: 0, balance: 0 }
        }

        this.saveToStorage()

        await this.fetchBalance().catch(() => {})

        return { ok: true as const }
      } catch (e: any) {
        this.message = e instanceof ApiError ? e.message : 'Login failed'
        return { ok: false as const, error: this.message }
      } finally {
        this.loading = false
      }
    },

    logout() {
      this.user = null
      this.token = ''
      this.message = ''
      this.saveToStorage()
    },


    async fetchBalance() {
      if (!this.token) return { ok: false as const, error: 'No token' }

      const res = await api<{ ok: boolean; balance: number }>(PATHS.meBalance, { method: 'GET' })

      const balance = Number(res.balance ?? 0)
      if (this.user) {
        this.user = { ...this.user, balance }
      } else {
        this.user = { id: 0, balance }
      }

      this.saveToStorage()
      return { ok: true as const, balance }
    },


    async applyBalance(delta: number) {
      if (!this.token) throw new ApiError(401, 'No token')
      const res = await api<any>(PATHS.applyBalance, {
        method: 'POST',
        body: { delta },
      })

      // Попробуем вытащить баланс из ответа, иначе просто синкнем GET'ом
      const maybeBalance =
        Number(res?.balance ?? res?.data?.balance ?? res?.user?.balance ?? res?.data?.user?.balance)

      if (Number.isFinite(maybeBalance)) {
        if (this.user) this.user = { ...this.user, balance: maybeBalance }
        else this.user = { id: 0, balance: maybeBalance }
        this.saveToStorage()
        return { ok: true as const, balance: maybeBalance }
      }

      // fallback
      return this.fetchBalance()
    },
  },
})

import { defineStore } from 'pinia'
import { api } from '../utils/api'
import { canUseStorage, clearCachedUser, clearToken, getCachedUser, getToken, setCachedUser, setToken } from '../core/auth/storage'
export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  discord: string
  role: Role
  balance: number
}


export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: false
  }),
  getters: {
    role(state): Role { return state.user?.role || 'guest' },
    isAuthed(state): boolean { return !!state.user },
    isAdmin(): boolean { return this.role === 'admin' }
  },
  actions: {

    async init(){
      if(!canUseStorage()){
        this.user = null
        return
      }
      const token = getToken()
      const cached = getCachedUser<User>()
      if(cached) this.user = cached
      if(this.user){ return }
      if(!token){
        this.user = this.user // keep cached if any (offline dev)
        return
      }
      try{
        this.loading = true
        const res = await api<{ ok:boolean; balance: number }>(
          '/api/v1/accounts/users/me/balance',
          { method: 'GET' }
        )

        this.user = {
          ...(this.user ?? { id: '', nickname: '', discord: '', role: 'user' }),
          balance: Number(res.balance)
        }
        setCachedUser(this.user)
      }catch(err: any){
        if(err?.status === 401){
          clearToken()
          clearCachedUser()
          this.user = null
        }
      }finally{
        this.loading = false
      }

    },


    async register(payload: { nickname: string; discord: string; password: string }){
      if(!canUseStorage()) return { ok: false as const }
      const res = await api<{ ok:boolean; token: string; user: User }>('/api/v1/accounts/auth/register', {
        method: 'POST',
        json: true,
        body: payload
      })
      setToken(res.token)
      this.user = res.user
      setCachedUser(res.user)
      await this.fetchBalance().catch(() => {})
      return { ok: true as const }
    },

    async login(login: string, password: string){
      if(!canUseStorage()) return { ok: false as const }
      const res = await api<{ ok:boolean; token: string; user: User }>('/api/v1/accounts/auth/login', {
        method: 'POST',
        json: true,
        body: { login, password }
      })
      setToken(res.token)
      this.user = res.user
      setCachedUser(res.user)
      await this.fetchBalance().catch(() => {})
      return { ok: true as const }
    },

    async logout(){
      if(!canUseStorage()){
        this.user = null
        return
      }
      try{
        await api('/api/v1/accounts/logout', { method: 'POST' })
      }catch{
        // ignore
      }
      clearToken()
      clearCachedUser()
      this.user = null
    },

    async refreshMe(){
      if(!canUseStorage()) return
      try{
        let res: any
        try{
          res = await api<{ ok:boolean; user: User }>('/api/v1/accounts/users/me', { method: 'GET' })
        }catch{
          res = await api<{ ok:boolean; user: User }>('/api/me')
        }
        this.user = res.user
        setCachedUser(res.user)
      }catch{
        // ignore in offline dev
      }
    },

    async fetchMe(){
      return this.fetchBalance()
    },
    async fetchBalance(){
      if(!canUseStorage()) return { ok: false as const }
      if(!this.user) return { ok: false as const, message: 'Not logged in' }

      const res = await api<{ ok: boolean; balance: number }>(
        '/api/v1/accounts/users/me/balance',
        { method: 'GET' }
      )

      this.user = { ...this.user, balance: Number(res.balance) }
      setCachedUser(this.user)

      return { ok: true as const, balance: res.balance }
    },

    async applyBalance(delta: number){
      if(!canUseStorage()) return { ok: false as const }
      if(!this.user) return { ok: false as const, message: 'Not logged in' }
      const res = await api<{ ok: boolean; balance: number }>('/api/balance/apply', {
        method: 'POST',
        json: true,
        body: { delta }
      })
      this.user = { ...this.user, balance: res.balance }
      setCachedUser(this.user)
      return { ok: true as const }
    }
  }
})

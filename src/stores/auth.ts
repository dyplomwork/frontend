import { defineStore } from 'pinia'
import { api } from '../utils/api'

export type Role = 'guest' | 'user' | 'admin'

export type User = {
  id: string
  nickname: string
  discord: string
  role: Role
  balance: number
}

const LS_TOKEN = 'casino_sim_token_v1'
const LS_USER = 'casino_sim_user_v1'

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

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
      if(!isBrowser()){
        this.user = null
        return
      }
      const token = localStorage.getItem(LS_TOKEN)
      const cached = localStorage.getItem(LS_USER)
      if(cached){
        try{ this.user = JSON.parse(cached) as User }catch{ /* ignore */ }
      }
      // If we have a cached user, skip network validation in dev to avoid 401 spam.
      if(this.user){ return }
      if(!token){
        this.user = this.user // keep cached if any (offline dev)
        return
      }
      try{
        this.loading = true
        const res = await api<{ ok:boolean; user: User }>('/api/me')
        this.user = res.user
        localStorage.setItem(LS_USER, JSON.stringify(res.user))
      }catch(err: any){
        // If token is truly invalid, clear it. Otherwise keep cached user for offline dev.
        if(err?.status === 401){
          localStorage.removeItem(LS_TOKEN)
          localStorage.removeItem(LS_USER)
          this.user = null
        }
      }finally{
        this.loading = false
      }
    },

    async register(payload: { nickname: string; discord: string; password: string }){
      if(!isBrowser()) return { ok: false as const }
      const res = await api<{ ok:boolean; token: string; user: User }>('/api/v1/accaunts/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      localStorage.setItem(LS_TOKEN, res.token)
      this.user = res.user
      localStorage.setItem(LS_USER, JSON.stringify(res.user))
      return { ok: true as const }
    },

    async login(login: string, password: string){
      if(!isBrowser()) return { ok: false as const }
      const res = await api<{ ok:boolean; token: string; user: User }>('/api/v1/accaunts/login', {
        method: 'POST',
        body: JSON.stringify({ login, password })
      })
      localStorage.setItem(LS_TOKEN, res.token)
      this.user = res.user
      localStorage.setItem(LS_USER, JSON.stringify(res.user))
      return { ok: true as const }
    },

    async logout(){
      if(!isBrowser()){
        this.user = null
        return
      }
      try{
        await api('/api/v1/accaunts/logout', { method: 'POST' })
      }catch{
        // ignore
      }
      localStorage.removeItem(LS_TOKEN)
      localStorage.removeItem(LS_USER)
      this.user = null
    },

    async refreshMe(){
      if(!isBrowser()) return
      try{
        const res = await api<{ ok:boolean; user: User }>('/api/me')
        this.user = res.user
        localStorage.setItem(LS_USER, JSON.stringify(res.user))
      }catch{
        // ignore in offline dev
      }
    },

    async applyBalance(delta: number){
      if(!isBrowser()) return { ok: false as const }
      if(!this.user) return { ok: false as const, message: 'Not logged in' }
      const res = await api<{ ok: boolean; balance: number }>('/api/balance/apply', {
        method: 'POST',
        body: JSON.stringify({ delta })
      })
      this.user = { ...this.user, balance: res.balance }
      localStorage.setItem(LS_USER, JSON.stringify(this.user))
      return { ok: true as const }
    }
  }
})

import { defineStore } from 'pinia'

export type TicketType = 'deposit' | 'withdraw'
export type TicketStatus = 'pending' | 'approved' | 'rejected'

export type Ticket = {
  id: string
  userId: string
  nickname: string
  type: TicketType
  amount: number
  status: TicketStatus
  createdAt: string
  resolvedAt: string | null
  note?: string | null
}

const LS_TOKEN = 'casino_sim_token_v1'

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if(!isBrowser()) throw new Error('API is not available during SSR/prerender')
  const token = localStorage.getItem(LS_TOKEN)
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(opts.headers as any || {}) }
  if(token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...opts, headers })
  const data = await res.json().catch(()=> ({}))
  if(!res.ok) throw new Error(data?.message || `HTTP ${res.status}`)
  return data as T
}

export const useTicketsStore = defineStore('tickets', {
  state: () => ({
    mine: [] as Ticket[],
    admin: [] as Ticket[],
    loading: false
  }),
  actions: {
    async create(type: TicketType, amount: number){
      if(!isBrowser()) return
      await api('/api/tickets', { method:'POST', body: JSON.stringify({ type, amount }) })
      await this.fetchMine()
    },
    async fetchMine(){
      if(!isBrowser()) return
      this.loading = true
      try{
        const res = await api<{ ok:boolean; tickets: Ticket[] }>('/api/tickets/me')
        this.mine = res.tickets
      } finally {
        this.loading = false
      }
    },
    async fetchAdmin(){
      if(!isBrowser()) return
      this.loading = true
      try{
        const res = await api<{ ok:boolean; tickets: Ticket[] }>('/api/admin/tickets')
        this.admin = res.tickets
      } finally {
        this.loading = false
      }
    },
    async approve(id: string){
      if(!isBrowser()) return
      await api(`/api/admin/tickets/${id}/approve`, { method:'POST' })
      await this.fetchAdmin()
    },
    async reject(id: string, note?: string){
      if(!isBrowser()) return
      await api(`/api/admin/tickets/${id}/reject`, { method:'POST', body: JSON.stringify({ note }) })
      await this.fetchAdmin()
    }
  }
})

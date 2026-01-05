import { defineStore } from 'pinia'
import { api } from '../utils/api'
export type TicketType = 'DEPOSIT' | 'WITHDRAW'
export type TicketStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

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

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'


export const useTicketsStore = defineStore('tickets', {
  state: () => ({
    mine: [] as Ticket[],
    admin: [] as Ticket[],
    loading: false
  }),
  actions: {
    async create(type: TicketType, amount: number){
      if(!isBrowser()) return
      await api('/api/v1/tickets/me', { method:'POST', body: JSON.stringify({ type, amount }) })
      await this.fetchMine()
    },
    async fetchMine(){
      if(!isBrowser()) return
      this.loading = true
      try{
        const res = await api<{ ok:boolean; tickets: Ticket[] }>('/api/v1/tickets/me')
        this.mine = res.tickets
      } finally {
        this.loading = false
      }
    },
    async fetchAdmin(){
      if(!isBrowser()) return
      this.loading = true
      try{
        const res = await api<{ ok:boolean; tickets: Ticket[] }>('/api/v1/admin/tickets')
        this.admin = res.tickets
      } finally {
        this.loading = false
      }
    },
    async approve(id: string){
      if(!isBrowser()) return
      // Backend expects an explicit status transition.
      await api(`/api/v1/admin/tickets/${id}`, {
        method:'PATCH',
        body: { status: 'APPROVED' },
        json: true
      })
      await this.fetchAdmin()
    },
    async reject(id: string, note?: string){
      if(!isBrowser()) return
      // Reject must also explicitly set status; note is optional.
      await api(`/api/v1/admin/tickets/${id}`, {
        method:'PATCH',
        body: { status: 'REJECTED', note },
        json: true
      })
      await this.fetchAdmin()
    }
  }
})

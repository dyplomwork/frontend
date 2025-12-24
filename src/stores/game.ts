import { defineStore } from 'pinia'
import { CASES } from '../data/cases'
import type { CaseDef, LootItem } from '../types'
import { api } from '../utils/api'
import { useAuthStore } from './auth'

export const useGameStore = defineStore('game', {
  state: () => ({
    cases: CASES as CaseDef[],
  }),
  actions: {
    async openCase(caseId: string): Promise<{ ok: boolean; message?: string; loot?: LootItem }> {
      const auth = useAuthStore()
      if (!auth.user) return { ok: false, message: 'Нужен вход' }

      try {
        const res = await api<{ ok: boolean; loot: LootItem; balance: number }>('/api/cases/open', {
          method: 'POST',
          body: JSON.stringify({ caseId }),
        })

        // обновим баланс в auth-store
        auth.user = { ...auth.user, balance: res.balance }
        if (typeof window !== 'undefined') {
          localStorage.setItem('casino_sim_user_v1', JSON.stringify(auth.user))
        }

        return { ok: true, loot: res.loot }
      } catch (e: any) {
        return { ok: false, message: e?.message ? String(e.message) : 'Ошибка' }
      }
    },
  },
})

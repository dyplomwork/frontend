import { defineStore } from 'pinia'
import { CASES } from '../data/cases'
import type { CaseDef, LootItem } from '../types'
import { useAuthStore } from './auth'
import { casesPlay } from '../api/games'

export const useGameStore = defineStore('game', {
  state: () => ({
    cases: CASES as CaseDef[],
  }),
  actions: {
    async openCase(caseId: string): Promise<{ ok: boolean; message?: string; loot?: LootItem }> {
      const auth = useAuthStore()
      if (!auth.user) return { ok: false, message: 'Нужен вход' }

      try {
        const res = await casesPlay(caseId)

        // refresh balance from auth service
        await auth.fetchMe()

        return {
          ok: true,
          loot: {
            id: 'srv',
            label: String(res.item),
            amount: Number(res.payout),
            chance: 0,
          },
        }
      } catch (e: any) {
        return { ok: false, message: e?.message ? String(e.message) : 'Ошибка' }
      }
    },
  },
})

import { defineStore } from 'pinia'
import { CASES } from '../data/cases'
import type { CaseDef, LootItem } from '../types'
import { useAuthStore } from './auth'
import { casesGet, casesPlay, type CaseDTO } from '../api/games'

function dtoToCaseDef(id: string, dto: CaseDTO, fallbackEmoji: string): CaseDef {
  return {
    id,
    name: String(dto.name ?? id),
    price: Number(dto.price ?? 0),
    modelEmoji: fallbackEmoji,
    loot: (dto.items ?? []).map((it, idx) => ({
      id: `${id}:${idx}`,
      label: String(it.name ?? 'Item'),
      amount: Number(it.prize ?? 0),
      // backend gives chance in percent (0..100)
      chance: Math.max(0, Number(it.chance ?? 0)) / 100,
    })),
  }
}

export const useGameStore = defineStore('game', {
  state: () => ({
    cases: CASES as CaseDef[],
    casesLoaded: false,
    casesLoading: false,
  }),
  actions: {
    /**
     * Loads cases meta from cases microservice and merges it with local UI-only fields (emoji, ids).
     * If the service is unavailable, keeps the local fallback list.
     */
    async loadCases(force = false) {
      if (this.casesLoading) return
      if (this.casesLoaded && !force) return

      this.casesLoading = true
      try {
        const base = [...this.cases]

        // Our backend list endpoint does not include ids, so we hydrate by known registry keys.
        const hydrated = await Promise.all(
          base.map(async (c) => {
            try {
              const dto = await casesGet(c.id)
              return dtoToCaseDef(c.id, dto, c.modelEmoji)
            } catch {
              return c
            }
          }),
        )

        this.cases = hydrated
        this.casesLoaded = true
      } finally {
        this.casesLoading = false
      }
    },

    async openCase(caseId: string): Promise<{ ok: boolean; message?: string; loot?: LootItem }> {
      const auth = useAuthStore()
      if (!auth.user) return { ok: false, message: 'Нужен вход' }

      try {
        const res = await casesPlay(caseId)

        // ✅ Correct balance refresh: the balance is owned by accounts service
        // and is exposed via /api/v1/accounts/users/me/balance
        await auth.fetchBalance().catch(() => {})

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

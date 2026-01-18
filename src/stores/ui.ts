import { defineStore } from 'pinia'

export type ToastType = 'info' | 'success' | 'error'
export type Toast = {
  id: string
  type: ToastType
  title?: string
  text: string
  ttlMs: number
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as Toast[],
    balanceOverride: null as number | null,
  }),
  actions: {
    toast(text: string, type: ToastType = 'info', ttlMs = 3500, title?: string) {
      const t: Toast = { id: uid(), type, title, text, ttlMs }
      this.toasts.push(t)
      window.setTimeout(() => this.dismiss(t.id), ttlMs)
    },
    dismiss(id: string) {
      const idx = this.toasts.findIndex((t) => t.id === id)
      if (idx >= 0) this.toasts.splice(idx, 1)
    },
    clear() {
      this.toasts = []
    },

    setBalanceOverride(v: number | null) {
      this.balanceOverride = typeof v === 'number' && Number.isFinite(v) ? v : null
    },
  },
})

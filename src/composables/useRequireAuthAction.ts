import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

export function useRequireAuthAction() {
  const auth = useAuthStore()
  const ui = useUiStore()
  const router = useRouter()
  const route = useRoute()

  function requireAuth<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
    if (!auth.user) {
      ui.toast('Нужен вход, чтобы выполнить действие', 'info')
      router.push({ name: 'login', query: { next: route.fullPath } })
      return Promise.resolve(undefined)
    }
    try {
      return Promise.resolve(fn())
    } catch (e) {
      return Promise.reject(e)
    }
  }

  return { requireAuth }
}

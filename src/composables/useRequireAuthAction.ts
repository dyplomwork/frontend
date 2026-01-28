import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

export function useRequireAuthAction() {
  const auth = useAuthStore()
  const ui = useUiStore()
  const router = useRouter()
  const route = useRoute()
  const { t } = useI18n()

  function requireAuth<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
    if (!auth.user) {
      ui.toast(t('ui.s_need_login_action'), 'info')
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

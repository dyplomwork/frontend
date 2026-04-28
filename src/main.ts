import { createPinia } from 'pinia'
import { ViteSSG } from 'vite-ssg'

import App from './App.vue'
import { createI18n } from 'vue-i18n'
import ru from './locales/ua'
import en from './locales/en'
import { routes, addAuthGuards } from './router'
import { useAuthStore } from './stores/auth'

import './styles/index.css'

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru, en },
})

export const createApp = ViteSSG(
  App,
  { routes, base: import.meta.env.BASE_URL },
  async ({ app, router, isClient }) => {
    if (isClient) {
      const v = String((import.meta as any).env?.VITE_MOCK_API ?? '').toLowerCase()
      const mock = v === '1' || v === 'true' || v === 'yes' || v === 'on'
      if (mock) {
      try {
        const { worker } = await import('./mocks/browser')
        const swUrl = `${import.meta.env.BASE_URL}mockServiceWorker.js`
        await worker.start({
          onUnhandledRequest: 'bypass',
          serviceWorker: { url: swUrl },
        })
      } catch (e) {
        console.warn('MSW start failed', e)
      }
      }
    }

    const pinia = createPinia()
    app.use(pinia)

    app.use(i18n)
    if (isClient) {
      const savedLocale = localStorage.getItem('app_locale_v1')
      if (savedLocale === 'en' || savedLocale === 'ru') {
        i18n.global.locale.value = savedLocale
      }
    }

    if (isClient) {
      const auth = useAuthStore(pinia)
      await auth.init()
    }

    addAuthGuards(router)
  },
  { useHead: true }
)

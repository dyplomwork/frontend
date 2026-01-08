import { createPinia } from 'pinia'
import { ViteSSG } from 'vite-ssg'

import App from './App.vue'
import { createI18n } from 'vue-i18n'
import ru from './locales/ru'
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

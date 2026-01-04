import { createPinia } from 'pinia'
import { ViteSSG } from 'vite-ssg'
import { createHead } from '@unhead/vue'

import App from './App.vue'
import { routes, addAuthGuards } from './router'
import { CASES } from './data/cases'

import './style.css'
import './styles/theme.css'

/**
 * ViteSSG gives us prerendering (static HTML per route) which helps Google index a SPA.
 * Vercel can deploy it as a static site from /dist.
 */
export const createApp = ViteSSG(
  App,
  { routes, base: import.meta.env.BASE_URL },
  async ({ app, router, isClient }) => {
    const pinia = createPinia()
    app.use(pinia)

    // Head manager (SSR + client) - avoid double install warning in dev/HMR
    const provides = (app as any)?._context?.provides || {}
    const hasUsehead =
      Object.prototype.hasOwnProperty.call(provides, 'usehead') ||
      Object.prototype.hasOwnProperty.call(provides, 'useHead')
    if (!hasUsehead) {
      const head = createHead()
      app.use(head)
    }

    // In client only, init auth (uses localStorage).
    if (isClient) {
      const { useAuthStore } = await import('./stores/auth')
      const auth = useAuthStore(pinia)
      await auth.init()
    }

    // Install auth guards on the router created by ViteSSG.
    addAuthGuards(router)
  },
  {
    // Include dynamic case pages in prerender output.
    includedRoutes: (paths) => {
      const casePaths = (CASES || []).map((c) => `/cases/${c.id}`)
      return Array.from(new Set([...paths, ...casePaths]))
    }
  }
)

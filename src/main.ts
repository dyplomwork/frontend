import { createPinia } from 'pinia'
import { ViteSSG } from 'vite-ssg'

import App from './App.vue'
import { routes, addAuthGuards } from './router'

import './styles/index.css'
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

    // Head manager is installed by vite-ssg via clientOptions { useHead: true }

    // In client only, init auth (uses localStorage).
    if (isClient) {
      const { useAuthStore } = await import('./stores/auth')
      const auth = useAuthStore(pinia)
      await auth.init()
    }

    // Install auth guards on the router created by ViteSSG.
    addAuthGuards(router)
  },
  { useHead: true }
)

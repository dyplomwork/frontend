import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { CASES } from './src/data/cases'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  ssgOptions: {
    // Prerender only static routes plus concrete case pages. Routes with a
    // dynamic segment (":id", e.g. /coinflip/:id) cannot be prerendered with a
    // literal param — they produce a ":id.html" filename that is invalid on
    // Windows and useless on Linux. The SPA handles them client-side.
    includedRoutes: (paths) => {
      const staticPaths = paths.filter((p) => !p.includes(':'))
      const casePaths = (CASES || []).map((c) => `/cases/${c.id}`)
      return Array.from(new Set([...staticPaths, ...casePaths]))
    },
  },
  // If you have a local backend, you can enable proxying here:
  // server: {
  //   proxy: {
  //     '/api': { target: 'http://localhost:3001', changeOrigin: true }
  //   }
  // }
})

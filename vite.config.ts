import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // If you have a local backend, you can enable proxying here:
  // server: {
  //   proxy: {
  //     '/api': { target: 'http://localhost:3001', changeOrigin: true }
  //   }
  // }
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // "/" locally; "/<repo>/" when built for GitHub Pages (set by the Pages workflow)
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  worker: { format: 'es' },
})

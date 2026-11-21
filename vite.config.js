import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_')
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: false,
        },
        '/collector/health': {
          target: env.VITE_COLLECTOR_PROXY_TARGET || 'http://127.0.0.1:8001',
          changeOrigin: false,
          rewrite: () => '/health',
        },
        '/collector': {
          target: env.VITE_COLLECTOR_PROXY_TARGET || 'http://127.0.0.1:8001',
          changeOrigin: false,
        },
      },
    },
  }
})

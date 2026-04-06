import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    https: false,
    host: 'localhost',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})

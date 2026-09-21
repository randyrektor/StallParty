import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { watchRoomPlugin } from './src/vite/watchRoomPlugin'

export default defineConfig({
  base: '/',
  plugins: [react(), watchRoomPlugin()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
})

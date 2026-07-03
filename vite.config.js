import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "ac427fadfe41.ngrok-free.app",
      "10a2-182-16-186-50.ngrok-free.app",
      "a6cc-2a09-bac5-55fd-1d05-00-2e4-20.ngrok-free.app",
      "2ef8-2a09-bac5-55fb-25c3-00-3c3-2f.ngrok-free.app",
    ],
  },
})

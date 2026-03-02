import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["ac427fadfe41.ngrok-free.app", "10a2-182-16-186-50.ngrok-free.app"],
  },
})


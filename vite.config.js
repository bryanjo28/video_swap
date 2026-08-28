import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "b665-2a09-bac1-34e0-18-00-277-12.ngrok-free.app"
    ],
  },
})

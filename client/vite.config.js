import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 3007,
    host: '0.0.0.0', // Permite conexiones desde cualquier IP
    allowedHosts: ['cisa.arrayanhn.com']
  },
  preview: {
    port: 3007,
    host: '0.0.0.0', // Permite conexiones desde cualquier IP
    allowedHosts: ['cisa.arrayanhn.com']
  },
})

import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Rutas relativas: la app funciona en cualquier subruta (GitHub Pages: /AutonomyConsulting/).
  // Las rutas internas usan HashRouter (#/admin), así que no hace falta reescritura en el servidor.
  base: './',
  plugins: [react(), tailwindcss()],
  // La librería de Excel pesa ~900 kB, pero solo se descarga cuando alguien usa la carga o descarga de Excel.
  build: { chunkSizeWarningLimit: 1000 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})

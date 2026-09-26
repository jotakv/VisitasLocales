import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({ envDir: '../..', plugins: [react(), VitePWA({ registerType: 'prompt', manifest: { name: 'LocalVivienda', short_name: 'LocalVivienda', lang: 'es', start_url: '/app', scope: '/', display: 'standalone', theme_color: '#173e35', background_color: '#f5f4ee', icons: [{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}] }, workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], cleanupOutdatedCaches: true } })] })

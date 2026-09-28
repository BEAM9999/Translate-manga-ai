import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'web',
  base: './',
  publicDir: '../public',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'C2 Sub Auto AI - Manga OCR & Translation Studio',
        short_name: 'C2 Sub Auto AI',
        description: 'แปลมังงะ จัดการ Playlist และบริบทของเรื่อง',
        theme_color: '#090c15',
        background_color: '#090c15',
        display: 'standalone',
        orientation: 'any',
        lang: 'th',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: false,
  },
  test: {
    root: '..',
  },
});

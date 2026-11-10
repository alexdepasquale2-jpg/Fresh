import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'icon.svg'],
      manifest: {
        name: 'SALLOW',
        short_name: 'SALLOW',
        description: 'A box of pocket universes. Change their sky.',
        orientation: 'portrait',
        display: 'standalone',
        theme_color: '#17140c',
        background_color: '#17140c',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,json}'], navigateFallback: 'index.html' },
    }),
  ],
});

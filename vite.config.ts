import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// ARTIFACT=1 builds the game for a claude.ai artifact: relative paths, fonts inlined,
// no service worker (the artifact frame does not run one).
const artifact = process.env.ARTIFACT === '1';

export default defineConfig({
  base: artifact ? './' : '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: artifact
    ? { target: 'es2022', sourcemap: false, outDir: 'dist-artifact', assetsInlineLimit: 300_000 }
    : { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  plugins: artifact ? [] : [
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

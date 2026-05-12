import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages base path (пустой для username.github.io, или '/reponame/' для обычного репозитория)
// В GitHub Actions это устанавливается через GITHUB_PAGES_BASE
const base = process.env.GITHUB_PAGES_BASE || '/';

export default defineConfig({
  base,
  // Иначе `npm run dev` слушает только localhost — iPhone по Wi‑Fi до сервера не достучится.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  plugins: [
    react(),
    VitePWA({
      base,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'LifeRoadmap',
        short_name: 'LifeRoadmap',
        description: 'PWA менеджер вложенных роадмапов',
        theme_color: '#2563eb',
        start_url: base,
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom'
  }
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages base path (пустой для username.github.io, или '/reponame/' для обычного репозитория)
// В GitHub Actions это устанавливается через GITHUB_PAGES_BASE
const base = process.env.GITHUB_PAGES_BASE || '/';

// Отладочный вывод для проверки base path при сборке
console.log('Vite config - GITHUB_PAGES_BASE:', process.env.GITHUB_PAGES_BASE);
console.log('Vite config - base:', base);

export default defineConfig({
  base,
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
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
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

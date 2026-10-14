import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' 로 두면 GitHub Pages 하위 경로, Vercel 루트 어디에 올려도 동작한다.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '꾸준이 — 세무사 1차 공부관리',
        short_name: '꾸준이',
        description: '과목별 공부시간 기록 · 진도 노트 · 오답노트 · 구글드라이브 동기화',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F7F7F5',
        theme_color: '#15171C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node'
  }
} as never);

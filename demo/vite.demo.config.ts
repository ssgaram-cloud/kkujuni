import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 미리보기용 단일 페이지 빌드 (PWA 없음). 실제 배포는 기본 vite.config.ts 사용
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./pwa-stub.ts', import.meta.url)) } },
  build: { outDir: 'dist-demo', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false, rollupOptions: { output: { inlineDynamicImports: true } } }
});

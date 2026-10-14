import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutoSync } from './lib/google/sync';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

void startAutoSync();

// 오프라인 실행 · 홈 화면 설치용 서비스 워커 (배포 빌드에서만)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => undefined);
}

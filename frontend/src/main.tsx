import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 새 서비스 워커 활성화 시 자동 새로고침
if ('serviceWorker' in navigator) {
  // 새 SW가 제어권을 가져가면 즉시 새로고침
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // 60초마다 새 버전 확인
  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => {
      registration.update();
    }, 60 * 1000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

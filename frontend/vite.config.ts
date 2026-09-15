import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// 빌드 시 index.html에 빌드 해시 주입 + version.json 생성
function buildHashPlugin(): Plugin {
  let buildHash = '';
  return {
    name: 'build-hash',
    buildStart() {
      buildHash = Date.now().toString(36);
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { 'data-build-hash': buildHash },
          children: `
(function(){
  var key='ddgolf_build', cur='${buildHash}', prev=localStorage.getItem(key);
  localStorage.setItem(key, cur);
  if(prev && prev!==cur){
    if('caches' in window) caches.keys().then(function(n){n.forEach(function(k){caches.delete(k)})});
    if(navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})});
    setTimeout(function(){location.reload()},100);
  }
})();`,
          injectTo: 'head-prepend',
        },
      ];
    },
    writeBundle(options) {
      const outDir = options.dir || resolve(__dirname, 'dist');
      writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ hash: buildHash }));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    buildHashPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // ⚠️ 유지관리비 화면·안내 스크립트는 **미리 저장하지 않는다** (2026-09-15).
        //    서비스워커가 이 둘을 품고 있으면, 서버에 새 파일을 올려도 앱 안에서는
        //    영영 옛것이 나온다. 실제로 그래서 화면이 비어 보였다.
        //    (이름이 고정된 파일이라 더 위험하다 — /assets/ 것들은 이름이 매번 바뀐다)
        globIgnores: ['**/server-billing.html', '**/server-billing-notice.js'],
        // ⚠️ `/server-billing.html` 은 **React 화면이 아니다.** 여기 안 적으면 서비스워커가
        //    이 주소마저 앱 화면(index.html)으로 돌려줘서, 탭 안에서 빈 화면이 된다
        //    (2026-09-15: React Router 가 «No routes matched» 경고를 내며 아무것도 안 그렸다).
        navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/ws/, /^\/server-billing/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: '대덕구골프협회',
        short_name: '대덕구골프',
        theme_color: '#15803d',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  envDir: '..',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

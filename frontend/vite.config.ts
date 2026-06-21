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
        navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/ws/],
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

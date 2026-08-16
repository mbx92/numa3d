export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  devServer: {
    host: '0.0.0.0',
    port: 3000
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || 'postgres://mbx@localhost:5432/numa3d',
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret-ganti-di-env',
    minio: {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      bucket: process.env.MINIO_BUCKET || 'numa3d-files'
    },
    tuya: {
      apiKey: process.env.TUYA_API_KEY || '',
      apiSecret: process.env.TUYA_API_SECRET || '',
      apiRegion: process.env.TUYA_API_REGION || 'in'
    }
  },
  app: {
    head: {
      title: 'Numa3D — Pencatatan Produksi',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#1f2429' },
        // Standalone tanpa chrome browser (Android + iOS modern)
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Numa3D' }
      ],
      link: [
        // Explicit: @vite-pwa/nuxt kadang gagal inject link manifest (unhead regression)
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    manifest: {
      name: 'Numa3D — Pencatatan Produksi',
      short_name: 'Numa3D',
      description: 'Pencatatan produksi, HPP, dan penjualan workshop 3D printing',
      theme_color: '#1f2429',
      background_color: '#15181c',
      display: 'standalone',
      display_override: ['standalone', 'browser'],
      orientation: 'any',
      start_url: '/',
      scope: '/',
      lang: 'id',
      id: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//]
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600
    },
    devOptions: {
      enabled: false
    }
  }
})

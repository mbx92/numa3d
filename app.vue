<script setup>
// Pastikan <link rel="manifest"> selalu ada di SSR HTML.
// Tanpa ini, install HP sering jadi shortcut browser (bukan standalone).
useHead({
  link: [{ rel: 'manifest', href: '/manifest.webmanifest' }]
})
</script>

<template>
  <NuxtPwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ConfirmDialog />
  <ToastContainer />
  <ClientOnly>
    <PwaPrompt />
  </ClientOnly>
</template>

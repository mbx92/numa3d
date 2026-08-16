<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ConfirmDialog />
  <ToastContainer />
  <ClientOnly>
    <PwaPrompt />
  </ClientOnly>
</template>

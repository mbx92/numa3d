<script setup>
defineProps({
  model: { type: String, required: true }
})
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="block"
  >
    <!-- Cradle: U-slot -->
    <template v-if="model === 'cradle'">
      <rect x="4" y="14" width="16" height="3" rx="0.8" />
      <path d="M6 14V9h3v5M15 14V9h3v5" />
      <rect x="8.5" y="5.5" width="7" height="5" rx="1" />
    </template>

    <!-- Wide: full-width cradle -->
    <template v-else-if="model === 'wide'">
      <rect x="3" y="14" width="18" height="3" rx="0.8" />
      <path d="M4 14V8.5h16V14" />
      <rect x="7" y="5" width="10" height="5.5" rx="1" />
    </template>

    <!-- Lean: kickstand -->
    <template v-else-if="model === 'lean'">
      <rect x="4" y="15" width="16" height="2.5" rx="0.6" />
      <path d="M5.5 15V10h2.5M16 15V10h2.5" />
      <path d="M16.5 10 18.5 15" />
      <rect x="8.5" y="6" width="7" height="5" rx="1" transform="rotate(-8 12 8.5)" />
    </template>

    <!-- Pedestal: column + base -->
    <template v-else-if="model === 'pedestal'">
      <rect x="3.5" y="15" width="17" height="3" rx="0.8" />
      <rect x="10" y="9" width="4" height="6" rx="0.8" />
      <path d="M8 9h8M8.5 9V7.5h7V9" />
      <rect x="8.5" y="4.5" width="7" height="4.5" rx="1" />
    </template>

    <!-- Clip: low profile -->
    <template v-else-if="model === 'clip'">
      <rect x="5" y="16" width="14" height="2" rx="0.5" />
      <path d="M6 16V13h2M16 16V13h2" />
      <rect x="8.5" y="7" width="7" height="5.5" rx="1" />
    </template>

    <!-- Wall: bracket -->
    <template v-else-if="model === 'wall'">
      <rect x="7" y="4" width="10" height="14" rx="1" />
      <path d="M7 8h10M7 14h10" />
      <circle cx="10" cy="18.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="18.5" r="0.8" fill="currentColor" stroke="none" />
    </template>

    <!-- None: lightbox only -->
    <template v-else-if="model === 'none'">
      <rect x="7" y="6" width="10" height="12" rx="1.2" />
      <path d="M9 9h6M9 12h6M9 15h4" opacity="0.5" />
    </template>
  </svg>
</template>

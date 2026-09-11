<script setup>
defineProps({
  shape: { type: String, required: true }
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
    <!-- Siluet mengikuti desain -->
    <path
      v-if="shape === 'outline'"
      d="M7.5 5.5c1.2-1.8 3.8-2.2 5.5-.8 1.4 1.1 3.4.9 4.5-.5 1.5-2 4.5-1.2 4.8 1.6.2 1.8 2.4 2.8 1.4 4.6-.8 1.4.2 3.4-1.4 4-2.2.8-4.8-.2-6.2-1.8-1.6-1.8-4.4-1.2-5.4.8-1.2 1.4-3.4 1-4.4-.6-1.4-2.2.4-5 3-5.3z"
    />

    <circle v-else-if="shape === 'circle'" cx="12" cy="12" r="7.25" />

    <rect v-else-if="shape === 'square'" x="5.5" y="5.5" width="13" height="13" rx="2.4" />

    <rect v-else-if="shape === 'rect'" x="4" y="7" width="16" height="10" rx="2.2" />

    <path
      v-else-if="shape === 'hexagon'"
      d="M12 4.5 17.2 7.5v6L12 16.5 6.8 13.5v-6L12 4.5z"
    />

    <path
      v-else-if="shape === 'egg'"
      d="M12 4.2c3.4 0 5.8 3.6 5.8 7.3 0 4.2-2.6 7.5-5.8 7.5S6.2 15.7 6.2 11.5C6.2 7.8 8.6 4.2 12 4.2z"
    />
  </svg>
</template>

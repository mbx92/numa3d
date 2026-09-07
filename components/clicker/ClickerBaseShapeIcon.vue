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
      v-else-if="shape === 'heart'"
      d="M12 19s-6.2-4.2-6.2-8.4C5.8 7.6 8.4 6 10.6 6c1.2 0 2.3.6 3 1.5.7-.9 1.8-1.5 3-1.5 2.2 0 4.8 1.6 4.8 4.6C21.2 14.8 12 19 12 19z"
    />

    <path
      v-else-if="shape === 'flower'"
      d="M12.0 7.8 L12.6 7.6 L13.4 6.7 L14.6 5.8 L15.6 5.8 L16.1 6.7 L15.9 8.1 L15.6 9.3 L15.6 9.9 L16.1 10.3 L17.3 10.6 L18.6 11.1 L19.2 12.0 L18.6 12.9 L17.3 13.4 L16.1 13.7 L15.6 14.1 L15.6 14.7 L15.9 15.9 L16.1 17.3 L15.6 18.2 L14.6 18.2 L13.4 17.3 L12.6 16.4 L12.0 16.2 L11.4 16.4 L10.6 17.3 L9.4 18.2 L8.4 18.2 L7.9 17.3 L8.1 15.9 L8.4 14.7 L8.4 14.1 L7.9 13.7 L6.7 13.4 L5.4 12.9 L4.8 12.0 L5.4 11.1 L6.7 10.6 L7.9 10.3 L8.4 9.9 L8.4 9.3 L8.1 8.1 L7.9 6.7 L8.4 5.8 L9.4 5.8 L10.6 6.7 L11.4 7.6 Z"
    />

    <path
      v-else-if="shape === 'star'"
      d="M12 4.8 13.8 9.2l4.7.4-3.6 3.1 1.1 4.6L12 15.2 8 17.3l1.1-4.6-3.6-3.1 4.7-.4L12 4.8z"
    />

    <path
      v-else-if="shape === 'egg'"
      d="M12 4.2c3.4 0 5.8 3.6 5.8 7.3 0 4.2-2.6 7.5-5.8 7.5S6.2 15.7 6.2 11.5C6.2 7.8 8.6 4.2 12 4.2z"
    />
  </svg>
</template>

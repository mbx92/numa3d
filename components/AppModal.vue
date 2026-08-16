<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' }, // md | lg
  nested: { type: Boolean, default: false }
})
defineEmits(['close'])

const widthClass = computed(() => (props.size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'))
const zClass = computed(() => (props.nested ? 'z-[110]' : 'z-[100]'))

// Kunci scroll halaman selama modal terbuka
onMounted(() => {
  if (!props.nested) document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  if (!props.nested) document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 flex items-end sm:items-center justify-center" :class="zClass">
      <div class="absolute inset-0 bg-ink-950/50" @click="$emit('close')"></div>
      <div
        class="relative panel w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-panel sm:m-4"
        :class="widthClass"
      >
        <div class="panel-header sticky top-0 bg-white z-10">
          <span class="panel-title">{{ title }}</span>
          <button class="text-ink-400 hover:text-ink-700 text-xl leading-none px-1" @click="$emit('close')">
            &times;
          </button>
        </div>
        <div class="p-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

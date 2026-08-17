<script setup>
const props = defineProps({
  modelValue: { type: [Number, String], default: 0 },
  required: Boolean,
  disabled: Boolean,
  min: { type: Number, default: 0 },
  inputClass: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const display = ref('')
const focused = ref(false)

function toInt(value) {
  const n = Math.round(Number(value) || 0)
  return Number.isFinite(n) ? n : 0
}

function formatId(value) {
  return toInt(value).toLocaleString('id-ID')
}

function parseId(str) {
  const digits = String(str ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

watch(
  () => props.modelValue,
  (value) => {
    if (focused.value) return
    display.value = formatId(value)
  },
  { immediate: true }
)

function onFocus() {
  focused.value = true
}

function onInput(e) {
  const el = e.target
  const caretFromEnd = el.value.length - (el.selectionStart ?? el.value.length)
  const parsed = parseId(el.value)
  if (parsed === null) {
    display.value = ''
    emit('update:modelValue', 0)
    return
  }
  emit('update:modelValue', parsed)
  display.value = formatId(parsed)
  nextTick(() => {
    const pos = Math.max(0, display.value.length - caretFromEnd)
    el.setSelectionRange(pos, pos)
  })
}

function onBlur() {
  focused.value = false
  let n = toInt(props.modelValue)
  if (n < props.min) n = props.min
  emit('update:modelValue', n)
  display.value = formatId(n)
}
</script>

<template>
  <div class="money-input">
    <span class="money-input__prefix">Rp</span>
    <input
      :value="display"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :required="required"
      :disabled="disabled"
      class="input-num"
      :class="inputClass"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    />
  </div>
</template>

// State singleton (module-level) sehingga <ConfirmDialog /> yang dipasang sekali
// di app.vue dan pemanggil useConfirm() di halaman manapun berbagi state yang sama.
const state = reactive({
  visible: false,
  title: '',
  message: '',
  confirmText: 'Hapus',
  cancelText: 'Batal',
  danger: true,
  resolve: null
})

export function useConfirm() {
  function confirm(message, opts = {}) {
    state.title = opts.title || 'Konfirmasi'
    state.message = message
    state.confirmText = opts.confirmText || 'Hapus'
    state.cancelText = opts.cancelText || 'Batal'
    state.danger = opts.danger ?? true
    state.visible = true
    return new Promise((resolve) => {
      state.resolve = resolve
    })
  }

  function respond(value) {
    state.visible = false
    state.resolve?.(value)
    state.resolve = null
  }

  return { state, confirm, respond }
}

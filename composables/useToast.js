// State singleton (module-level) sehingga <ToastContainer /> yang dipasang sekali
// di app.vue dan pemanggil useToast() di halaman manapun berbagi antrean yang sama.
const toasts = reactive([])
let nextId = 1

export function useToast() {
  function push(message, opts = {}) {
    const id = nextId++
    const duration = opts.duration ?? 4000
    const toast = {
      id,
      message,
      title: opts.title || '',
      type: opts.type || 'info',
      remaining: duration,
      timer: null
    }
    toasts.push(toast)
    if (duration > 0) resume(toast)
    return id
  }

  function resume(toast) {
    if (toast.timer != null || toast.remaining <= 0) return
    toast.startedAt = Date.now()
    toast.timer = setTimeout(() => dismiss(toast.id), toast.remaining)
  }

  function dismiss(id) {
    const idx = toasts.findIndex((t) => t.id === id)
    if (idx === -1) return
    clearTimeout(toasts[idx].timer)
    toasts.splice(idx, 1)
  }

  // Auto-dismiss dijeda sementara kursor berada di atas tumpukan toast,
  // lalu dilanjutkan dengan sisa waktu yang tersimpan.
  function pauseAll() {
    const now = Date.now()
    for (const toast of toasts) {
      if (toast.timer == null) continue
      clearTimeout(toast.timer)
      toast.timer = null
      toast.remaining = Math.max(0, toast.remaining - (now - toast.startedAt))
    }
  }

  function resumeAll() {
    for (const toast of [...toasts]) {
      if (toast.remaining <= 0) dismiss(toast.id)
      else resume(toast)
    }
  }

  return {
    toasts,
    dismiss,
    push,
    pauseAll,
    resumeAll,
    success: (message, opts) => push(message, { ...opts, type: 'success' }),
    error: (message, opts) => push(message, { ...opts, type: 'error' }),
    info: (message, opts) => push(message, { ...opts, type: 'info' })
  }
}

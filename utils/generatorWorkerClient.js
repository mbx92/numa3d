// Shared worker lifecycle: every request settles, failed workers can be retried.
export class GeneratorWorkerError extends Error {
  constructor(message, cause) {
    super(message, { cause })
    this.name = 'GeneratorWorkerError'
  }
}

export function createGeneratorWorkerClient(createWorker, {
  initialize,
  timeoutMs = 120000,
  initTimeoutMs = 30000
} = {}) {
  let current = null
  let nextId = 0

  function createSession() {
    let worker
    try {
      worker = createWorker()
    } catch (error) {
      throw new GeneratorWorkerError('Worker tidak dapat dimulai. Coba Generate lagi.', error)
    }
    const pending = new Map()
    const controller = new AbortController()
    const session = { worker, failed: null, ready: null }
    let initTimer
    let resolveReady
    let rejectReady
    session.ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    function fail(error) {
      if (session.failed) return
      session.failed = error
      if (current === session) current = null
      clearTimeout(initTimer)
      controller.abort()
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.removeEventListener('messageerror', onMessageError)
      worker.terminate()
      rejectReady(error)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(error)
      }
      pending.clear()
    }

    function onMessage({ data }) {
      if (initialize && data?.type === 'initDone') {
        clearTimeout(initTimer)
        resolveReady()
        return
      }
      if (initialize && data?.type === 'error') {
        fail(new GeneratorWorkerError(data.message || 'Init worker gagal'))
        return
      }
      const request = pending.get(data?.id)
      if (!request) return
      pending.delete(data.id)
      clearTimeout(request.timer)
      if (data.error) request.reject(new Error(data.error))
      else request.resolve(data.result)
    }
    function onError(event) {
      fail(new GeneratorWorkerError(event.message || 'Worker gagal. Coba Generate lagi.', event.error))
    }
    function onMessageError() {
      fail(new GeneratorWorkerError('Hasil worker tidak dapat dibaca. Coba Generate lagi.'))
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.addEventListener('messageerror', onMessageError)

    if (initialize) {
      initTimer = setTimeout(() => fail(new GeneratorWorkerError('Init worker timeout. Coba Generate lagi.')), initTimeoutMs)
      Promise.resolve().then(() => initialize(worker, controller.signal)).catch((error) => {
        fail(new GeneratorWorkerError(error.message || 'Init worker gagal', error))
      })
    } else {
      resolveReady()
    }

    session.request = (opts, transfer) => new Promise((resolve, reject) => {
      if (session.failed) return reject(session.failed)
      const id = ++nextId
      const timer = setTimeout(() => {
        fail(new GeneratorWorkerError('Generate melewati batas waktu. Sederhanakan desain lalu coba lagi.'))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      try {
        worker.postMessage({ id, opts }, [...new Set(transfer)])
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
    return session
  }

  return {
    async run(opts, transfer = []) {
      const session = current || (current = createSession())
      await session.ready
      return session.request(opts, transfer)
    }
  }
}

// Worker lifecycle is injectable for tests. No main-thread evaluation fallback.
export function runCodeStudioJob(createWorker, payload, { signal, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Generate dibatalkan', 'AbortError'))
    let worker
    try { worker = createWorker() } catch (error) { reject(error); return }
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.removeEventListener('messageerror', onMessageError)
      worker.terminate()
      if (error) reject(error)
      else resolve(result)
    }
    const onAbort = () => finish(new DOMException('Generate dibatalkan', 'AbortError'))
    const onError = (event) => finish(new Error(event.message || 'Worker gagal; coba Generate lagi'))
    const onMessageError = () => finish(new Error('Hasil worker tidak dapat dibaca'))
    const onMessage = ({ data }) => {
      if (data?.error) finish(new Error(data.error))
      else if (data?.result) finish(null, data.result)
      else finish(new Error('Respons worker tidak valid'))
    }
    const timer = setTimeout(() => finish(new Error('Generate melewati 30 detik. Sederhanakan desain lalu coba lagi.')), timeoutMs)
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.addEventListener('messageerror', onMessageError)
    signal?.addEventListener('abort', onAbort, { once: true })
    try { worker.postMessage(payload) } catch (error) { finish(error) }
  })
}

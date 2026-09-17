import { computed, onScopeDispose, ref, watch } from 'vue'

// Track edits (including replacement mesh buffers) without serializing large assets.
export function useGeneratorState(form, result, generateModel) {
  const revision = ref(0)
  const resultRevision = ref(-1)
  let active = true
  let pending = null
  let pendingRevision = -1
  watch(form, () => { revision.value++ }, { deep: true, flush: 'sync' })
  onScopeDispose(() => { active = false })

  const isFresh = computed(() => Boolean(result.value) && resultRevision.value === revision.value)

  function runGenerate() {
    if (!active) return Promise.resolve()
    if (pending && pendingRevision === revision.value) return pending
    pendingRevision = revision.value
    const job = Promise.resolve().then(() => { if (active) return generateModel() })
    pending = job
    const cleanup = () => { if (pending === job) pending = null }
    job.then(cleanup, cleanup)
    return job
  }

  async function ensureFreshResult() {
    if (!active) return false
    if (pending) await pending
    if (active && !isFresh.value) await runGenerate()
    return active && !pending && isFresh.value
  }

  return {
    revision,
    isFresh,
    runGenerate,
    ensureFreshResult,
    invalidate() {
      pending = null
      pendingRevision = -1
      resultRevision.value = -1
    },
    markGenerated(value) { resultRevision.value = value }
  }
}

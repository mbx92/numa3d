export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const authUser = useState('authUser', () => null)
  if (!authUser.value) {
    try {
      authUser.value = await $fetch('/api/auth/me', {
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined
      })
    } catch {
      return navigateTo('/login')
    }
  }

  const adminOnlyPaths = ['/users', '/audit-log']
  if (adminOnlyPaths.includes(to.path) && authUser.value.role !== 'admin') {
    return navigateTo('/')
  }
})

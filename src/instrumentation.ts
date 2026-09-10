export async function register() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { validateServerEnv } = await import('./lib/env-server')
  validateServerEnv()
}

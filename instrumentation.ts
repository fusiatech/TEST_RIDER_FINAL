export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./server/instrumentation-node')
    await registerNodeInstrumentation()
  }
}

export async function register(): Promise<void> {
  // WebSocket lifecycle is managed by the custom HTTP server (server.ts).
  // Keeping instrumentation as a no-op avoids accidental standalone WS startup
  // and Node-only dependency resolution during Next instrumentation builds.
}

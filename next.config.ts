import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'node-pty',
    'lowdb',
    '@opentelemetry/sdk-node',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/instrumentation',
  ],
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: process.cwd(),
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@opentelemetry/winston-transport': false,
      '@opentelemetry/exporter-jaeger': false,
    }
    return config
  },
}

export default nextConfig

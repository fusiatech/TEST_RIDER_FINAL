import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['node-pty', 'lowdb'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig

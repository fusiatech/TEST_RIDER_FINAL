import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>
  const proxy = new Proxy(
    {},
    {
      get: () => MotionDiv,
    },
  )

  return {
    motion: proxy,
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  }
})

vi.mock('@/lib/store', () => ({
  useSwarmStore: (selector: (state: unknown) => unknown) =>
    selector({
      jobs: [],
      isRunning: false,
      toggleSettings: vi.fn(),
    }),
}))

import { EclipseDashboard } from '@/components/eclipse-dashboard'

describe('EclipseDashboard health parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing when /api/health returns canonical details payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          uptime: 180,
          details: {
            activeJobCount: 1,
            queueDepth: 2,
            installedCLIs: [{ id: 'cursor', installed: true }],
            memoryUsage: {
              rss: 100,
              heapTotal: 200,
              heapUsed: 40,
              external: 10,
            },
          },
        }),
      }),
    )

    render(<EclipseDashboard />)
    expect(screen.getByText('Welcome Back!')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('All Systems Go!')).toBeInTheDocument()
    })
  })

  it('renders safely when memoryUsage is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'degraded',
          version: '1.0.0',
          uptime: 60,
          details: {
            activeJobCount: 0,
            queueDepth: 0,
            installedCLIs: [],
          },
        }),
      }),
    )

    render(<EclipseDashboard />)
    expect(screen.getByText('Welcome Back!')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Heads Up!')).toBeInTheDocument()
    })
  })
})

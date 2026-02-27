import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/providers/session-provider'
import { PWAPrompt } from '@/components/pwa-prompt'
import { SkipLink } from '@/components/skip-link'
import { RootErrorBoundary } from '@/components/root-error-boundary'
import './globals.css'

export const metadata: Metadata = {
  title: 'SwarmUI',
  description: 'Parallel CLI agent orchestrator with multi-agent web UI',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SwarmUI',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#10b981',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <SessionProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <SkipLink />
            <RootErrorBoundary>
              <div className="min-h-screen bg-background">{children}</div>
            </RootErrorBoundary>
            {/* 
              Toaster with WCAG 2.2 AA accessibility:
              - role="status" with aria-live="polite" for non-critical notifications
              - Keyboard dismissible via Escape key (built-in)
              - Sufficient duration for reading (5s default)
              - Close button for manual dismiss
            */}
            <Toaster 
              richColors 
              closeButton
              duration={5000}
              toastOptions={{
                className: 'focus-visible:ring-2 focus-visible:ring-primary',
              }}
            />
            <PWAPrompt />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}

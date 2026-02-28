import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/providers/session-provider'
import { PWAPrompt } from '@/components/pwa-prompt'
import { SkipLink } from '@/components/skip-link'
import { RootErrorBoundary } from '@/components/root-error-boundary'
import { BRAND } from '@/lib/brand'
import './globals.css'

export const metadata: Metadata = {
  title: BRAND.productName,
  description: BRAND.description,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND.productName,
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#6d28d9',
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
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=localStorage.getItem('fusia-theme-preset');if(p){document.documentElement.dataset.themePreset=p;}}catch(_e){}",
          }}
        />
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

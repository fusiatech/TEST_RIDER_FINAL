'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Github, Mail, Lock, Loader2, AlertCircle } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { BrandLogo } from '@/components/brand-logo'

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/app'
  const error = searchParams.get('error')
  const registered = searchParams.get('registered') === '1'
  const demoAuthEnabled = process.env.NEXT_PUBLIC_DEMO_AUTH_ENABLED === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading('credentials')
    try {
      await signIn('credentials', {
        email,
        password,
        callbackUrl,
      })
    } finally {
      setIsLoading(null)
    }
  }

  const handleOAuthSignIn = async (provider: string) => {
    setIsLoading(provider)
    try {
      await signIn(provider, { callbackUrl })
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex rounded-2xl border border-border bg-card/80 p-3">
            <BrandLogo className="h-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to {BRAND.productName}</h1>
          <p className="mt-2 text-muted">Sign in to access your adaptive engineering workspace</p>
        </div>

        {/* Error Message */}
        {registered && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-600">
            <p className="text-sm">Registration complete. Sign in to continue.</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">
              {error === 'CredentialsSignin'
                ? 'Invalid email or password'
                : 'An error occurred during sign in'}
            </p>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthSignIn('github')}
              disabled={isLoading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === 'github' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Github className="w-5 h-5" />
              )}
              Continue with GitHub
            </button>

            <button
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading !== null}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === 'google' ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted">or continue with email</span>
            </div>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === 'credentials' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              Sign in
            </button>
          </form>

          {demoAuthEnabled && (
            <div className="text-center text-sm text-muted">
              <p>Demo sign-in is enabled for this environment.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted space-y-1">
          <p>
            No account yet?{' '}
            <Link href="/register" className="text-primary underline-offset-2 hover:underline">
              Create one
            </Link>
          </p>
          <p>By signing in, you agree to our Terms of Service and Privacy Policy.</p>
        </div>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 animate-pulse" />
          <div className="h-8 bg-muted/20 rounded w-48 mx-auto animate-pulse" />
          <div className="h-4 bg-muted/20 rounded w-64 mx-auto mt-2 animate-pulse" />
        </div>
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div className="space-y-3">
            <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
            <div className="h-12 bg-muted/20 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}

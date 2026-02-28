import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppShell } from '@/components/app-shell'

export default async function AppHome() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/app')
  }
  return <AppShell />
}

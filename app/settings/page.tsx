import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { SettingsWorkspace } from '@/components/settings-workspace'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/settings')
  }

  return <SettingsWorkspace />
}

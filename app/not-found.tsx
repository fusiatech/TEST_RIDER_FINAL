import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NoDataState } from '@/components/ui/no-data-state'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl">
        <NoDataState
          title="Page not found"
          description="The page you requested does not exist or has moved."
        />
        <div className="mt-3 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/app">Back to App</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

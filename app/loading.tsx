import { LoadingState } from '@/components/ui/loading-state'

export default function GlobalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl rounded-2xl border border-border/70 bg-card/40 px-6 py-8">
        <LoadingState
          variant="workflow"
          size="lg"
          text="Loading Fusia AI..."
          steps={['Secure', 'Sync', 'Render', 'Ready']}
          activeStep={2}
        />
      </div>
    </div>
  )
}

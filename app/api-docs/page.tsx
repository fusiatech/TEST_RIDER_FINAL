'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileJson, ExternalLink } from 'lucide-react'

const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse text-muted-foreground">Loading API documentation...</div>
    </div>
  ),
})

export default function ApiDocsPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-14 items-center gap-4 px-4">
          <Link
            href="/app"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-action-id="api-docs-back-to-app"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <a
              href="/api/openapi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileJson className="h-4 w-4" />
              OpenAPI JSON
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Fusia AI API Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Interactive API documentation powered by OpenAPI 3.0 and Swagger UI
          </p>
        </div>

        {mounted && (
          <div className="swagger-wrapper rounded-lg border border-border overflow-hidden">
            <SwaggerUI url="/api/openapi" />
          </div>
        )}
      </main>

      <style jsx global>{`
        .swagger-wrapper .swagger-ui {
          font-family: inherit;
        }
        
        .swagger-wrapper .swagger-ui .info {
          margin: 20px 0;
        }
        
        .swagger-wrapper .swagger-ui .info .title {
          font-size: 1.5rem;
          font-weight: 600;
        }
        
        .swagger-wrapper .swagger-ui .opblock-tag {
          font-size: 1rem;
          font-weight: 600;
          border-bottom: 1px solid hsl(var(--border));
        }
        
        .swagger-wrapper .swagger-ui .opblock {
          margin-bottom: 8px;
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
          box-shadow: none;
        }
        
        .swagger-wrapper .swagger-ui .opblock .opblock-summary {
          border-radius: 8px;
        }
        
        .swagger-wrapper .swagger-ui .opblock.opblock-get {
          background: rgba(97, 175, 254, 0.1);
          border-color: rgba(97, 175, 254, 0.3);
        }
        
        .swagger-wrapper .swagger-ui .opblock.opblock-post {
          background: rgba(73, 204, 144, 0.1);
          border-color: rgba(73, 204, 144, 0.3);
        }
        
        .swagger-wrapper .swagger-ui .opblock.opblock-put {
          background: rgba(252, 161, 48, 0.1);
          border-color: rgba(252, 161, 48, 0.3);
        }
        
        .swagger-wrapper .swagger-ui .opblock.opblock-delete {
          background: rgba(249, 62, 62, 0.1);
          border-color: rgba(249, 62, 62, 0.3);
        }
        
        .swagger-wrapper .swagger-ui .opblock.opblock-patch {
          background: rgba(80, 227, 194, 0.1);
          border-color: rgba(80, 227, 194, 0.3);
        }
        
        .swagger-wrapper .swagger-ui .btn {
          border-radius: 6px;
        }
        
        .swagger-wrapper .swagger-ui select {
          border-radius: 6px;
        }
        
        .swagger-wrapper .swagger-ui input[type="text"],
        .swagger-wrapper .swagger-ui textarea {
          border-radius: 6px;
        }
        
        .swagger-wrapper .swagger-ui .model-box {
          background: hsl(var(--muted));
          border-radius: 8px;
        }
        
        .swagger-wrapper .swagger-ui .responses-inner {
          padding: 16px;
        }
        
        .swagger-wrapper .swagger-ui table tbody tr td {
          padding: 10px 0;
        }
        
        .dark .swagger-wrapper .swagger-ui,
        .dark .swagger-wrapper .swagger-ui .info .title,
        .dark .swagger-wrapper .swagger-ui .info .description,
        .dark .swagger-wrapper .swagger-ui .opblock-tag,
        .dark .swagger-wrapper .swagger-ui .opblock .opblock-summary-description,
        .dark .swagger-wrapper .swagger-ui .opblock-description-wrapper p,
        .dark .swagger-wrapper .swagger-ui .parameter__name,
        .dark .swagger-wrapper .swagger-ui .parameter__type,
        .dark .swagger-wrapper .swagger-ui table thead tr th,
        .dark .swagger-wrapper .swagger-ui table tbody tr td,
        .dark .swagger-wrapper .swagger-ui .response-col_status,
        .dark .swagger-wrapper .swagger-ui .response-col_description,
        .dark .swagger-wrapper .swagger-ui .model-title,
        .dark .swagger-wrapper .swagger-ui .model {
          color: hsl(var(--foreground));
        }
        
        .dark .swagger-wrapper .swagger-ui .opblock .opblock-section-header {
          background: hsl(var(--muted));
        }
        
        .dark .swagger-wrapper .swagger-ui input[type="text"],
        .dark .swagger-wrapper .swagger-ui textarea {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          border-color: hsl(var(--border));
        }
        
        .dark .swagger-wrapper .swagger-ui select {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          border-color: hsl(var(--border));
        }
        
        .dark .swagger-wrapper .swagger-ui .model-box {
          background: hsl(var(--muted));
        }
        
        .dark .swagger-wrapper .swagger-ui .highlight-code {
          background: hsl(var(--muted));
        }
      `}</style>
    </div>
  )
}

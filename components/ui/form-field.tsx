import * as React from 'react'
import { cn } from '@/lib/utils'

export interface FormFieldProps {
  label: string
  error?: string
  helpText?: string
  required?: boolean
  children: React.ReactNode
  className?: string
  htmlFor?: string
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, error, helpText, required, children, className, htmlFor }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-1.5', className)}>
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-foreground"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {children}
        {error ? (
          <p className="text-xs text-destructive animate-fade-in" role="alert">
            {error}
          </p>
        ) : helpText ? (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        ) : null}
      </div>
    )
  }
)
FormField.displayName = 'FormField'

export { FormField }

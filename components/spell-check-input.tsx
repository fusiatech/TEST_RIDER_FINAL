'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSpellChecker } from '@/lib/spell-checker'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Check, X, Plus, AlertCircle } from 'lucide-react'

interface SpellCheckResult {
  word: string
  index: number
  suggestions: string[]
  isCorrect: boolean
}

interface SpellCheckInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  autoCorrect?: boolean
  showInlineErrors?: boolean
  onSpellCheckComplete?: (errors: SpellCheckResult[]) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  autoResize?: boolean
  maxHeight?: number
  minHeight?: number
  rows?: number
  id?: string
}

export function SpellCheckInput({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  autoCorrect = false,
  showInlineErrors = true,
  onSpellCheckComplete,
  onKeyDown,
  autoResize = false,
  maxHeight = 200,
  minHeight,
  rows = 3,
  id,
}: SpellCheckInputProps) {
  const spellChecker = useSpellChecker()
  const [errors, setErrors] = useState<SpellCheckResult[]>([])
  const [selectedError, setSelectedError] = useState<SpellCheckResult | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const checkSpelling = useCallback((text: string) => {
    const incorrectWords = spellChecker.getIncorrectWords(text)
    setErrors(incorrectWords)
    onSpellCheckComplete?.(incorrectWords)
  }, [spellChecker, onSpellCheckComplete])
  
  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current)
    }
    
    checkTimeoutRef.current = setTimeout(() => {
      checkSpelling(value)
    }, 300)
    
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current)
      }
    }
  }, [value, checkSpelling])
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newValue = e.target.value
    
    if (autoCorrect && newValue.endsWith(' ')) {
      const words = newValue.trimEnd().split(/\s+/)
      const lastWord = words[words.length - 1]
      if (lastWord) {
        const suggestions = spellChecker.getSuggestions(lastWord)
        if (suggestions.length > 0 && !spellChecker.isCorrect(lastWord)) {
          words[words.length - 1] = suggestions[0]
          newValue = words.join(' ') + ' '
        }
      }
    }
    
    onChange(newValue)
    
    if (autoResize && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    }
  }, [onChange, autoCorrect, spellChecker, autoResize, maxHeight])
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e)
  }, [onKeyDown])
  
  const handleSuggestionClick = useCallback((error: SpellCheckResult, suggestion: string) => {
    const before = value.slice(0, error.index)
    const after = value.slice(error.index + error.word.length)
    onChange(before + suggestion + after)
    setPopoverOpen(false)
    setSelectedError(null)
  }, [value, onChange])
  
  const handleIgnoreWord = useCallback((word: string) => {
    spellChecker.ignoreWord(word)
    checkSpelling(value)
    setPopoverOpen(false)
    setSelectedError(null)
  }, [spellChecker, checkSpelling, value])
  
  const handleAddToDictionary = useCallback((word: string) => {
    spellChecker.addWord(word)
    checkSpelling(value)
    setPopoverOpen(false)
    setSelectedError(null)
  }, [spellChecker, checkSpelling, value])
  
  const handleErrorClick = useCallback((error: SpellCheckResult) => {
    setSelectedError(error)
    setPopoverOpen(true)
  }, [])
  
  const highlightedContent = useMemo(() => {
    if (!showInlineErrors || errors.length === 0) {
      return null
    }
    
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    
    const sortedErrors = [...errors].sort((a, b) => a.index - b.index)
    
    for (const error of sortedErrors) {
      if (error.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {value.slice(lastIndex, error.index)}
          </span>
        )
      }
      
      parts.push(
        <Popover 
          key={`error-${error.index}`}
          open={popoverOpen && selectedError?.index === error.index}
          onOpenChange={(open) => {
            if (!open) {
              setPopoverOpen(false)
              setSelectedError(null)
            }
          }}
        >
          <PopoverTrigger asChild>
            <span
              className="underline decoration-wavy decoration-red-500 cursor-pointer hover:bg-red-500/10 rounded px-0.5"
              onClick={() => handleErrorClick(error)}
            >
              {error.word}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span>Spelling suggestion</span>
              </div>
              
              {error.suggestions.length > 0 ? (
                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {error.suggestions.map((suggestion, idx) => (
                      <Button
                        key={idx}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-left"
                        onClick={() => handleSuggestionClick(error, suggestion)}
                      >
                        <Check className="h-3 w-3 mr-2 text-green-500" />
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">No suggestions available</p>
              )}
              
              <div className="flex gap-1 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => handleIgnoreWord(error.word)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Ignore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => handleAddToDictionary(error.word)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )
      
      lastIndex = error.index + error.word.length
    }
    
    if (lastIndex < value.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {value.slice(lastIndex)}
        </span>
      )
    }
    
    return parts
  }, [value, errors, showInlineErrors, popoverOpen, selectedError, handleErrorClick, handleSuggestionClick, handleIgnoreWord, handleAddToDictionary])
  
  return (
    <div className={cn('relative', className)}>
      {showInlineErrors && errors.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-none p-3 text-transparent whitespace-pre-wrap break-words overflow-hidden"
          style={{ 
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
          aria-hidden="true"
        >
          {highlightedContent}
        </div>
      )}
      
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          'w-full p-3 rounded-md border bg-transparent resize-none',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          showInlineErrors && errors.length > 0 && 'caret-foreground'
        )}
        style={{
          WebkitTextFillColor: showInlineErrors && errors.length > 0 ? 'transparent' : undefined,
          minHeight: minHeight ? `${minHeight}px` : undefined,
        }}
      />
      
      {showInlineErrors && errors.length > 0 && (
        <div
          className="absolute inset-0 p-3 pointer-events-auto whitespace-pre-wrap break-words overflow-hidden"
          style={{ 
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
        >
          {highlightedContent}
        </div>
      )}
      
      {errors.length > 0 && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          {errors.length} spelling {errors.length === 1 ? 'error' : 'errors'}
        </div>
      )}
    </div>
  )
}

export function SpellCheckStatus({ errors }: { errors: SpellCheckResult[] }) {
  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-500">
        <Check className="h-3 w-3" />
        <span>No spelling errors</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-1 text-xs text-amber-500">
      <AlertCircle className="h-3 w-3" />
      <span>{errors.length} spelling {errors.length === 1 ? 'error' : 'errors'}</span>
    </div>
  )
}

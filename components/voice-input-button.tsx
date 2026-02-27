'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Mic, MicOff, Square, Settings, Volume2, AlertCircle } from 'lucide-react'
import { VoiceInput, type VoiceInputState, type VoiceInputConfig } from '@/lib/voice-input'

interface VoiceInputButtonProps {
  onTranscript: (transcript: string, isFinal: boolean) => void
  onListeningChange?: (isListening: boolean) => void
  className?: string
  disabled?: boolean
  showSettings?: boolean
  appendMode?: boolean
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'sv-SE', name: 'Swedish' },
  { code: 'da-DK', name: 'Danish' },
  { code: 'fi-FI', name: 'Finnish' },
  { code: 'no-NO', name: 'Norwegian' },
]

export function VoiceInputButton({
  onTranscript,
  onListeningChange,
  className,
  disabled = false,
  showSettings = true,
  appendMode = true,
}: VoiceInputButtonProps) {
  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    isSupported: true,
    isMicrophoneAvailable: true,
    transcript: '',
    interimTranscript: '',
    error: null,
    confidence: 0,
  })
  const [language, setLanguage] = useState('en-US')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const voiceInputRef = useRef<VoiceInput | null>(null)
  const accumulatedTranscriptRef = useRef('')
  
  useEffect(() => {
    const config: Partial<VoiceInputConfig> = {
      language,
      continuous: true,
      interimResults: true,
    }
    
    const callbacks = {
      onResult: (transcript: string, isFinal: boolean) => {
        if (appendMode) {
          if (isFinal) {
            accumulatedTranscriptRef.current += transcript
            onTranscript(accumulatedTranscriptRef.current, true)
          } else {
            onTranscript(accumulatedTranscriptRef.current + transcript, false)
          }
        } else {
          onTranscript(transcript, isFinal)
        }
      },
      onStart: () => {
        onListeningChange?.(true)
      },
      onEnd: () => {
        onListeningChange?.(false)
      },
    }
    
    voiceInputRef.current = new VoiceInput(config, callbacks)
    
    const unsubscribe = voiceInputRef.current.subscribe(setState)
    
    return () => {
      unsubscribe()
      voiceInputRef.current?.destroy()
    }
  }, [language, onTranscript, onListeningChange, appendMode])
  
  const handleToggle = useCallback(async () => {
    if (!voiceInputRef.current) return
    
    if (state.isListening) {
      voiceInputRef.current.stop()
      accumulatedTranscriptRef.current = ''
    } else {
      accumulatedTranscriptRef.current = ''
      await voiceInputRef.current.start()
    }
  }, [state.isListening])
  
  const handleStop = useCallback(() => {
    voiceInputRef.current?.stop()
    accumulatedTranscriptRef.current = ''
  }, [])
  
  const handleLanguageChange = useCallback((newLanguage: string) => {
    setLanguage(newLanguage)
    voiceInputRef.current?.setLanguage(newLanguage)
  }, [])
  
  if (!state.isSupported) {
    return (
      <Tooltip content="Voice input is not supported in this browser">
        <Button
          variant="ghost"
          size="icon"
          disabled
          className={cn('opacity-50', className)}
        >
          <MicOff className="h-4 w-4" />
        </Button>
      </Tooltip>
    )
  }
  
  const getTooltipContent = () => {
    if (state.isListening) return 'Click to stop recording'
    if (!state.isMicrophoneAvailable) return 'Microphone access denied'
    return 'Click to start voice input'
  }
  
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Tooltip content={getTooltipContent()}>
        <Button
          variant={state.isListening ? 'destructive' : 'ghost'}
          size="icon"
          onClick={handleToggle}
          disabled={disabled || !state.isMicrophoneAvailable}
          className={cn(
            'relative',
            state.isListening && 'animate-pulse'
          )}
        >
          {state.isListening ? (
            <>
              <Mic className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
            </>
          ) : !state.isMicrophoneAvailable ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </Tooltip>
      
      {state.isListening && (
        <Tooltip content="Stop recording">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStop}
            className="h-8 w-8"
          >
            <Square className="h-3 w-3" />
          </Button>
        </Tooltip>
      )}
      
      {showSettings && (
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={state.isListening}
            >
              <Settings className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {state.confidence > 0 && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Confidence</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all',
                          state.confidence > 0.8 ? 'bg-green-500' :
                          state.confidence > 0.5 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${state.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(state.confidence * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
      
      {state.error && (
        <Tooltip content={state.error}>
          <div className="text-red-500">
            <AlertCircle className="h-4 w-4" />
          </div>
        </Tooltip>
      )}
      
      {state.isListening && state.interimTranscript && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground max-w-[200px] truncate">
          <Volume2 className="h-3 w-3 animate-pulse" />
          <span className="truncate italic">{state.interimTranscript}</span>
        </div>
      )}
    </div>
  )
}

export function VoiceInputIndicator({ isListening }: { isListening: boolean }) {
  if (!isListening) return null
  
  return (
    <div className="flex items-center gap-2 text-sm text-red-500 animate-pulse">
      <Mic className="h-4 w-4" />
      <span>Listening...</span>
      <div className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-1 bg-red-500 rounded-full animate-bounce"
            style={{
              height: `${8 + Math.random() * 8}px`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

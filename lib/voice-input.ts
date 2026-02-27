'use client'

export interface VoiceInputConfig {
  language: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
}

export interface VoiceInputState {
  isListening: boolean
  isSupported: boolean
  isMicrophoneAvailable: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  confidence: number
}

export interface VoiceInputCallbacks {
  onResult?: (transcript: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStart?: () => void
  onEnd?: () => void
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
}

const DEFAULT_CONFIG: VoiceInputConfig = {
  language: 'en-US',
  continuous: true,
  interimResults: true,
  maxAlternatives: 3,
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

export class VoiceInput {
  private recognition: SpeechRecognition | null = null
  private config: VoiceInputConfig
  private callbacks: VoiceInputCallbacks
  private state: VoiceInputState
  private stateListeners: Set<(state: VoiceInputState) => void> = new Set()
  
  constructor(config: Partial<VoiceInputConfig> = {}, callbacks: VoiceInputCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.callbacks = callbacks
    this.state = {
      isListening: false,
      isSupported: false,
      isMicrophoneAvailable: false,
      transcript: '',
      interimTranscript: '',
      error: null,
      confidence: 0,
    }
    
    this.initializeRecognition()
  }
  
  private initializeRecognition(): void {
    if (typeof window === 'undefined') {
      return
    }
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (!SpeechRecognitionAPI) {
      this.updateState({ isSupported: false })
      return
    }
    
    this.updateState({ isSupported: true })
    
    this.recognition = new SpeechRecognitionAPI()
    this.recognition.lang = this.config.language
    this.recognition.continuous = this.config.continuous
    this.recognition.interimResults = this.config.interimResults
    this.recognition.maxAlternatives = this.config.maxAlternatives
    
    this.recognition.onstart = () => {
      this.updateState({ isListening: true, error: null })
      this.callbacks.onStart?.()
    }
    
    this.recognition.onend = () => {
      this.updateState({ isListening: false })
      this.callbacks.onEnd?.()
    }
    
    this.recognition.onspeechstart = () => {
      this.callbacks.onSpeechStart?.()
    }
    
    this.recognition.onspeechend = () => {
      this.callbacks.onSpeechEnd?.()
    }
    
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''
      let finalTranscript = ''
      let maxConfidence = 0
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        const confidence = result[0].confidence
        
        if (confidence > maxConfidence) {
          maxConfidence = confidence
        }
        
        if (result.isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }
      
      if (finalTranscript) {
        const newTranscript = this.state.transcript + finalTranscript
        this.updateState({
          transcript: newTranscript,
          interimTranscript: '',
          confidence: maxConfidence,
        })
        this.callbacks.onResult?.(finalTranscript, true)
      } else {
        this.updateState({
          interimTranscript,
          confidence: maxConfidence,
        })
        this.callbacks.onResult?.(interimTranscript, false)
      }
    }
    
    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage: string
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone.'
          this.updateState({ isMicrophoneAvailable: false })
          break
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access.'
          this.updateState({ isMicrophoneAvailable: false })
          break
        case 'network':
          errorMessage = 'Network error. Please check your internet connection.'
          break
        case 'aborted':
          errorMessage = 'Speech recognition was aborted.'
          break
        case 'language-not-supported':
          errorMessage = `Language "${this.config.language}" is not supported.`
          break
        case 'service-not-allowed':
          errorMessage = 'Speech recognition service is not allowed.'
          break
        default:
          errorMessage = `Speech recognition error: ${event.error}`
      }
      
      this.updateState({ error: errorMessage, isListening: false })
      this.callbacks.onError?.(errorMessage)
    }
    
    this.checkMicrophonePermission()
  }
  
  private async checkMicrophonePermission(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      this.updateState({ isMicrophoneAvailable: true })
      return
    }
    
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      this.updateState({ isMicrophoneAvailable: result.state !== 'denied' })
      
      result.onchange = () => {
        this.updateState({ isMicrophoneAvailable: result.state !== 'denied' })
      }
    } catch {
      this.updateState({ isMicrophoneAvailable: true })
    }
  }
  
  private updateState(partialState: Partial<VoiceInputState>): void {
    this.state = { ...this.state, ...partialState }
    this.stateListeners.forEach(listener => listener(this.state))
  }
  
  subscribe(listener: (state: VoiceInputState) => void): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }
  
  getState(): VoiceInputState {
    return { ...this.state }
  }
  
  async start(): Promise<void> {
    if (!this.recognition) {
      this.updateState({ error: 'Speech recognition is not supported in this browser.' })
      return
    }
    
    if (this.state.isListening) {
      return
    }
    
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      this.updateState({ isMicrophoneAvailable: true })
      this.recognition.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone'
      this.updateState({ 
        error: message,
        isMicrophoneAvailable: false,
      })
      this.callbacks.onError?.(message)
    }
  }
  
  stop(): void {
    if (this.recognition && this.state.isListening) {
      this.recognition.stop()
    }
  }
  
  abort(): void {
    if (this.recognition && this.state.isListening) {
      this.recognition.abort()
    }
  }
  
  clearTranscript(): void {
    this.updateState({
      transcript: '',
      interimTranscript: '',
    })
  }
  
  setLanguage(language: string): void {
    this.config.language = language
    if (this.recognition) {
      this.recognition.lang = language
    }
  }
  
  setCallbacks(callbacks: VoiceInputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }
  
  destroy(): void {
    this.stop()
    this.stateListeners.clear()
    this.recognition = null
  }
}

export function createVoiceInput(
  config?: Partial<VoiceInputConfig>,
  callbacks?: VoiceInputCallbacks
): VoiceInput {
  return new VoiceInput(config, callbacks)
}

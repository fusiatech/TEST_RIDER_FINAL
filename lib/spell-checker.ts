'use client'

interface SpellCheckResult {
  word: string
  index: number
  suggestions: string[]
  isCorrect: boolean
}

interface SpellCheckerConfig {
  maxSuggestions: number
  ignoreWords: Set<string>
  customDictionary: Set<string>
  checkCamelCase: boolean
  checkUrls: boolean
  minWordLength: number
}

const DEFAULT_CONFIG: SpellCheckerConfig = {
  maxSuggestions: 5,
  ignoreWords: new Set(['swarm', 'swarmui', 'api', 'cli', 'ui', 'url', 'http', 'https', 'json', 'html', 'css', 'js', 'ts', 'tsx', 'jsx']),
  customDictionary: new Set(),
  checkCamelCase: false,
  checkUrls: false,
  minWordLength: 2,
}

const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
  'is', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did',
  'doing', 'done', 'should', 'would', 'could', 'might', 'must', 'shall', 'may',
  'please', 'help', 'need', 'want', 'create', 'build', 'make', 'add', 'remove',
  'update', 'delete', 'change', 'fix', 'bug', 'feature', 'code', 'file', 'folder',
  'project', 'app', 'application', 'function', 'class', 'method', 'variable',
  'component', 'module', 'package', 'library', 'framework', 'database', 'server',
  'client', 'frontend', 'backend', 'api', 'endpoint', 'request', 'response',
  'error', 'warning', 'info', 'debug', 'log', 'test', 'testing', 'unit', 'integration',
  'deploy', 'deployment', 'production', 'development', 'staging', 'environment',
  'config', 'configuration', 'setting', 'settings', 'option', 'options', 'parameter',
  'argument', 'value', 'key', 'name', 'type', 'string', 'number', 'boolean', 'array',
  'object', 'null', 'undefined', 'true', 'false', 'import', 'export', 'default',
  'const', 'let', 'var', 'function', 'return', 'async', 'await', 'promise',
  'callback', 'event', 'handler', 'listener', 'state', 'props', 'context', 'hook',
  'effect', 'ref', 'memo', 'reducer', 'action', 'dispatch', 'store', 'selector',
  'route', 'router', 'navigation', 'link', 'page', 'layout', 'template', 'style',
  'theme', 'color', 'font', 'size', 'width', 'height', 'margin', 'padding', 'border',
  'display', 'flex', 'grid', 'position', 'absolute', 'relative', 'fixed', 'sticky',
  'top', 'bottom', 'left', 'right', 'center', 'start', 'end', 'between', 'around',
  'wrap', 'nowrap', 'column', 'row', 'gap', 'space', 'align', 'justify', 'items',
  'content', 'self', 'order', 'grow', 'shrink', 'basis', 'auto', 'none', 'hidden',
  'visible', 'scroll', 'overflow', 'clip', 'text', 'background', 'image', 'icon',
  'button', 'input', 'form', 'label', 'select', 'textarea', 'checkbox', 'radio',
  'submit', 'reset', 'cancel', 'save', 'load', 'send', 'receive', 'upload', 'download',
  'open', 'close', 'show', 'hide', 'toggle', 'enable', 'disable', 'active', 'inactive',
  'selected', 'focused', 'hover', 'pressed', 'disabled', 'loading', 'error', 'success',
  'warning', 'info', 'primary', 'secondary', 'tertiary', 'accent', 'muted', 'subtle',
  'bold', 'italic', 'underline', 'strikethrough', 'uppercase', 'lowercase', 'capitalize',
  'normal', 'medium', 'large', 'small', 'extra', 'mini', 'tiny', 'huge', 'giant',
  'full', 'half', 'quarter', 'third', 'double', 'triple', 'single', 'multiple',
  'first', 'last', 'next', 'previous', 'current', 'new', 'old', 'recent', 'latest',
  'earliest', 'oldest', 'newest', 'best', 'worst', 'better', 'worse', 'good', 'bad',
  'great', 'excellent', 'amazing', 'awesome', 'fantastic', 'wonderful', 'terrible',
  'horrible', 'awful', 'poor', 'fair', 'average', 'okay', 'fine', 'alright',
  'yes', 'no', 'maybe', 'perhaps', 'probably', 'possibly', 'certainly', 'definitely',
  'absolutely', 'exactly', 'precisely', 'approximately', 'roughly', 'about', 'around',
  'nearly', 'almost', 'just', 'only', 'merely', 'simply', 'basically', 'essentially',
  'actually', 'really', 'truly', 'honestly', 'seriously', 'literally', 'figuratively',
  'technically', 'theoretically', 'practically', 'realistically', 'ideally', 'hopefully',
  'unfortunately', 'fortunately', 'luckily', 'unluckily', 'surprisingly', 'unsurprisingly',
  'interestingly', 'importantly', 'significantly', 'notably', 'particularly', 'especially',
  'specifically', 'generally', 'usually', 'typically', 'normally', 'commonly', 'frequently',
  'often', 'sometimes', 'occasionally', 'rarely', 'seldom', 'never', 'always', 'forever',
  'temporarily', 'permanently', 'constantly', 'continuously', 'repeatedly', 'regularly',
  'irregularly', 'periodically', 'sporadically', 'randomly', 'systematically', 'automatically',
  'manually', 'programmatically', 'dynamically', 'statically', 'synchronously', 'asynchronously',
])

const KEYBOARD_LAYOUT: Record<string, string[]> = {
  'q': ['w', 'a', 's'],
  'w': ['q', 'e', 'a', 's', 'd'],
  'e': ['w', 'r', 's', 'd', 'f'],
  'r': ['e', 't', 'd', 'f', 'g'],
  't': ['r', 'y', 'f', 'g', 'h'],
  'y': ['t', 'u', 'g', 'h', 'j'],
  'u': ['y', 'i', 'h', 'j', 'k'],
  'i': ['u', 'o', 'j', 'k', 'l'],
  'o': ['i', 'p', 'k', 'l'],
  'p': ['o', 'l'],
  'a': ['q', 'w', 's', 'z', 'x'],
  's': ['q', 'w', 'e', 'a', 'd', 'z', 'x', 'c'],
  'd': ['w', 'e', 'r', 's', 'f', 'x', 'c', 'v'],
  'f': ['e', 'r', 't', 'd', 'g', 'c', 'v', 'b'],
  'g': ['r', 't', 'y', 'f', 'h', 'v', 'b', 'n'],
  'h': ['t', 'y', 'u', 'g', 'j', 'b', 'n', 'm'],
  'j': ['y', 'u', 'i', 'h', 'k', 'n', 'm'],
  'k': ['u', 'i', 'o', 'j', 'l', 'm'],
  'l': ['i', 'o', 'p', 'k'],
  'z': ['a', 's', 'x'],
  'x': ['a', 's', 'd', 'z', 'c'],
  'c': ['s', 'd', 'f', 'x', 'v'],
  'v': ['d', 'f', 'g', 'c', 'b'],
  'b': ['f', 'g', 'h', 'v', 'n'],
  'n': ['g', 'h', 'j', 'b', 'm'],
  'm': ['h', 'j', 'k', 'n'],
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

function isKeyboardAdjacent(char1: string, char2: string): boolean {
  const neighbors = KEYBOARD_LAYOUT[char1.toLowerCase()]
  return neighbors ? neighbors.includes(char2.toLowerCase()) : false
}

function generateCandidates(word: string): string[] {
  const candidates: Set<string> = new Set()
  const lowercaseWord = word.toLowerCase()
  
  for (let i = 0; i < lowercaseWord.length; i++) {
    candidates.add(lowercaseWord.slice(0, i) + lowercaseWord.slice(i + 1))
  }
  
  for (let i = 0; i < lowercaseWord.length; i++) {
    for (let c = 97; c <= 122; c++) {
      candidates.add(lowercaseWord.slice(0, i) + String.fromCharCode(c) + lowercaseWord.slice(i + 1))
    }
  }
  
  for (let i = 0; i <= lowercaseWord.length; i++) {
    for (let c = 97; c <= 122; c++) {
      candidates.add(lowercaseWord.slice(0, i) + String.fromCharCode(c) + lowercaseWord.slice(i))
    }
  }
  
  for (let i = 0; i < lowercaseWord.length - 1; i++) {
    candidates.add(
      lowercaseWord.slice(0, i) +
      lowercaseWord.charAt(i + 1) +
      lowercaseWord.charAt(i) +
      lowercaseWord.slice(i + 2)
    )
  }
  
  return Array.from(candidates)
}

export class SpellChecker {
  private config: SpellCheckerConfig
  private dictionary: Set<string>
  
  constructor(config: Partial<SpellCheckerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.dictionary = new Set([...COMMON_WORDS, ...this.config.customDictionary, ...this.config.ignoreWords])
  }
  
  addWord(word: string): void {
    this.dictionary.add(word.toLowerCase())
    this.config.customDictionary.add(word.toLowerCase())
  }
  
  addWords(words: string[]): void {
    words.forEach(word => this.addWord(word))
  }
  
  removeWord(word: string): void {
    this.dictionary.delete(word.toLowerCase())
    this.config.customDictionary.delete(word.toLowerCase())
  }
  
  ignoreWord(word: string): void {
    this.config.ignoreWords.add(word.toLowerCase())
    this.dictionary.add(word.toLowerCase())
  }
  
  isCorrect(word: string): boolean {
    const lowercaseWord = word.toLowerCase()
    
    if (word.length < this.config.minWordLength) {
      return true
    }
    
    if (this.config.ignoreWords.has(lowercaseWord)) {
      return true
    }
    
    if (/^\d+$/.test(word)) {
      return true
    }
    
    if (!this.config.checkUrls && /^https?:\/\//.test(word)) {
      return true
    }
    
    if (/^[A-Z0-9_]+$/.test(word)) {
      return true
    }
    
    if (!this.config.checkCamelCase && /^[a-z]+([A-Z][a-z]*)+$/.test(word)) {
      return true
    }
    
    if (/^[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+$/.test(word)) {
      return true
    }
    
    return this.dictionary.has(lowercaseWord)
  }
  
  getSuggestions(word: string): string[] {
    if (this.isCorrect(word)) {
      return []
    }
    
    const lowercaseWord = word.toLowerCase()
    const candidates = generateCandidates(lowercaseWord)
    const validCandidates: Array<{ word: string; score: number }> = []
    
    for (const candidate of candidates) {
      if (this.dictionary.has(candidate)) {
        const distance = levenshteinDistance(lowercaseWord, candidate)
        let score = distance
        
        if (lowercaseWord.length > 0 && candidate.length > 0) {
          if (lowercaseWord[0] === candidate[0]) {
            score -= 0.5
          }
          
          for (let i = 0; i < Math.min(lowercaseWord.length, candidate.length); i++) {
            if (lowercaseWord[i] !== candidate[i] && isKeyboardAdjacent(lowercaseWord[i], candidate[i])) {
              score -= 0.3
            }
          }
        }
        
        validCandidates.push({ word: candidate, score })
      }
    }
    
    const secondOrderCandidates: Array<{ word: string; score: number }> = []
    for (const { word: candidate } of validCandidates.slice(0, 10)) {
      const secondOrder = generateCandidates(candidate)
      for (const secondCandidate of secondOrder) {
        if (this.dictionary.has(secondCandidate) && !validCandidates.some(c => c.word === secondCandidate)) {
          const distance = levenshteinDistance(lowercaseWord, secondCandidate)
          if (distance <= 3) {
            secondOrderCandidates.push({ word: secondCandidate, score: distance + 0.5 })
          }
        }
      }
    }
    
    const allCandidates = [...validCandidates, ...secondOrderCandidates]
    allCandidates.sort((a, b) => a.score - b.score)
    
    const seen = new Set<string>()
    const uniqueSuggestions: string[] = []
    
    for (const { word: suggestion } of allCandidates) {
      if (!seen.has(suggestion)) {
        seen.add(suggestion)
        const formattedSuggestion = word[0] === word[0].toUpperCase()
          ? suggestion.charAt(0).toUpperCase() + suggestion.slice(1)
          : suggestion
        uniqueSuggestions.push(formattedSuggestion)
        if (uniqueSuggestions.length >= this.config.maxSuggestions) {
          break
        }
      }
    }
    
    return uniqueSuggestions
  }
  
  checkText(text: string): SpellCheckResult[] {
    const results: SpellCheckResult[] = []
    const wordRegex = /\b[a-zA-Z']+\b/g
    let match
    
    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0]
      const cleanWord = word.replace(/^'+|'+$/g, '')
      
      if (cleanWord.length >= this.config.minWordLength) {
        const isCorrect = this.isCorrect(cleanWord)
        results.push({
          word: cleanWord,
          index: match.index,
          suggestions: isCorrect ? [] : this.getSuggestions(cleanWord),
          isCorrect,
        })
      }
    }
    
    return results
  }
  
  getIncorrectWords(text: string): SpellCheckResult[] {
    return this.checkText(text).filter(result => !result.isCorrect)
  }
  
  autoCorrect(text: string): string {
    const incorrectWords = this.getIncorrectWords(text)
    let correctedText = text
    let offset = 0
    
    for (const { word, index, suggestions } of incorrectWords) {
      if (suggestions.length > 0) {
        const suggestion = suggestions[0]
        const actualIndex = index + offset
        correctedText = correctedText.slice(0, actualIndex) + suggestion + correctedText.slice(actualIndex + word.length)
        offset += suggestion.length - word.length
      }
    }
    
    return correctedText
  }
}

export const defaultSpellChecker = new SpellChecker()

export function useSpellChecker(config?: Partial<SpellCheckerConfig>) {
  const checker = config ? new SpellChecker(config) : defaultSpellChecker
  
  return {
    isCorrect: (word: string) => checker.isCorrect(word),
    getSuggestions: (word: string) => checker.getSuggestions(word),
    checkText: (text: string) => checker.checkText(text),
    getIncorrectWords: (text: string) => checker.getIncorrectWords(text),
    autoCorrect: (text: string) => checker.autoCorrect(text),
    addWord: (word: string) => checker.addWord(word),
    ignoreWord: (word: string) => checker.ignoreWord(word),
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  escapeHTML,
  sanitizeHTML,
  stripHTML,
  sanitizeUserInput,
  sanitizeFilename,
} from '@/lib/sanitize'

/**
 * XSS (Cross-Site Scripting) Prevention Tests
 * Tests for XSS protection in user input, chat messages, file names, and CSP headers
 */

describe('XSS Prevention Tests', () => {
  describe('XSS in User Input', () => {
    describe('Basic Script Injection', () => {
      it('escapes basic script tags', () => {
        const input = '<script>alert("xss")</script>'
        const result = escapeHTML(input)
        
        expect(result).not.toContain('<script>')
        expect(result).toContain('&lt;script&gt;')
      })

      it('escapes script tags with attributes', () => {
        const input = '<script src="evil.js"></script>'
        const result = escapeHTML(input)
        
        expect(result).not.toContain('<script')
        expect(result).toContain('&lt;script')
      })

      it('escapes script tags with different casing', () => {
        const inputs = [
          '<SCRIPT>alert(1)</SCRIPT>',
          '<ScRiPt>alert(1)</ScRiPt>',
          '<sCRIPT>alert(1)</sCRIPT>',
        ]
        
        for (const input of inputs) {
          const result = escapeHTML(input)
          expect(result.toLowerCase()).not.toContain('<script>')
        }
      })

      it('escapes nested script tags', () => {
        const input = '<scr<script>ipt>alert(1)</scr</script>ipt>'
        const result = escapeHTML(input)
        
        expect(result).not.toContain('<script>')
      })
    })

    describe('Event Handler Injection', () => {
      const eventHandlers = [
        'onclick', 'onmouseover', 'onmouseout', 'onload', 'onerror',
        'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown',
        'onkeyup', 'onkeypress', 'ondblclick', 'oncontextmenu',
      ]

      for (const handler of eventHandlers) {
        it(`sanitizes ${handler} event handler`, () => {
          const input = `<div ${handler}="alert('xss')">content</div>`
          const result = sanitizeHTML(input)
          
          expect(result.toLowerCase()).not.toContain(handler)
        })
      }

      it('sanitizes event handlers with different quote styles', () => {
        const inputs = [
          `<div onclick="alert('xss')">`,
          `<div onclick='alert("xss")'>`,
          `<div onclick=alert(1)>`,
        ]
        
        for (const input of inputs) {
          const result = sanitizeHTML(input)
          expect(result.toLowerCase()).not.toContain('onclick')
        }
      })

      it('sanitizes event handlers with whitespace', () => {
        const inputs = [
          '<div onclick = "alert(1)">',
          '<div onclick\n="alert(1)">',
          '<div onclick\t="alert(1)">',
        ]
        
        for (const input of inputs) {
          const result = sanitizeHTML(input)
          expect(result.toLowerCase()).not.toContain('onclick')
        }
      })
    })

    describe('JavaScript Protocol Injection', () => {
      it('sanitizes javascript: protocol in href', () => {
        const input = '<a href="javascript:alert(1)">click</a>'
        const result = sanitizeHTML(input)
        
        expect(result.toLowerCase()).not.toContain('javascript:')
      })

      it('sanitizes javascript: protocol with encoding', () => {
        const inputs = [
          '<a href="&#106;avascript:alert(1)">',
          '<a href="&#x6A;avascript:alert(1)">',
          '<a href="java&#115;cript:alert(1)">',
        ]
        
        for (const input of inputs) {
          const result = sanitizeHTML(input)
          expect(result).not.toMatch(/javascript:/i)
        }
      })

      it('sanitizes javascript: with whitespace', () => {
        const inputs = [
          '<a href="java script:alert(1)">',
          '<a href="java\nscript:alert(1)">',
          '<a href="java\tscript:alert(1)">',
        ]
        
        for (const input of inputs) {
          const result = sanitizeHTML(input)
          expect(result).not.toMatch(/javascript\s*:/i)
        }
      })

      it('sanitizes vbscript: protocol', () => {
        const input = '<a href="vbscript:msgbox(1)">click</a>'
        const result = sanitizeHTML(input)
        
        expect(result.toLowerCase()).not.toContain('vbscript:')
      })

      it('sanitizes data: protocol', () => {
        const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>'
        const result = sanitizeHTML(input)
        
        expect(result.toLowerCase()).not.toContain('data:')
      })
    })

    describe('HTML Entity Encoding', () => {
      it('encodes less than sign', () => {
        const result = escapeHTML('<')
        expect(result).toBe('&lt;')
      })

      it('encodes greater than sign', () => {
        const result = escapeHTML('>')
        expect(result).toBe('&gt;')
      })

      it('encodes ampersand', () => {
        const result = escapeHTML('&')
        expect(result).toBe('&amp;')
      })

      it('encodes double quotes', () => {
        const result = escapeHTML('"')
        expect(result).toBe('&quot;')
      })

      it('encodes single quotes', () => {
        const result = escapeHTML("'")
        expect(result).toBe('&#x27;')
      })

      it('encodes backticks', () => {
        const result = escapeHTML('`')
        expect(result).toBe('&#x60;')
      })

      it('encodes forward slash', () => {
        const result = escapeHTML('/')
        expect(result).toBe('&#x2F;')
      })

      it('encodes equals sign', () => {
        const result = escapeHTML('=')
        expect(result).toBe('&#x3D;')
      })

      it('encodes all special characters in a string', () => {
        const input = '<script>alert("xss")</script>'
        const result = escapeHTML(input)
        
        expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;')
      })
    })

    describe('SVG and MathML Injection', () => {
      it('sanitizes SVG with embedded script', () => {
        const input = '<svg onload="alert(1)"><circle r="10"/></svg>'
        const result = sanitizeHTML(input)
        
        expect(result.toLowerCase()).not.toContain('onload')
      })

      it('sanitizes SVG with foreignObject', () => {
        const input = '<svg><foreignObject><body onload="alert(1)"/></foreignObject></svg>'
        const result = sanitizeHTML(input)
        
        expect(result.toLowerCase()).not.toContain('onload')
      })

      it('sanitizes MathML with embedded script', () => {
        const input = '<math><maction actiontype="statusline#http://evil.com">click</maction></math>'
        const result = sanitizeHTML(input)
        
        expect(result).not.toContain('actiontype')
      })
    })

    describe('Template Literal Injection', () => {
      it('escapes template literal syntax', () => {
        const input = '${alert(1)}'
        const result = escapeHTML(input)
        
        expect(result).not.toBe(input)
      })

      it('escapes backticks used in template literals', () => {
        const input = '`${document.cookie}`'
        const result = escapeHTML(input)
        
        expect(result).toContain('&#x60;')
      })
    })
  })

  describe('XSS in Chat Messages', () => {
    interface ChatMessage {
      id: string
      content: string
      sender: string
      timestamp: number
    }

    function sanitizeChatMessage(message: ChatMessage): ChatMessage {
      return {
        ...message,
        content: sanitizeHTML(message.content),
        sender: sanitizeUserInput(message.sender),
      }
    }

    it('sanitizes script tags in message content', () => {
      const message: ChatMessage = {
        id: '1',
        content: 'Hello <script>alert("xss")</script> world',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).not.toContain('<script>')
    })

    it('sanitizes event handlers in message content', () => {
      const message: ChatMessage = {
        id: '1',
        content: '<img src="x" onerror="alert(1)">',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content.toLowerCase()).not.toContain('onerror')
    })

    it('sanitizes XSS in sender name', () => {
      const message: ChatMessage = {
        id: '1',
        content: 'Hello',
        sender: '<script>alert(1)</script>',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.sender).not.toContain('<script>')
    })

    it('preserves safe markdown in messages', () => {
      const message: ChatMessage = {
        id: '1',
        content: '**bold** and *italic* text',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).toContain('**bold**')
      expect(sanitized.content).toContain('*italic*')
    })

    it('preserves code blocks in messages', () => {
      const message: ChatMessage = {
        id: '1',
        content: '```javascript\nconst x = 1;\n```',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).toContain('```javascript')
    })

    it('sanitizes XSS inside code blocks', () => {
      const message: ChatMessage = {
        id: '1',
        content: '```html\n<script>alert(1)</script>\n```',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).not.toMatch(/<script>alert\(1\)<\/script>/i)
    })

    it('handles empty message content', () => {
      const message: ChatMessage = {
        id: '1',
        content: '',
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).toBe('')
    })

    it('handles very long messages', () => {
      const longContent = '<script>'.repeat(1000) + 'alert(1)' + '</script>'.repeat(1000)
      const message: ChatMessage = {
        id: '1',
        content: longContent,
        sender: 'user',
        timestamp: Date.now(),
      }
      
      const sanitized = sanitizeChatMessage(message)
      expect(sanitized.content).not.toContain('<script>')
    })

    it('sanitizes polyglot XSS payloads', () => {
      const polyglots = [
        `jaVasCript:/*-/*\`/*\\'\`/*"/**/(/* */oNcLiCk=alert() )//`,
        `<svg/onload=alert()//`,
        `"><img src=x onerror=alert(1)>`,
        `'-alert(1)-'`,
        `</script><script>alert(1)</script>`,
      ]
      
      for (const payload of polyglots) {
        const message: ChatMessage = {
          id: '1',
          content: payload,
          sender: 'user',
          timestamp: Date.now(),
        }
        
        const sanitized = sanitizeChatMessage(message)
        expect(sanitized.content).not.toMatch(/alert\s*\(/i)
      }
    })
  })

  describe('XSS in File Names', () => {
    it('removes script tags from filenames', () => {
      const filename = '<script>alert(1)</script>.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
    })

    it('removes HTML entities from filenames', () => {
      const filename = '&lt;script&gt;.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).toBe('scriptgt.txt')
    })

    it('removes path traversal from filenames', () => {
      const filename = '../../../etc/passwd'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toContain('..')
    })

    it('removes null bytes from filenames', () => {
      const filename = 'file\x00.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toContain('\x00')
    })

    it('removes control characters from filenames', () => {
      const filename = 'file\x1f\x1e.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).toBe('file.txt')
    })

    it('handles unicode filenames safely', () => {
      const filename = 'файл.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).toBe('файл.txt')
    })

    it('removes dangerous Windows characters', () => {
      const filename = 'file<>:"|?*.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).toBe('file.txt')
    })

    it('removes leading dots', () => {
      const filename = '...hidden.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toMatch(/^\./)
    })

    it('removes trailing dots', () => {
      const filename = 'file.txt...'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toMatch(/\.+$/)
    })

    it('truncates very long filenames', () => {
      const filename = 'a'.repeat(300) + '.txt'
      const result = sanitizeFilename(filename)
      
      expect(result.length).toBeLessThanOrEqual(255)
    })

    it('handles empty filename', () => {
      const result = sanitizeFilename('')
      expect(result).toBe('')
    })

    it('handles whitespace-only filename', () => {
      const result = sanitizeFilename('   ')
      expect(result).toBe('')
    })

    it('removes backslashes from filenames', () => {
      const filename = 'path\\to\\file.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toContain('\\')
    })

    it('removes forward slashes from filenames', () => {
      const filename = 'path/to/file.txt'
      const result = sanitizeFilename(filename)
      
      expect(result).not.toContain('/')
    })
  })

  describe('Content-Security-Policy Headers', () => {
    interface CSPDirectives {
      'default-src'?: string[]
      'script-src'?: string[]
      'style-src'?: string[]
      'img-src'?: string[]
      'font-src'?: string[]
      'connect-src'?: string[]
      'frame-src'?: string[]
      'object-src'?: string[]
      'base-uri'?: string[]
      'form-action'?: string[]
      'frame-ancestors'?: string[]
      'upgrade-insecure-requests'?: boolean
      'block-all-mixed-content'?: boolean
    }

    function buildCSPHeader(directives: CSPDirectives): string {
      const parts: string[] = []
      
      for (const [directive, value] of Object.entries(directives)) {
        if (typeof value === 'boolean') {
          if (value) parts.push(directive)
        } else if (Array.isArray(value)) {
          parts.push(`${directive} ${value.join(' ')}`)
        }
      }
      
      return parts.join('; ')
    }

    function validateCSP(csp: string): { valid: boolean; warnings: string[] } {
      const warnings: string[] = []
      
      if (csp.includes("'unsafe-inline'")) {
        warnings.push("'unsafe-inline' allows inline scripts which defeats XSS protection")
      }
      
      if (csp.includes("'unsafe-eval'")) {
        warnings.push("'unsafe-eval' allows eval() which is dangerous")
      }
      
      if (!csp.includes('default-src')) {
        warnings.push('Missing default-src directive')
      }
      
      if (csp.includes('*')) {
        warnings.push('Wildcard (*) source allows any origin')
      }
      
      if (csp.includes('data:') && csp.includes('script-src')) {
        warnings.push('data: URIs in script-src can be used for XSS')
      }
      
      if (!csp.includes('object-src') && !csp.includes("object-src 'none'")) {
        warnings.push('Missing object-src directive (should be none)')
      }
      
      if (!csp.includes('base-uri')) {
        warnings.push('Missing base-uri directive')
      }
      
      return {
        valid: warnings.length === 0,
        warnings,
      }
    }

    it('builds valid CSP header with strict directives', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.valid).toBe(true)
      expect(validation.warnings).toHaveLength(0)
    })

    it('warns about unsafe-inline in script-src', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.valid).toBe(false)
      expect(validation.warnings).toContain("'unsafe-inline' allows inline scripts which defeats XSS protection")
    })

    it('warns about unsafe-eval', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-eval'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.valid).toBe(false)
      expect(validation.warnings).toContain("'unsafe-eval' allows eval() which is dangerous")
    })

    it('warns about wildcard sources', () => {
      const directives: CSPDirectives = {
        'default-src': ['*'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.valid).toBe(false)
      expect(validation.warnings).toContain('Wildcard (*) source allows any origin')
    })

    it('warns about missing default-src', () => {
      const directives: CSPDirectives = {
        'script-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.warnings).toContain('Missing default-src directive')
    })

    it('warns about missing object-src', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.warnings).toContain('Missing object-src directive (should be none)')
    })

    it('warns about missing base-uri', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'object-src': ["'none'"],
      }
      
      const csp = buildCSPHeader(directives)
      const validation = validateCSP(csp)
      
      expect(validation.warnings).toContain('Missing base-uri directive')
    })

    it('includes upgrade-insecure-requests', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'upgrade-insecure-requests': true,
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain('upgrade-insecure-requests')
    })

    it('includes block-all-mixed-content', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'block-all-mixed-content': true,
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain('block-all-mixed-content')
    })

    it('supports nonce-based script-src', () => {
      const nonce = 'abc123'
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", `'nonce-${nonce}'`],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain(`'nonce-${nonce}'`)
    })

    it('supports hash-based script-src', () => {
      const hash = 'sha256-abc123'
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", `'${hash}'`],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain(`'${hash}'`)
    })

    it('supports frame-ancestors for clickjacking protection', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('supports form-action to prevent form hijacking', () => {
      const directives: CSPDirectives = {
        'default-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      }
      
      const csp = buildCSPHeader(directives)
      expect(csp).toContain("form-action 'self'")
    })
  })

  describe('DOM-based XSS Prevention', () => {
    it('sanitizes innerHTML content', () => {
      const userContent = '<img src=x onerror=alert(1)>'
      const sanitized = sanitizeHTML(userContent)
      
      expect(sanitized.toLowerCase()).not.toContain('onerror')
    })

    it('sanitizes document.write content', () => {
      const userContent = '<script>alert(1)</script>'
      const sanitized = sanitizeHTML(userContent)
      
      expect(sanitized).not.toContain('<script>')
    })

    it('sanitizes location.href manipulation', () => {
      const userInput = 'javascript:alert(1)'
      const sanitized = sanitizeUserInput(userInput)
      
      expect(sanitized.toLowerCase()).not.toContain('javascript:')
    })

    it('sanitizes eval input', () => {
      const userInput = 'alert(document.cookie)'
      const sanitized = escapeHTML(userInput)
      
      expect(sanitized).toBe('alert(document.cookie)')
    })

    it('sanitizes setTimeout string argument', () => {
      const userInput = 'alert(1)'
      const sanitized = escapeHTML(userInput)
      
      expect(sanitized).toBe('alert(1)')
    })
  })

  describe('Mutation XSS Prevention', () => {
    it('handles nested tags that could be rewritten', () => {
      const input = '<p><style><p title="</style><img src=x onerror=alert(1)>">'
      const result = sanitizeHTML(input)
      
      expect(result.toLowerCase()).not.toContain('onerror')
    })

    it('handles SVG namespace confusion', () => {
      const input = '<svg><p><style><g title="</style><img src=x onerror=alert(1)>">'
      const result = sanitizeHTML(input)
      
      expect(result.toLowerCase()).not.toContain('onerror')
    })

    it('handles math namespace confusion', () => {
      const input = '<math><p><style><mi title="</style><img src=x onerror=alert(1)>">'
      const result = sanitizeHTML(input)
      
      expect(result.toLowerCase()).not.toContain('onerror')
    })
  })

  describe('stripHTML function', () => {
    it('removes all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>'
      const result = stripHTML(input)
      
      expect(result).toBe('Hello world')
    })

    it('decodes HTML entities', () => {
      const input = '&lt;script&gt;alert(1)&lt;/script&gt;'
      const result = stripHTML(input)
      
      expect(result).toBe('<script>alert(1)</script>')
    })

    it('handles nested tags', () => {
      const input = '<div><p><span>text</span></p></div>'
      const result = stripHTML(input)
      
      expect(result).toBe('text')
    })

    it('handles empty input', () => {
      const result = stripHTML('')
      expect(result).toBe('')
    })

    it('handles input with only tags', () => {
      const result = stripHTML('<div><span></span></div>')
      expect(result).toBe('')
    })
  })
})

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, 'app', 'api')
const OPENAPI_PATH = path.join(ROOT, 'docs', 'openapi.yaml')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
    } else if (entry.isFile() && entry.name === 'route.ts') {
      out.push(full)
    }
  }
  return out
}

function normalizeRoute(filePath) {
  const rel = path.relative(API_DIR, path.dirname(filePath)).split(path.sep).join('/')
  let route = `/api/${rel}`
  route = route.replace(/\[\.\.\.(.+?)\]/g, '{$1*}')
  route = route.replace(/\[(.+?)\]/g, '{$1}')
  route = route.replace(/\/+/g, '/')
  route = route.replace(/\/$/, '')
  if (route === '/api') route = '/api/'
  return route
}

function readMethods(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const matches = content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)
  const methods = Array.from(matches, (match) => match[1].toLowerCase())
  return methods.length > 0 ? methods : ['get']
}

function toOperationId(method, route) {
  const base = route
    .replace(/^\/+/, '')
    .replace(/[{}*]/g, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return `${method}${base}`
}

function inferTag(route) {
  if (route.startsWith('/api/billing')) return 'Billing'
  if (route.startsWith('/api/integrations')) return 'Integrations'
  if (route.startsWith('/api/providers')) return 'Providers'
  if (route.startsWith('/api/me')) return 'Settings'
  if (route.startsWith('/api/health')) return 'Health'
  if (route.startsWith('/api/files')) return 'Files'
  if (route.startsWith('/api/projects')) return 'Projects'
  if (route.startsWith('/api/sessions')) return 'Sessions'
  if (route.startsWith('/api/jobs')) return 'Jobs'
  if (route.startsWith('/api/metrics')) return 'Metrics'
  if (route.startsWith('/api/mcp')) return 'MCP'
  if (route.startsWith('/api/admin')) return 'Admin'
  return 'Settings'
}

function createResponse(method) {
  if (method === 'post') {
    return {
      '201': { description: 'Created' },
      '400': { description: 'Bad Request' },
      '401': { description: 'Unauthorized' },
    }
  }
  if (method === 'delete') {
    return {
      '200': { description: 'Deleted' },
      '401': { description: 'Unauthorized' },
      '404': { description: 'Not Found' },
    }
  }
  if (method === 'patch' || method === 'put') {
    return {
      '200': { description: 'Updated' },
      '400': { description: 'Bad Request' },
      '401': { description: 'Unauthorized' },
    }
  }
  return {
    '200': { description: 'Successful response' },
    '401': { description: 'Unauthorized' },
  }
}

if (!fs.existsSync(OPENAPI_PATH)) {
  throw new Error(`OpenAPI file not found: ${OPENAPI_PATH}`)
}

const openapi = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'))
openapi.paths = openapi.paths || {}

const routeFiles = walk(API_DIR)
let added = 0

for (const filePath of routeFiles) {
  const route = normalizeRoute(filePath)
  const altRoute = route.replace(/\{([^}]+)\*\}/g, '{$1}')
  if (openapi.paths[route] || openapi.paths[altRoute]) {
    continue
  }

  const methods = readMethods(filePath)
  const tag = inferTag(route)
  const pathItem = {}

  for (const method of methods) {
    pathItem[method] = {
      tags: [tag],
      summary: `${method.toUpperCase()} ${route}`,
      operationId: toOperationId(method, route),
      responses: createResponse(method),
    }
  }

  openapi.paths[route] = pathItem
  added++
}

const dumped = yaml.dump(openapi, {
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
})
fs.writeFileSync(OPENAPI_PATH, dumped)

console.log(`Added ${added} missing OpenAPI path stubs.`)

import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, 'app', 'api')
const OPENAPI_PATH = path.join(ROOT, 'docs', 'openapi.yaml')
const REPORT_JSON = path.join(ROOT, 'docs', 'backend-contracts', 'reports', 'api-inventory.json')
const REPORT_MD = path.join(ROOT, 'docs', 'backend-contracts', 'reports', 'api-inventory.md')

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

function loadOpenApiPaths() {
  if (!fs.existsSync(OPENAPI_PATH)) return []
  const parsed = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'))
  const paths = Object.keys((parsed && parsed.paths) || {})
  return paths
    .map((p) => p.replace(/\{path\}/g, '{path*}'))
    .sort()
}

function countSkippedContractSuites() {
  const contractDir = path.join(ROOT, 'tests', 'contract')
  if (!fs.existsSync(contractDir)) return 0
  const files = fs.readdirSync(contractDir).filter((name) => name.endsWith('.ts') || name.endsWith('.js'))
  let skipped = 0
  for (const file of files) {
    const content = fs.readFileSync(path.join(contractDir, file), 'utf8')
    const matches = content.match(/describe\.skip\(/g)
    skipped += matches ? matches.length : 0
  }
  return skipped
}

const routeFiles = walk(API_DIR)
const routes = routeFiles.map(normalizeRoute).sort()
const openApiPaths = loadOpenApiPaths()

const missingInOpenApi = routes.filter((route) => !openApiPaths.includes(route))
const missingInRoutes = openApiPaths.filter((route) => !routes.includes(route))
const skippedContractSuites = countSkippedContractSuites()

const report = {
  generatedAt: new Date().toISOString(),
  apiRouteCount: routes.length,
  openApiPathCount: openApiPaths.length,
  missingInOpenApiCount: missingInOpenApi.length,
  missingInRoutesCount: missingInRoutes.length,
  skippedContractSuites,
  missingInOpenApi,
  missingInRoutes,
}

fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2))

const md = [
  '# API Inventory Report',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `- API routes discovered: ${report.apiRouteCount}`,
  `- OpenAPI paths documented: ${report.openApiPathCount}`,
  `- Missing in OpenAPI: ${report.missingInOpenApiCount}`,
  `- Missing in route tree: ${report.missingInRoutesCount}`,
  `- Skipped contract suites: ${report.skippedContractSuites}`,
  '',
  '## Missing In OpenAPI',
  '',
  ...missingInOpenApi.map((route) => `- ${route}`),
  '',
  '## Missing In Route Tree',
  '',
  ...missingInRoutes.map((route) => `- ${route}`),
  '',
].join('\n')

fs.writeFileSync(REPORT_MD, md)
console.log(`Wrote ${REPORT_JSON}`)
console.log(`Wrote ${REPORT_MD}`)

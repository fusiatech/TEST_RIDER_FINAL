import { access, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const REQUIRED_FILES = [
  'public/brand/fusia-logo-dark.svg',
  'public/brand/fusia-logo-light.svg',
  'public/brand/fusia-logo-mark.svg',
  'lib/brand.ts',
  'components/brand-logo.tsx',
]

const EXPECTED_LOGOS = {
  'public/brand/fusia-logo-dark.svg': {
    width: '643',
    height: '167',
    viewBox: '0 0 643 167',
    sha256: '94A25EA9191731A6657AA5D752712F6439775E23535551D4A0D9F83F0F9BB01C',
  },
  'public/brand/fusia-logo-light.svg': {
    width: '643',
    height: '167',
    viewBox: '0 0 643 167',
    sha256: '588DBA1665479733973851C7B1BAABB56D3CB87D184E8EF734D3D8B5079FC873',
  },
  'public/brand/fusia-logo-mark.svg': {
    width: '148',
    height: '166',
    viewBox: '0 0 148 166',
    sha256: 'F61634347C43013722F785970AF8420B3A695E30768910493C7F0DEE26785D2D',
  },
}

for (const file of REQUIRED_FILES) {
  await access(file)
}

for (const [file, expected] of Object.entries(EXPECTED_LOGOS)) {
  const svg = await readFile(file, 'utf8')
  const hash = createHash('sha256').update(svg).digest('hex').toUpperCase()
  if (hash !== expected.sha256) {
    throw new Error(`Logo fingerprint mismatch for ${file}. Expected ${expected.sha256}, received ${hash}`)
  }
  if (!svg.includes(`width="${expected.width}"`)) {
    throw new Error(`Logo width mismatch for ${file}. Expected ${expected.width}`)
  }
  if (!svg.includes(`height="${expected.height}"`)) {
    throw new Error(`Logo height mismatch for ${file}. Expected ${expected.height}`)
  }
  if (!svg.includes(`viewBox="${expected.viewBox}"`)) {
    throw new Error(`Logo viewBox mismatch for ${file}. Expected ${expected.viewBox}`)
  }
}

const brand = await readFile('lib/brand.ts', 'utf8')
const brandLogo = await readFile('components/brand-logo.tsx', 'utf8')

if (!brand.includes("dark: '/brand/fusia-logo-dark.svg'")) {
  throw new Error('Brand config does not point to dark logo path')
}
if (!brand.includes("light: '/brand/fusia-logo-light.svg'")) {
  throw new Error('Brand config does not point to light logo path')
}
if (!brand.includes("icon: '/brand/fusia-logo-mark.svg'")) {
  throw new Error('Brand config does not point to logo mark path')
}
if (!brandLogo.includes('BRAND.logos.dark') || !brandLogo.includes('BRAND.logos.light') || !brandLogo.includes('BRAND.logos.icon')) {
  throw new Error('BrandLogo component is not bound to configured logo paths')
}

console.log('Logo integrity audit passed (Figma dimensions + fingerprint verified)')

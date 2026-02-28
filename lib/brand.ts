export const BRAND = {
  productName: 'Fusia AI',
  shortName: 'Fusia',
  description: 'Adaptive multi-agent engineering workspace for planning, building, and validating software.',
  logos: {
    dark: '/brand/fusia-logo-dark.svg',
    light: '/brand/fusia-logo-light.svg',
    icon: '/brand/fusia-logo-mark.svg',
  },
  fallback: {
    mark: 'F',
    label: 'Fusia',
  },
} as const

export type BrandConfig = typeof BRAND

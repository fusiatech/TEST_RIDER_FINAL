'use client'

import Image from 'next/image'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  compact?: boolean
}

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-card/80',
          className
        )}
        aria-label={BRAND.productName}
      >
        <Image
          src={BRAND.logos.icon}
          alt={`${BRAND.productName} icon`}
          className="h-7 w-7 object-contain"
          width={28}
          height={28}
        />
      </div>
    )
  }

  return (
    <div className={cn('inline-flex items-center', className)} aria-label={BRAND.productName}>
      <Image
        src={BRAND.logos.dark}
        alt={BRAND.productName}
        className="h-8 w-auto object-contain dark:hidden"
        width={160}
        height={32}
      />
      <Image
        src={BRAND.logos.light}
        alt={BRAND.productName}
        className="hidden h-8 w-auto object-contain dark:block"
        width={160}
        height={32}
      />
    </div>
  )
}

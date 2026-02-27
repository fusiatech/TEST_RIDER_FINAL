# SwarmUI Design System

This document outlines the design tokens, spacing scale, typography, and component guidelines for SwarmUI.

## Color Tokens

Colors are defined in `app/globals.css` using CSS custom properties within the `@theme` block.

### Core Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-background` | `#ffffff` | `#09090b` | Page background |
| `--color-foreground` | `#09090b` | `#fafafa` | Primary text |
| `--color-card` | `#f4f4f5` | `#18181b` | Card backgrounds |
| `--color-primary` | `#7c3aed` | `#a78bfa` | Primary actions, links, focus rings |
| `--color-secondary` | `#e4e4e7` | `#27272a` | Secondary backgrounds, hover states |
| `--color-muted` | `#a1a1aa` | `#71717a` | Muted text, placeholders |
| `--color-border` | `#d4d4d8` | `#3f3f46` | Borders, dividers |
| `--color-destructive` | `#dc2626` | `#ef4444` | Error states, delete actions |

### Role Colors (Agent Roles)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-role-researcher` | `#60a5fa` | Researcher agent indicators |
| `--color-role-planner` | `#a78bfa` | Planner agent indicators |
| `--color-role-coder` | `#34d399` | Coder agent indicators |
| `--color-role-validator` | `#fbbf24` | Validator agent indicators |
| `--color-role-security` | `#f87171` | Security agent indicators |
| `--color-role-synthesizer` | `#e879f9` | Synthesizer agent indicators |

### Usage in Tailwind

Use the semantic color names in Tailwind classes:

```tsx
// Backgrounds
<div className="bg-background" />
<div className="bg-card" />
<div className="bg-primary" />

// Text
<p className="text-foreground" />
<p className="text-muted-foreground" />
<p className="text-destructive" />

// Borders
<div className="border-border" />
```

## Spacing Scale

SwarmUI uses Tailwind's default spacing scale. Common values:

| Class | Value | Usage |
|-------|-------|-------|
| `p-1`, `m-1` | `0.25rem` (4px) | Tight spacing |
| `p-2`, `m-2` | `0.5rem` (8px) | Small gaps |
| `p-3`, `m-3` | `0.75rem` (12px) | Standard padding |
| `p-4`, `m-4` | `1rem` (16px) | Card padding, section gaps |
| `p-6`, `m-6` | `1.5rem` (24px) | Large section padding |
| `gap-1` | `0.25rem` | Icon-text gaps |
| `gap-2` | `0.5rem` | Button content gaps |
| `gap-3` | `0.75rem` | Form field gaps |
| `gap-4` | `1rem` | Card content gaps |

### Spacing Guidelines

- **Icon + Text**: Use `gap-1.5` to `gap-2`
- **Form fields**: Use `space-y-4` between fields
- **Card padding**: Use `p-4` for content, `p-6` for headers
- **Section margins**: Use `mt-4` to `mt-6` between sections

## Typography Scale

### Font Family

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

### Text Sizes

| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | `0.75rem` (12px) | Badges, helper text, timestamps |
| `text-sm` | `0.875rem` (14px) | Body text, labels |
| `text-base` | `1rem` (16px) | Default body |
| `text-lg` | `1.125rem` (18px) | Subheadings |
| `text-xl` | `1.25rem` (20px) | Section titles |
| `text-2xl` | `1.5rem` (24px) | Page titles |

### Font Weights

| Class | Weight | Usage |
|-------|--------|-------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Labels, emphasis |
| `font-semibold` | 600 | Headings, titles |
| `font-bold` | 700 | Strong emphasis |

### Typography Guidelines

- **Page titles**: `text-xl font-semibold` or `text-2xl font-bold`
- **Section headers**: `text-sm font-medium`
- **Body text**: `text-sm text-foreground`
- **Muted text**: `text-sm text-muted-foreground`
- **Code/monospace**: `font-mono text-xs`

## Border Radius

| Class | Value | Usage |
|-------|-------|-------|
| `rounded-md` | `0.375rem` (6px) | Buttons, inputs |
| `rounded-lg` | `0.5rem` (8px) | Cards, dialogs |
| `rounded-xl` | `0.75rem` (12px) | Large cards |
| `rounded-full` | `9999px` | Avatars, badges, status dots |

## Shadows

| Class | Usage |
|-------|-------|
| `shadow-sm` | Subtle elevation (buttons, inputs) |
| `shadow` | Card elevation |
| `shadow-md` | Dropdown menus, popovers |

## Animations

Defined in `globals.css`:

| Class | Duration | Usage |
|-------|----------|-------|
| `animate-fade-in` | 0.3s | Page/component entry |
| `animate-slide-in` | 0.3s | Modal/dropdown entry |
| `animate-pulse-dot` | 1.5s | Loading indicators |
| `animate-spin-slow` | 2s | Spinner icons |
| `animate-shimmer` | 2s | Skeleton loading |
| `animate-glow-pulse` | 2s | Active state indicators |

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce` media query.

## Component Library

### Layout Components

| Component | File | Usage |
|-----------|------|-------|
| `Card` | `components/ui/card.tsx` | Content containers |
| `Dialog` | `components/ui/dialog.tsx` | Modal dialogs |
| `ScrollArea` | `components/ui/scroll-area.tsx` | Scrollable containers |
| `Collapsible` | `components/ui/collapsible.tsx` | Expandable sections |

### Form Components

| Component | File | Usage |
|-----------|------|-------|
| `Button` | `components/ui/button.tsx` | Actions, CTAs |
| `Input` | `components/ui/input.tsx` | Text input |
| `Textarea` | `components/ui/textarea.tsx` | Multi-line input |
| `Select` | `components/ui/select.tsx` | Dropdown selection |
| `Switch` | `components/ui/switch.tsx` | Toggle boolean |
| `Slider` | `components/ui/slider.tsx` | Range input |
| `FormField` | `components/ui/form-field.tsx` | Form field wrapper with label/error |

### Feedback Components

| Component | File | Usage |
|-----------|------|-------|
| `Badge` | `components/ui/badge.tsx` | Status labels, counts |
| `Skeleton` | `components/ui/skeleton.tsx` | Loading placeholders |
| `EmptyState` | `components/ui/empty-state.tsx` | Empty content states |
| `AlertDialog` | `components/ui/alert-dialog.tsx` | Confirmation dialogs |

### Navigation Components

| Component | File | Usage |
|-----------|------|-------|
| `ContextMenu` | `components/ui/context-menu.tsx` | Right-click menus |

## Component Usage Guidelines

### Button Variants

```tsx
// Primary action
<Button>Save Changes</Button>

// Secondary action
<Button variant="outline">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Ghost (minimal)
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>
```

### EmptyState Component

Use for any empty list, search with no results, or initial state:

```tsx
import { EmptyState } from '@/components/ui/empty-state'
import { Package } from 'lucide-react'

<EmptyState
  icon={<Package />}
  title="No items found"
  description="Try adjusting your search or filters"
  action={{
    label: "Add Item",
    onClick: () => setDialogOpen(true)
  }}
/>
```

### FormField Component

Wrap form inputs for consistent labeling and error display:

```tsx
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

<FormField
  label="Email"
  required
  error={errors.email}
  helpText="We'll never share your email"
>
  <Input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</FormField>
```

### Card Layout

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content here */}
  </CardContent>
</Card>
```

## Icon Guidelines

SwarmUI uses [Lucide React](https://lucide.dev/) icons.

### Icon Sizes

| Context | Size | Class |
|---------|------|-------|
| Inline with text | 16px | `h-4 w-4` |
| Button icons | 16px | `h-4 w-4` |
| Section headers | 20px | `h-5 w-5` |
| Empty states | 24px | `h-6 w-6` (in container) |
| Large features | 48px | `h-12 w-12` |

### Icon Colors

- Match text color: `text-foreground`, `text-muted-foreground`
- Primary accent: `text-primary`
- Semantic: `text-destructive`, `text-green-500`, `text-yellow-500`

## Accessibility

### Focus States

All interactive elements have visible focus rings:

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}
```

### Color Contrast

- Text on background: Minimum 4.5:1 contrast ratio
- Large text: Minimum 3:1 contrast ratio
- Interactive elements: Clear visual distinction

### Reduced Motion

Animations are disabled when `prefers-reduced-motion: reduce` is set.

## Dark Mode

SwarmUI supports light and dark modes via `next-themes`.

- Theme is controlled by `ThemeProvider` in `app/layout.tsx`
- Uses `attribute="class"` strategy
- Dark mode overrides are in `.dark` selector in `globals.css`

### Testing Dark Mode

Toggle between modes using the theme switcher in the UI header.

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
| `--color-muted` | `#71717a` | `#a1a1aa` | Muted text, placeholders (~4.5:1 contrast) |
| `--color-border` | `#d4d4d8` | `#3f3f46` | Borders, dividers |
| `--color-destructive` | `#dc2626` | `#ef4444` | Error states, delete actions |
| `--color-popover` | `#ffffff` | `#18181b` | Popover/dropdown backgrounds |
| `--color-popover-foreground` | `#09090b` | `#fafafa` | Popover text |
| `--color-ring` | `var(--color-primary)` | `var(--color-primary)` | Focus ring color |

### Status Colors

Semantic colors for status indicators and feedback:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | `#22c55e` | Success states, positive feedback |
| `--color-warning` | `#eab308` | Warning states, caution indicators |
| `--color-error` | `#ef4444` | Error states (alias for destructive) |
| `--color-info` | `#3b82f6` | Informational messages |

### Neutral Gray Scale (Zinc)

The zinc scale provides consistent neutral grays:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-zinc-400` | `#a1a1aa` | Light muted text |
| `--color-zinc-500` | `#71717a` | Medium muted text |
| `--color-zinc-700` | `#3f3f46` | Dark borders |
| `--color-zinc-800` | `#27272a` | Dark backgrounds |
| `--color-zinc-900` | `#18181b` | Darker backgrounds |
| `--color-zinc-950` | `#09090b` | Darkest backgrounds |

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

### IDE & Development Components

| Component | File | Usage |
|-----------|------|-------|
| `ProblemsPanel` | `components/problems-panel.tsx` | Displays linter errors/warnings grouped by file |
| `LevelBadge` | `components/kanban-board.tsx` | Ticket hierarchy level indicator (Epic/Story/Task/Subtask) |
| `TicketCardSkeleton` | `components/kanban-board.tsx` | Loading placeholder for ticket cards |
| `InlineError` | `components/testing-dashboard.tsx` | Inline error display with retry button |

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

### ProblemsPanel Component

Display linter errors and warnings grouped by file:

```tsx
import { ProblemsPanel, Problem } from '@/components/problems-panel'

const problems: Problem[] = [
  { file: 'src/app.tsx', line: 10, column: 5, severity: 'error', message: 'Type error', source: 'typescript' },
  { file: 'src/app.tsx', line: 15, column: 1, severity: 'warning', message: 'Unused variable', source: 'eslint' },
]

<ProblemsPanel
  problems={problems}
  onProblemClick={(problem) => navigateToLine(problem.file, problem.line)}
/>
```

Features:
- Groups problems by file with collapsible sections
- Sorts files by error count (most errors first)
- Shows severity icons (error, warning, info)
- Displays line/column location and source

### LevelBadge Component

Display ticket hierarchy levels:

```tsx
import { LevelBadge } from '@/components/kanban-board'

<LevelBadge level="epic" />    // Purple badge
<LevelBadge level="story" />   // Blue badge
<LevelBadge level="task" />    // Green badge
<LevelBadge level="subtask" /> // Gray badge
```

### TicketCardSkeleton Component

Loading placeholder for ticket cards:

```tsx
import { TicketCardSkeleton } from '@/components/kanban-board'

{isLoading && (
  <div className="space-y-2">
    {[...Array(3)].map((_, i) => (
      <TicketCardSkeleton key={i} />
    ))}
  </div>
)}
```

### InlineError Component

Display inline errors with retry functionality:

```tsx
import { InlineError } from '@/components/testing-dashboard'

{error && (
  <InlineError
    error={error}
    onRetry={() => refetchData()}
  />
)}
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

All interactive elements have visible focus rings with enhanced visibility:

```css
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Enhanced focus for interactive elements */
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 25%, transparent);
}
```

### Focus Management Patterns

When building interactive components:

1. **Modal dialogs**: Focus the first focusable element on open, trap focus within, return focus on close
2. **Dropdown menus**: Focus first item on open, support arrow key navigation
3. **Collapsible sections**: Keep focus on trigger after toggle
4. **Dynamic content**: Use `aria-live` for updates that don't receive focus

### aria-live Usage

Use `aria-live` regions to announce dynamic content changes:

```tsx
// Polite announcements (wait for user to finish)
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Assertive announcements (interrupt immediately)
<div aria-live="assertive" role="alert">
  {errorMessage}
</div>

// Status updates
<div role="status" aria-live="polite">
  Loading... {progress}%
</div>
```

Common patterns:
- **Toast notifications**: `aria-live="polite"` with `role="status"`
- **Error messages**: `aria-live="assertive"` with `role="alert"`
- **Progress updates**: `aria-live="polite"` with `aria-atomic="true"`
- **Search results count**: `aria-live="polite"`

### Keyboard Navigation Patterns

| Pattern | Keys | Behavior |
|---------|------|----------|
| **Buttons** | `Enter`, `Space` | Activate |
| **Links** | `Enter` | Navigate |
| **Menus** | `↑↓` | Navigate items |
| **Menus** | `Enter`, `Space` | Select item |
| **Menus** | `Escape` | Close menu |
| **Tabs** | `←→` | Switch tabs |
| **Dialogs** | `Escape` | Close dialog |
| **Dialogs** | `Tab` | Cycle through focusable elements |
| **Trees** | `↑↓` | Navigate siblings |
| **Trees** | `←→` | Collapse/expand or navigate parent/child |

### data-testid Conventions

Use consistent `data-testid` attributes for testing:

```tsx
// Component containers
<div data-testid="problems-panel">
<div data-testid="kanban-board">

// Interactive elements
<button data-testid="retry-button">
<input data-testid="search-input">

// List items with identifiers
<div data-testid={`ticket-${ticket.id}`}>
<div data-testid={`problem-${index}`}>

// States
<div data-testid="loading-skeleton">
<div data-testid="empty-state">
<div data-testid="error-state">
```

Naming conventions:
- Use kebab-case: `problems-panel`, not `problemsPanel`
- Include context: `ticket-card-skeleton`, not just `skeleton`
- Add identifiers for lists: `ticket-${id}`, `file-${path}`

### Color Contrast

- Text on background: Minimum 4.5:1 contrast ratio (WCAG AA)
- Large text (18px+ or 14px bold): Minimum 3:1 contrast ratio
- Interactive elements: Clear visual distinction
- Focus indicators: Minimum 3:1 contrast against adjacent colors

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Responsive Design

### Breakpoints

SwarmUI uses Tailwind's default breakpoints:

| Breakpoint | Min Width | CSS | Usage |
|------------|-----------|-----|-------|
| `sm` | 640px | `@media (min-width: 640px)` | Large phones, small tablets |
| `md` | 768px | `@media (min-width: 768px)` | Tablets |
| `lg` | 1024px | `@media (min-width: 1024px)` | Small laptops |
| `xl` | 1280px | `@media (min-width: 1280px)` | Desktops |
| `2xl` | 1536px | `@media (min-width: 1536px)` | Large desktops |

### Mobile-First Patterns

Write styles mobile-first, then add breakpoint modifiers:

```tsx
// Mobile-first approach
<div className="flex flex-col md:flex-row">
  <aside className="w-full md:w-64 lg:w-80">
    {/* Sidebar */}
  </aside>
  <main className="flex-1 p-4 md:p-6">
    {/* Content */}
  </main>
</div>

// Responsive text
<h1 className="text-xl md:text-2xl lg:text-3xl">
  Title
</h1>

// Responsive spacing
<div className="p-4 md:p-6 lg:p-8">
  {/* Content */}
</div>

// Hide/show at breakpoints
<nav className="hidden md:flex">
  {/* Desktop nav */}
</nav>
<button className="md:hidden">
  {/* Mobile menu button */}
</button>
```

### Touch Target Sizes

Ensure touch targets meet minimum size requirements:

| Element | Minimum Size | Tailwind Classes |
|---------|--------------|------------------|
| Buttons | 44x44px | `min-h-11 min-w-11` or `p-3` |
| Icon buttons | 44x44px | `h-11 w-11` or `p-2.5` with icon |
| Links in lists | 44px height | `py-3` or `min-h-11` |
| Form inputs | 44px height | `h-11` (default in our Input component) |

```tsx
// Icon button with proper touch target
<button className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-secondary">
  <Settings className="h-5 w-5" />
</button>

// List item with proper touch target
<button className="w-full min-h-11 px-4 py-3 text-left hover:bg-secondary">
  {item.label}
</button>
```

### Responsive Patterns

Common responsive patterns used in SwarmUI:

**Sidebar collapse:**
```tsx
<aside className="hidden lg:block w-64">
  {/* Full sidebar */}
</aside>
<aside className="lg:hidden w-16">
  {/* Collapsed sidebar with icons only */}
</aside>
```

**Card grid:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id} />)}
</div>
```

**Stack to row:**
```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <Button>Primary</Button>
  <Button variant="outline">Secondary</Button>
</div>
```

## Dark Mode

SwarmUI supports light and dark modes via `next-themes`.

- Theme is controlled by `ThemeProvider` in `app/layout.tsx`
- Uses `attribute="class"` strategy
- Dark mode overrides are in `.dark` selector in `globals.css`

### Testing Dark Mode

Toggle between modes using the theme switcher in the UI header.

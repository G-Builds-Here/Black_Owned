# Black Owned Design System - Design Tokens

## Overview

This design system is inspired by Black heritage, African aesthetics, and modern professional UI principles. The color palette draws from:

- **Earth tones** - representing the rich African soil and land
- **African textile patterns** - Kente, Bogolanfini (Mud Cloth), and other traditional fabrics
- **Pan-African colors** - red (sacrifice/strength), green (land/prosperity), yellow/gold (wealth), black (people)
- **Modern professional UI** - clean neutrals and accessible contrast ratios

## Color Palette

### Heritage Colors

#### Earth Tones
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.ochre` | #CC7722 | Primary actions, highlights |
| `heritage.terracotta` | #E2725B | Warm accents, CTAs |
| `heritage.sienna` | #A0522D | Borders, dividers |
| `heritage.clay` | #D2691E | Secondary accents |

#### Greens (Land & Growth)
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.forest` | #228B22 | Success states, growth indicators |
| `heritage.olive` | #808000 | Natural accents |
| `heritage.sage` | #9DC88C | Soft backgrounds |
| `heritage.jade` | #00A86B | Primary success, positive actions |

#### Reds (Strength & Ancestry)
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.crimson` | #DC143C | Error states, urgent actions |
| `heritage.burgundy` | #800020 | Deep accents, premium feel |
| `heritage.rust` | #B7410E | Warm highlights |
| `heritage.maroon` | #800000 | Formal, dignified contexts |

#### Yellows (Prosperity & Sun)
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.gold` | #FFD700 | Premium accents, success highlights |
| `heritage.amber` | #FFBF00 | Warning states |
| `heritage.honey` | #F0E68C | Soft backgrounds |
| `heritage.wheat` | #F5DEB3 | Warm neutral backgrounds |

#### Purples (Royalty & Spirituality)
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.royal` | #7851A9 | Info states, premium features |
| `heritage.plum` | #DDA0DD | Soft accents |
| `heritage.lavender` | #B57EDC | Light accents |
| `heritage.violet` | #8A2BE2 | Deep accents |

#### Blacks (Unity & People)
| Token | Hex | Usage |
|-------|-----|-------|
| `heritage.ebony` | #555D50 | Dark UI elements |
| `heritage.charcoal` | #36454F | Dark backgrounds |
| `heritage.midnight` | #191970 | Deep backgrounds |
| `heritage.onyx` | #353839 | Modern dark surfaces |

### Neutral Scale

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral.50` | #FAFAFA | Lightest backgrounds |
| `neutral.100` | #F5F5F5 | Secondary backgrounds |
| `neutral.200` | #E5E5E5 | Borders, dividers |
| `neutral.300` | #D4D4D4 | Disabled states |
| `neutral.400` | #A3A3A3 | Secondary text |
| `neutral.500` | #737373 | Body text |
| `neutral.600` | #525252 | Emphasized text |
| `neutral.700` | #404040 | Headings |
| `neutral.800` | #262626 | Primary text |
| `neutral.900` | #171717 | Darkest surfaces |

### Semantic Colors

| Token | Source | Usage |
|-------|--------|-------|
| `accent.primary` | heritage.ochre | Primary buttons, main CTAs |
| `accent.secondary` | heritage.jade | Secondary actions |
| `accent.tertiary` | heritage.gold | Premium highlights |
| `success` | heritage.jade | Success messages, confirmations |
| `warning` | heritage.amber | Warning states |
| `error` | heritage.crimson | Error messages, destructive actions |
| `info` | heritage.royal | Informational messages |

## Typography

### Font Families

| Family | Fonts | Usage |
|--------|-------|-------|
| Display | Playfair Display, Georgia, serif | Headings, hero text |
| Body | Inter, system-ui, sans-serif | Body text, UI elements |
| Mono | JetBrains Mono, monospace | Code, technical content |

### Type Scale

Based on a major third ratio (1.25) for harmonious proportions.

| Size | Value | Line Height | Usage |
|------|-------|-------------|-------|
| xs | 0.75rem (12px) | 1rem | Captions, fine print |
| sm | 0.875rem (14px) | 1.25rem | Labels, small text |
| base | 1rem (16px) | 1.5rem | Body text |
| lg | 1.125rem (18px) | 1.75rem | Lead paragraphs |
| xl | 1.25rem (20px) | 1.75rem | H4 headings |
| 2xl | 1.5rem (24px) | 2rem | H3 headings |
| 3xl | 1.875rem (30px) | 2.25rem | H2 headings |
| 4xl | 2.25rem (36px) | 2.5rem | H1 headings |
| 5xl | 3rem (48px) | 1 | Hero headings |
| 6xl | 3.75rem (60px) | 1 | Page titles |

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| light | 300 | Large headings, elegant feel |
| regular | 400 | Body text |
| medium | 500 | Emphasized text |
| semibold | 600 | Subheadings |
| bold | 700 | Strong headings |

### Letter Spacing

| Value | Usage |
|-------|-------|
| -0.02em | Large headings (tight) |
| 0em | Body text (normal) |
| 0.02em | Small caps, labels (wide) |

## Spacing System

Based on an 8px base unit grid.

| Token | Value | Description |
|-------|-------|-------------|
| 0 | 0 | No spacing |
| 1 | 0.25rem (2px) | Tight inline |
| 2 | 0.5rem (4px) | Compact |
| 3 | 0.75rem (6px) | Small |
| 4 | 1rem (8px) | Base unit |
| 5 | 1.25rem (10px) | - |
| 6 | 1.5rem (12px) | - |
| 8 | 2rem (16px) | Standard |
| 10 | 2.5rem (20px) | - |
| 12 | 3rem (24px) | - |
| 16 | 4rem (32px) | Large |
| 18 | 4.5rem (72px) | - |
| 20 | 5rem (80px) | - |
| 22 | 5.5rem (88px) | - |
| 24 | 6rem (96px) | - |
| 30 | 7.5rem (120px) | Section spacing |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| none | 0 | Sharp edges |
| sm | 0.25rem (4px) | Subtle rounding |
| md | 0.5rem (8px) | Standard |
| lg | 0.75rem (12px) | Soft |
| xl | 1rem (16px) | Prominent |
| 2xl | 1.5rem (24px) | Very soft |
| 3xl | 2rem (32px) | Pill-like |
| full | 9999px | Pills, circles |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| none | none | Flat |
| sm | 0 1px 2px 0 rgba(0,0,0,0.05) | Subtle elevation |
| soft | 0 2px 15px -3px rgba(0,0,0,0.07)... | Cards, dropdowns |
| medium | 0 4px 20px -2px rgba(0,0,0,0.1)... | Modals, popovers |
| strong | 0 10px 40px -5px rgba(0,0,0,0.15)... | Elevated elements |
| inner | inset 0 2px 4px 0 rgba(0,0,0,0.06) | Inner shadows |

## Transitions

| Token | Duration | Timing | Usage |
|-------|----------|--------|-------|
| fast | 150ms | ease-out | Hover states |
| normal | 250ms | ease-out | Standard interactions |
| slow | 350ms | ease-in-out | Major state changes |

## Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| base | 0 | Default |
| dropdown | 100 | Dropdown menus |
| sticky | 200 | Sticky headers |
| fixed | 300 | Fixed positioning |
| modalBackdrop | 400 | Modal backdrops |
| modal | 500 | Modal dialogs |
| popover | 600 | Popovers |
| tooltip | 700 | Tooltips |
| toast | 800 | Toast notifications |

## Accessibility

All color combinations meet WCAG 2.1 AA standards for text contrast:

- Normal text: 4.5:1 minimum contrast ratio
- Large text (18px+): 3:1 minimum contrast ratio
- UI components: 3:1 minimum contrast ratio

## Usage in Tailwind

```css
@layer utilities {
  .text-heritage-ochre { color: #CC7722; }
  .bg-heritage-jade { background-color: #00A86B; }
  .font-display { font-family: 'Playfair Display', serif; }
  .text-heading { font-size: 2.25rem; line-height: 2.5rem; }
}
```

## Cultural Inspiration

This design system draws inspiration from:

1. **Kente Cloth** - Ghanaian textile with bold geometric patterns and symbolic colors
2. **Bogolanfini (Mud Cloth)** - Malian textile using earth tones and symbolic patterns
3. **Pan-African Flag** - Red (strength/sacrifice), Black (people), Green (land)
4. **Ndebele Art** - South African geometric patterns with vibrant colors
5. **Adinkra Symbols** - Ghanaian visual symbols representing concepts and proverbs

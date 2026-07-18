# Black Owned Frontend

A Next.js 16 frontend redesign celebrating Black ownership and Black American/African history.

## Tech Stack

- **Next.js 16** with App Router
- **Tailwind CSS 4** for styling
- **TypeScript** for type safety
- **React 19**

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Design System

This project uses a custom design system inspired by Black heritage:

- **Colors**: Earth tones, African textile patterns, Pan-African colors
- **Typography**: Modern, readable, professional fonts
- **Components**: Consistent Button, Card, Badge, Input components

See `src/lib/design-tokens/DESIGN-TOKENS.md` for full documentation.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   └── globals.css   # Global styles
├── components/
│   └── ui/           # Reusable UI components
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Input.tsx
│       └── index.ts
└── lib/
    └── design-tokens/
        ├── tokens.json
        └── DESIGN-TOKENS.md
```

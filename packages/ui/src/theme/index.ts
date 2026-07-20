/**
 * Black Owned Design System Theme
 *
 * Color palette inspired by Black heritage and culture:
 * - Rich earth tones representing connection to land and heritage
 * - Gold accents celebrating prosperity and achievement
 * - Deep indigo and burgundy nodding to traditional African textiles
 * - Warm neutrals creating an inviting, professional atmosphere
 */

export const colors = {
  // Primary heritage colors
  primary: {
    50: '#FDF8F6',
    100: '#F9EFE9',
    200: '#F2DED7',
    300: '#E8C4BC',
    400: '#DDA699',
    500: '#C9856D', // Warm terracotta - earth connection
    600: '#B06D54',
    700: '#8F5240',
    800: '#754235',
    900: '#5F362C',
  },

  // Gold accents - prosperity and achievement
  gold: {
    50: '#FFFBF0',
    100: '#FFF5D4',
    200: '#FFE9A3',
    300: '#FFD966',
    400: '#FFC72C',
    500: '#FFB300', // Primary accent - celebratory gold
    600: '#E59F00',
    700: '#BF8500',
    800: '#9A6B00',
    900: '#7D5700',
  },

  // Deep indigo - traditional African textile reference
  indigo: {
    50: '#F0F4F8',
    100: '#D9E2F0',
    200: '#B5C8E0',
    300: '#8BA8CC',
    400: '#5F85B3',
    500: '#3D6299', // Deep indigo - heritage accent
    600: '#2F4D7A',
    700: '#263E63',
    800: '#1F3352',
    900: '#1A2B45',
  },

  // Burgundy - rich, sophisticated accent
  burgundy: {
    50: '#FBF0F2',
    100: '#F7E0E5',
    200: '#F0C4CD',
    300: '#E7A0AE',
    400: '#DD7589',
    500: '#D1526B', // Burgundy accent
    600: '#B54056',
    700: '#913345',
    800: '#752B3A',
    900: '#5F2431',
  },

  // Earth tones - grounding and warmth
  earth: {
    sand: '#E8DCC4',
    clay: '#C4A582',
    sienna: '#A07855',
    charcoal: '#3D3D3D',
  },

  // Neutrals - modern, professional base
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },

  // Functional colors
  success: '#2D7A4F',
  warning: '#D97706',
  error: '#DC2626',
  info: '#2563EB',
};

export const typography = {
  // Modern sans-serif for body - clean, professional
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    // Serif for headings - adds warmth and tradition
    serif: 'Georgia, "Times New Roman", serif',
    // Monospace for code/data
    mono: '"Fira Code", "Courier New", monospace',
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
};

export const borderRadius = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
};

export const patterns = {
  // Subtle geometric patterns inspired by African textile traditions
  // These are CSS-generatable patterns for background accents
  kenteStripes: 'linear-gradient(90deg, transparent 33%, #FFB300 33%, #FFB300 36%, transparent 36%, transparent 66%, #C9856D 66%, #C9856D 69%, transparent 69%)',
  mudclothDots: 'radial-gradient(#C4A582 1px, transparent 1px)',
};

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  patterns,
};

export default theme;

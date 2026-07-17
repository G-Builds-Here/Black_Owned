import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Black Heritage-Inspired Color Palette
        // Inspired by African textiles, earth tones, and Pan-African colors
        'heritage': {
          // Earth tones - representing the land and soil of Africa
          'ochre': '#CC7722',
          'terracotta': '#E2725B',
          'sienna': '#A0522D',
          'clay': '#D2691E',

          // Deep greens - representing the lush landscapes and vegetation
          'forest': '#228B22',
          'olive': '#808000',
          'sage': '#9DC88C',
          'jade': '#00A86B',

          // Rich reds - representing sacrifice, strength, and the blood of ancestors
          'crimson': '#DC143C',
          'burgundy': '#800020',
          'rust': '#B7410E',
          'maroon': '#800000',

          // Golden yellows - representing wealth, prosperity, and the sun
          'gold': '#FFD700',
          'amber': '#FFBF00',
          'honey': '#F0E68C',
          'wheat': '#F5DEB3',

          // Deep purples - representing royalty, spirituality, and dignity
          'royal': '#7851A9',
          'plum': '#DDA0DD',
          'lavender': '#B57EDC',
          'violet': '#8A2BE2',

          // Black and deep tones - representing the people and unity
          'ebony': '#555D50',
          'charcoal': '#36454F',
          'midnight': '#191970',
          'onyx': '#353839',
        },

        // Modern neutral palette for professional UI
        'neutral': {
          '50': '#FAFAFA',
          '100': '#F5F5F5',
          '200': '#E5E5E5',
          '300': '#D4D4D4',
          '400': '#A3A3A3',
          '500': '#737373',
          '600': '#525252',
          '700': '#404040',
          '800': '#262626',
          '900': '#171717',
        },

        // Accent colors for UI elements
        'accent': {
          'primary': '#CC7722',    // Ochre - warm, inviting
          'secondary': '#00A86B',  // Jade - fresh, growth
          'tertiary': '#FFD700',   // Gold - premium, success
        },
      },
      fontFamily: {
        // Typography scale - Modern, readable, professional
        'display': ['Playfair Display', 'serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Custom typography scale based on major third ratio (1.25)
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.01em' }],
        'base': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0em' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '0.005em' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '0.005em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '0.01em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '0.015em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '0.02em' }],
        '5xl': ['3rem', { lineHeight: '1', letterSpacing: '0.02em' }],
        '6xl': ['3.75rem', { lineHeight: '1', letterSpacing: '0.02em' }],
      },
      spacing: {
        // Consistent grid system (8px base unit)
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 20px -2px rgba(0, 0, 0, 0.1), 0 8px 25px -3px rgba(0, 0, 0, 0.08)',
        'strong': '0 10px 40px -5px rgba(0, 0, 0, 0.15), 0 15px 30px -5px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;

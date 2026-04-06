import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          glow: 'rgba(34, 211, 238, 0.4)',
        },
        pink: {
          400: '#f472b6',
          500: '#ec4899',
          glow: 'rgba(244, 114, 182, 0.4)',
        },
        purple: {
          400: '#a78bfa',
          500: '#8b5cf6',
          glow: 'rgba(167, 139, 250, 0.4)',
        },
        dark: {
          900: '#050510',
          800: '#0a0a1a',
          700: '#14142b',
        }
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { backgroundSize: '200% 200%', backgroundPosition: 'left center' },
          '50%': { backgroundSize: '200% 200%', backgroundPosition: 'right center' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'glow': {
          '0%': { filter: 'brightness(1)' },
          '100%': { filter: 'brightness(1.5) drop-shadow(0 0 10px rgba(34,211,238, 0.8))' },
        }
      },
    },
  },
  plugins: [],
};

export default config;

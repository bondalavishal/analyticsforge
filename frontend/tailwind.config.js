/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          fg: 'rgb(var(--color-accent-fg) / <alpha-value>)',
          muted: 'rgb(var(--color-accent-muted) / <alpha-value>)',
        },
        primary: {
          DEFAULT: '#FFA116',
          50: '#FFF8EC',
          100: '#FFEFD0',
          200: '#FFD98F',
          300: '#FFC34E',
          400: '#FFB030',
          500: '#FFA116',
          600: '#E08500',
          700: '#B86900',
          800: '#8F5100',
          900: '#663B00',
        },
        // CSS-variable-backed — values swap between dark/light automatically
        dark: {
          bg:     'rgb(var(--color-bg)     / <alpha-value>)',
          panel:  'rgb(var(--color-panel)  / <alpha-value>)',
          card:   'rgb(var(--color-card)   / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          hover:  'rgb(var(--color-hover)  / <alpha-value>)',
          input:  'rgb(var(--color-input)  / <alpha-value>)',
        },
        success: '#00B8A3',
        error: '#FF375F',
        warning: '#FFC01E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

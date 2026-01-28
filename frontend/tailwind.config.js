/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          50: '#edf8f2',
          100: '#d5f0e1',
          200: '#b1e2c7',
          300: '#82d0a7',
          400: '#4fb984',
          500: '#2f9d66',
          600: '#1f7f50',
          700: '#165e3b',
          800: '#10472d',
          900: '#0b3422',
        },
        ag: {
          bg: 'rgb(var(--ag-bg) / <alpha-value>)',
          surface: 'rgb(var(--ag-surface) / <alpha-value>)',
          primary: 'rgb(var(--ag-primary) / <alpha-value>)',
          primaryHover: 'rgb(var(--ag-primary-hover) / <alpha-value>)',
          accent: 'rgb(var(--ag-accent) / <alpha-value>)',
          accentLight: 'rgb(var(--ag-accent-light) / <alpha-value>)',
          text: 'rgb(var(--ag-text) / <alpha-value>)',
          muted: 'rgb(var(--ag-text-muted) / <alpha-value>)',
          border: 'rgb(var(--border-color) / <alpha-value>)',
        },
        dark: {
          bg: '#0A0D0B',
          card: '#121712',
          border: 'rgba(255, 255, 255, 0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'medium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'large': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow-emerald': '0 0 20px rgba(14, 74, 47, 0.35)',
        'glow-gold': '0 0 20px rgba(183, 154, 62, 0.35)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}




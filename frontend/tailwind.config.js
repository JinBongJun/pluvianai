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
        // PluvianAI Semantic Palette
        pluvian: {
          void: '#020203',       // Deep Void (Background)
          surface: '#09090b',    // Lab Surface (Cards)
          bio: '#10b981',        // Bio-Emerald (Success/Life/Primary)
          clinical: '#06b6d4',   // Clinical Cyan (Tech/Analysis/Secondary)
          predator: '#f59e0b',   // Predator Amber (Warning/Caution)
          triage: '#ef4444',     // Triage Red (Danger/Failure)
          text: '#e2e8f0',       // Slate-200 (Primary Text)
          muted: '#94a3b8',      // Slate-400 (Secondary Text)
          border: 'rgba(255, 255, 255, 0.08)', // High-tech border
        },
        // Legacy/Utility mapping (keeping generic colors available)
        emerald: {
          400: '#34d399',
          500: '#10b981',
          900: '#064e3b',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          900: '#164e63',
        },
        slate: {
          200: '#e2e8f0',
          400: '#94a3b8',
          500: '#64748b',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
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
        'glow-neon': '0 0 20px rgba(57, 255, 20, 0.4)',
        'glow-neon-strong': '0 0 24px rgba(57, 255, 20, 0.5), 0 0 48px rgba(57, 255, 20, 0.2)',
        'glow-electric-blue': '0 0 20px rgba(0, 212, 255, 0.35)',
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




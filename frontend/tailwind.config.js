/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        enterprise: {
          900: '#0f172a', // Slate 900
          800: '#1e293b', // Slate 800
        },
        risk: {
          low: '#00FF88',
          medium: '#FFB800',
          high: '#FF6B35',
          critical: '#FF0000',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      animation: {
        'scan': 'scan 3s linear infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 15px 2px rgba(255, 140, 0, 0.6)' },
          '50%': { opacity: .5, boxShadow: '0 0 5px 1px rgba(255, 140, 0, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}

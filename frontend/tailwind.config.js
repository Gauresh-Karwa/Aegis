/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Avalon', 'sans-serif'],
        mono: ['Avalon', 'sans-serif'],
      },
      colors: {
        brand: {
          navy: '#0f172a',
          blue: '#3b82f6',
          gray: '#64748b',
          slate: '#f5f5f5',
        },
        enterprise: {
          900: '#000000',
          800: '#111111',
          700: '#222222',
        },
        action: {
          orange: '#FF6B35',
          red: '#FF0000',
        },
        verification: {
          green: '#00FF88',
        }
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

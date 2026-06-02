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
        action: {
          orange: '#d97706', // Amber 600 (muted warning)
        },
        verification: {
          green: '#059669', // Emerald 600 (muted success)
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        syne: ['Syne', 'sans-serif'],
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

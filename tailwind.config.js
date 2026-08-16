/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './components/**/*.{js,vue}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue'
  ],
  theme: {
    extend: {
      colors: {
        // Industrial neutrals + safety-orange accent + teal secondary
        ink: {
          50: '#f6f7f8',
          100: '#e9ebee',
          200: '#d3d7dd',
          300: '#aab2bc',
          400: '#7a8592',
          500: '#5b6672',
          600: '#48515c',
          700: '#3b424b',
          800: '#2b3138',
          900: '#1f2429',
          950: '#15181c'
        },
        accent: {
          50: '#fff6ed',
          100: '#ffead4',
          200: '#ffd1a8',
          300: '#ffb070',
          400: '#ff8437',
          500: '#f96311',
          600: '#ea4a07',
          700: '#c23608',
          800: '#9a2c0f',
          900: '#7c2710'
        },
        teal: {
          500: '#0d9488',
          600: '#0f766e'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'JetBrains Mono', 'Consolas', 'monospace']
      },
      borderRadius: {
        panel: '0.375rem'
      }
    }
  },
  plugins: []
}

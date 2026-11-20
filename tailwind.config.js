/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cicada: {
          dark: '#0B0F19',
          card: '#111827',
          surface: '#1F2937',
          border: '#374151',
          accent: '#10B981',
          danger: '#EF4444',
          warning: '#F59E0B',
          info: '#3B82F6',
          muted: '#9CA3AF'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

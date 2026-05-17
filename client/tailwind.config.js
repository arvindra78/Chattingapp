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
        fitness: {
          primary: '#10b981', // emerald-500
          secondary: '#3b82f6', // blue-500
          bg: '#f8fafc', // slate-50
        },
        vault: {
          primary: '#ffffff',
          bg: '#0a0a0a', // matte black
          card: '#1a1a1a',
          accent: '#333333',
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      }
    },
  },
  plugins: [],
}

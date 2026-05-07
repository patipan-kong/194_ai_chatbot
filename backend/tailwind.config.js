/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b1020',
        paper: '#f7f4ee',
        brand: '#0f766e',
        accent: '#c2410c'
      }
    }
  },
  plugins: []
}

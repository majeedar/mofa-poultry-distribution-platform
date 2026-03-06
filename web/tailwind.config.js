/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ghana: {
          red:    '#CE1126',
          gold:   '#FCD116',
          green:  '#006B3F',
          black:  '#000000',
        },
        brand: {
          primary: '#006B3F',
          accent:  '#FCD116',
          dark:    '#004d2c',
        }
      }
    }
  },
  plugins: []
};

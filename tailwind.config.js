/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/frontend/index.html', './src/frontend/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vvl: {
          primary: '#000000',
          secondary: '#d1d1d1',
          accent: '#333333',
          background: '#ffffff',
          muted: '#f5f5f5',
          border: '#cccccc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        heading: ['Inter', 'Arial Black', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

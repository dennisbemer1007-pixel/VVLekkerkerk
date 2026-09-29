/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/frontend/index.html', './src/frontend/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vvl: {
          primary: '#000000',
          secondary: '#e6e6e6',
          accent: '#444444',
          background: '#ffffff',
          muted: '#f3f3f3',
          border: '#d4d4d4',
          // Legacy alias; clubstyle is zwart/wit/grijs
          gold: '#ffffff',
        },
      },
      keyframes: {
        'bell-pulse': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(12deg)' },
          '30%': { transform: 'rotate(-10deg)' },
          '45%': { transform: 'rotate(8deg)' },
          '60%': { transform: 'rotate(-4deg)' },
          '75%': { transform: 'rotate(2deg)' },
        },
      },
      animation: {
        'bell-pulse': 'bell-pulse 1.4s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        heading: ['Inter', 'Arial Black', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

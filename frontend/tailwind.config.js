/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ba: {
          ink: '#0f2744',
          deep: '#081629',
          mist: '#eef4f8',
          surface: '#f7fafc',
          accent: '#0d6e6e',
          warm: '#c45c26',
          line: '#d5e0e8',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

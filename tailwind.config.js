/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#baddff',
          300: '#84c5ff',
          400: '#48a6ff',
          500: '#1a85ff',
          600: '#0062ff',
          700: '#0047cc',
          800: '#003ba6',
          900: '#003380',
        },
        tech: {
          50: '#f2fbfd',
          100: '#e6f7fa',
          200: '#bfeef4',
          300: '#99e5ee',
          400: '#4dd3e3',
          500: '#00c1d8',
          600: '#00aec2',
          700: '#0091a2',
          800: '#007482',
          900: '#005f6a',
        }
      }
    },
  },
  plugins: [],
};
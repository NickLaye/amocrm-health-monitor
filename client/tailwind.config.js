/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          start: '#7B5FE8',
          end: '#9B6BE8',
          accent: '#7C3AED',
          light: '#8B5CF6',
        },
        success: {
          DEFAULT: '#3FA856',
          bg: '#E6F6E8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 18px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 6px 20px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
}

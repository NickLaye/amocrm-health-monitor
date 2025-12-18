/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 18px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 6px 20px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};


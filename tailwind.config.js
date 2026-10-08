/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pokemon: {
          red: '#ff6b6b',
          blue: '#4ecdc4',
          yellow: '#ffe66d',
          darkBlue: '#2c5282',
          lightBlue: '#f0f8ff',
        },
        rpg: {
          red: '#E74C3C',
          blue: '#3498DB',
          yellow: '#F1C40F',
          green: '#2ECC71',
          bgDark: '#2C3E50',
          textDark: '#34495E',
          border: '#34495E',
        },
      },
      fontFamily: {
        pixel: ['"M PLUS Rounded 1c"', 'sans-serif'],
        pixelJp: ['"M PLUS Rounded 1c"', '"Noto Sans JP"', 'sans-serif'],
      },
      boxShadow: {
        'pokemon': '0 4px 15px rgba(255, 107, 107, 0.3)',
        'rpg': '8px 8px 0 rgba(0, 0, 0, 0.5)',
      },
      // 本文コンテナの幅は site-chrome-tokens.css の --page-max-* が正
      maxWidth: {
        page: 'var(--page-max-wide)',
        read: 'var(--page-max-narrow)',
      },
    },
  },
  plugins: [],
};
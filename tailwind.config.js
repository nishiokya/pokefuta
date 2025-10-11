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
          purple: '#9B59B6',
          bgDark: '#2C3E50',
          bgLight: '#ECF0F1',
          bgPaper: '#FFF8DC',
          textDark: '#34495E',
          textGold: '#FFD700',
          border: '#34495E',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'Courier New', 'monospace'],
        pixelJp: ['"DotGothic16"', '"Kosugi Maru"', 'sans-serif'],
      },
      boxShadow: {
        'pokemon': '0 4px 15px rgba(255, 107, 107, 0.3)',
        'pokemon-hover': '0 6px 20px rgba(78, 205, 196, 0.4)',
        'rpg': '8px 8px 0 rgba(0, 0, 0, 0.5)',
        'rpg-sm': '4px 4px 0 rgba(0, 0, 0, 0.5)',
        'rpg-inset': 'inset 0 0 0 2px #ECF0F1, inset 0 0 0 4px #34495E',
      },
      spacing: {
        'rpg-1': '8px',
        'rpg-2': '16px',
        'rpg-3': '24px',
        'rpg-4': '32px',
        'rpg-5': '40px',
        'rpg-6': '48px',
        'rpg-8': '64px',
      },
    },
  },
  plugins: [],
};
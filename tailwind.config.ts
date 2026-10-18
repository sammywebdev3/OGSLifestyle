import type { Config } from 'tailwindcss';

// OGUN STATE LIFESTYLE palette — see src/config/theme.ts for the meaning of each colour.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ogun: { 50: '#e9f7ef', 100: '#c8ecd7', 400: '#2fb36f', 500: '#12935a', 600: '#0e7a4b', 700: '#0b5e3a', 900: '#062f1e' },
        adire: { 300: '#8d9be0', 500: '#3a4fb0', 700: '#1f2f6b', 900: '#111a3d' },
        laterite: { 300: '#f0a17f', 500: '#d4693d', 700: '#a3401d' },
        palm: { 300: '#ffd978', 500: '#f2b632', 700: '#b98207' },
        cream: '#fff6e5',
        ink: '#14151a',
      },
      fontFamily: {
        display: ['"Trebuchet MS"', 'system-ui', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(17, 26, 61, 0.35)',
        pop: '0 6px 0 0 rgba(0,0,0,0.18)',
      },
      backgroundImage: {
        'adire-dots': 'radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 1.5px)',
      },
    },
  },
  plugins: [],
};

export default config;

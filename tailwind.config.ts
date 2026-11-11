import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f6f4f1',
        card: '#ffffff',
        ink: '#1c1a17',
        ink2: '#6b665e',
        ink3: '#a29b90',
        line: '#e8e4dd',
        accent: '#2f5d50',
        accentSoft: '#e3ece8',
        warn: '#b4552f',
      },
      borderRadius: {
        pill: '20px',
        sheet: '22px',
      },
    },
  },
  plugins: [],
}

export default config

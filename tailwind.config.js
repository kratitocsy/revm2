/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./src/**/*.{html,js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        bg: '#08080c',
        s1: '#0e0e14',
        s2: '#14141e',
        s3: '#1a1a28',
        s4: '#22223a',

        border: 'rgba(255,255,255,0.06)',
        border2: 'rgba(255,255,255,0.12)',
        border3: 'rgba(255,255,255,0.20)',

        violet: { DEFAULT: '#8b5cf6', bright: '#a78bfa' },
        cyan: { DEFAULT: '#06b6d4', bright: '#22d3ee' },

        white: '#f0f0f5',
        text: '#c8c8d4',
        muted: '#6b6b80',
        dim: '#3a3a50',

        // Wynko brand (Sep 2026) — warm black + cream, orange for special keys only.
        // Mirrors src/styles/colors.css.
        'wk-black': {
          950: '#0B0B0D', 900: '#0F0F11', 850: '#111113', 800: '#161618',
          700: '#1C1C1F', 600: '#26262A', 500: '#3A3A3A', 400: '#55524D',
        },
        'wk-ink': {
          50: '#FFF7E6', 100: '#F5EFE3', 150: '#F5EFE3', 200: '#E8E2D6', 250: '#D6D0C4',
          300: '#CFC8BB', 400: '#9C968C', 450: '#8F8A82', 500: '#7A756D', 600: '#5A5650', 700: '#4A4742',
        },
        'wk-orange': { 300: '#FFA94D', 500: '#FF8A3D', 600: '#E9772E', 800: '#B43E16' },
        'wk-butter': { 300: '#FFE59A' },
        'wk-cream': { 50: '#FFF7E6', DEFAULT: '#FFF7E6' },

        danger: '#f87171',
        success: '#4ade80',
        warn: '#fbbf24',
      },
      // sp-1..sp-16 (4/8/12/16/20/24/32/40/48/64px) already line up 1:1 with
      // Tailwind's default spacing scale (1,2,3,4,5,6,8,10,12,16) — no
      // override needed there. Radii don't line up, so they're extended:
      backgroundImage: {
        'grad-brand-primary': 'linear-gradient(90deg,#FF8A3D 0%,#FFF7E6 100%)',
        'grad-secondary': 'linear-gradient(90deg,#A855F7 0%,#06B6D4 100%)',
        'grad-accent': 'linear-gradient(90deg,#FF7A3D 0%,#FFD56B 100%)',
        'grad-surface': 'linear-gradient(135deg,#0B0D0F 0%,#1A1F26 100%)',
        'grad-text': 'linear-gradient(90deg,#A855F7 0%,#06B6D4 100%)',
        'grad-success': 'linear-gradient(90deg,#10B981 0%,#34D399 100%)',
        'grad-warning': 'linear-gradient(90deg,#F97316 0%,#FBBF24 100%)',
        'grad-info': 'linear-gradient(90deg,#3B82F6 0%,#06B6D4 100%)',
        'grad-purple': 'linear-gradient(90deg,#8B5CF6 0%,#EC4899 100%)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      fontFamily: {
        // Sora for everything (brand board). Poppins stays as a fallback for
        // pages that don't load Sora yet.
        sans: ['Sora', 'Poppins', 'system-ui', 'sans-serif'],
        mono: ['Sora', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

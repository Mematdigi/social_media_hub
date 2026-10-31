/** @type {import('tailwindcss').Config} */
const defaultColors = require('tailwindcss/colors');

// Design-token driven scales. Values live as RGB channels in
// src/assets/scss/_theme.scss so every utility (incl. /opacity variants)
// resolves to the same palette.
const tokenScale = (name) =>
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].reduce((acc, step) => {
    acc[step] = `rgb(var(--${name}-${step}) / <alpha-value>)`;
    return acc;
  }, {});

module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      colors: {
        // Neutral "ink" scale replaces Tailwind slate everywhere
        slate: tokenScale('ink'),
        ink: tokenScale('ink'),
        // Brand scale replaces Tailwind indigo everywhere
        indigo: tokenScale('brand'),
        brand: tokenScale('brand'),
        // Refined semantic families
        green: defaultColors.emerald,
        yellow: defaultColors.amber,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Platform colors
        facebook: "#1877F2",
        twitter: "#1DA1F2",
        instagram: "#E4405F",
        linkedin: "#0A66C2",
        tiktok: "#000000",
        youtube: "#FF0000",
        pinterest: "#E60023",
        snapchat: "#FFFC00",
        reddit: "#FF4500",
        tumblr: "#36465D",
        telegram: "#0088CC",
        whatsapp: "#25D366",
        discord: "#5865F2",
        twitch: "#9146FF",
        medium: "#000000",
        quora: "#B92B27",
        vk: "#4C75A3",
        weibo: "#E6162D",
        threads: "#000000",
        mastodon: "#6364FF",
        bluesky: "#0085FF",
        behance: "#1769FF",
        dribbble: "#EA4C89",
        github: "#181717",
        producthunt: "#DA552F",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'button': 'var(--shadow-button)',
        'pop': 'var(--shadow-pop)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

/** @type {import('tailwindcss').Config} */
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
        'card': '0 2px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 30px rgba(99,102,241,0.15)',
        'button': '0 4px 14px 0 rgba(99,102,241,0.39)',
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

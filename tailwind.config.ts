import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Premium brand custom color tokens
        brand: {
          primary: '#3B82F6',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          sidebar: '#0F172A',
          bgLight: '#F8FAFC'
        }
      },
    },
  },
  plugins: [],
};
export default config;

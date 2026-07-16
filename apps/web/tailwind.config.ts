import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#e9ebef",
          200: "#d6dae1",
          300: "#b5bcc9",
          400: "#8d98a9",
          500: "#6f7b8e",
          600: "#596477",
          700: "#485161",
          800: "#3e4551",
          900: "#363b45",
          950: "#202329",
        },
        memory: {
          50: "#fff9ed",
          100: "#fff0cc",
          200: "#ffdc85",
          300: "#ffc347",
          400: "#f5a623",
          500: "#dc8310",
          600: "#b85f0a",
          700: "#93440d",
          800: "#793612",
          900: "#662e14",
          950: "#361406",
        },
        present: {
          50: "#effbff",
          100: "#dcf5fd",
          200: "#b9ebfb",
          300: "#84dcf7",
          400: "#48c4ee",
          500: "#20a8da",
          600: "#1289ba",
          700: "#126e96",
          800: "#145b7b",
          900: "#164c67",
          950: "#082f43",
        },
        future: {
          50: "#faf6ff",
          100: "#f2e9fe",
          200: "#e8d6fe",
          300: "#d7b5fc",
          400: "#bd87f8",
          500: "#a35af0",
          600: "#8c38db",
          700: "#7629b7",
          800: "#632596",
          900: "#522078",
          950: "#34104f",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
        display: [
          '"Iowan Old Style"',
          '"Noto Serif SC"',
          '"Songti SC"',
          "serif",
        ],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 22px 60px -34px rgb(59 66 81 / 0.28)",
        float: "0 24px 70px -30px rgb(38 45 60 / 0.42)",
      },
      backgroundImage: {
        "soft-grid":
          "linear-gradient(to right, rgb(117 127 150 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(117 127 150 / 0.07) 1px, transparent 1px)",
      },
      keyframes: {
        "soft-enter": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.72" },
          "50%": { transform: "scale(1.045)", opacity: "1" },
        },
      },
      animation: {
        "soft-enter": "soft-enter 420ms ease-out both",
        breathe: "breathe 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          '"Songti SC"',
          '"Noto Serif SC"',
          '"Iowan Old Style"',
          "serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;

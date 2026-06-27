import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "sans-serif"]
      },
      colors: {
        ink: "#0f172a",
        muted: "#5b6470",
        line: "#e5e7eb",
        accent: "#0a7b63"
      }
    }
  },
  plugins: []
};

export default config;

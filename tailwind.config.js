/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        truelens: {
          50: "#f0f7ff",
          100: "#e0eeff",
          200: "#bbddff",
          300: "#80c0ff",
          400: "#4098ff",
          500: "#0a78ff",
          600: "#0058e0",
          700: "#0044b0",
          800: "#003a8c",
          900: "#003066",
        },
      },
    },
  },
  plugins: [],
};

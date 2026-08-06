// PostCSS pipeline: Tailwind compiles the utility classes, autoprefixer adds
// vendor prefixes. Consumed by Vite automatically.

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

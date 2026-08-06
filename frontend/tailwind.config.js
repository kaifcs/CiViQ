/** @type {import('tailwindcss').Config} */
// Tailwind configuration.
//
// The theme is deliberately unextended: colours are written as literal hex
// values at each call site (and centralised for shared cases in
// components/uiStyles.js and the gis/*Styles modules) rather than as theme
// tokens. Dark mode is class-driven so DashboardLayout can toggle it.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
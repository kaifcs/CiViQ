import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite build configuration.
//
// Deliberately minimal: chunking is left to Vite's defaults, which already
// split the Leaflet-dependent map routes into their own bundle because those
// routes are the only lazy imports. Adding manual chunk rules here would
// fragment the output without a measured benefit.
export default defineConfig({
  plugins: [react()],
})

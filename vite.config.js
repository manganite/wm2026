import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project page is served at /<repo>/ — keep this in sync with
  // src/config.js's RESULTS_RAW_URL (same repo, same branch).
  base: '/wm2026/',
})

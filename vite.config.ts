import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/libraryofbabel/',
  plugins: [react()],
  test: {
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
})

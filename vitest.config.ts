import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'server', environment: 'node', include: ['**/*.{test,spec}.ts'] } },
      { extends: true, test: { name: 'browser', environment: 'jsdom', include: ['**/*.{test,spec}.tsx'] } },
    ],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

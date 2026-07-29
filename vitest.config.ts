import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@cboard-communication-core': path.resolve(
        __dirname,
        '../cboard/src/common/communicationSupport'
      )
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts']
  }
})

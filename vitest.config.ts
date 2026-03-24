import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['temptests/**/*.test.{ts,tsx}'],
  },
});

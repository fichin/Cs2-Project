import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Tests must never reach the real PandaScore API.
    env: { PANDASCORE_TOKEN: '' },
  },
});

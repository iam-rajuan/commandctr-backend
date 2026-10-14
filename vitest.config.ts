import path from 'node:path';

import { defineConfig } from 'vitest/config';
import 'dotenv/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node'
  }
});

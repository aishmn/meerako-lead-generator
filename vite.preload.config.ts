import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@lib': path.resolve(__dirname, 'src/lib')
    }
  }
});

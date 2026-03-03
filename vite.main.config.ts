import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@lib': path.resolve(__dirname, 'src/lib')
    }
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3']
    }
  }
});

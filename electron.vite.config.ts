import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: '.vite/build',
      rollupOptions: {
        external: ['better-sqlite3']
      }
    },
    resolve: {
      alias: {
        '@main': path.resolve(__dirname, 'src/main'),
        '@lib': path.resolve(__dirname, 'src/lib')
      }
    }
  },
  preload: {
    build: {
      outDir: '.vite/build'
    },
    resolve: {
      alias: {
        '@lib': path.resolve(__dirname, 'src/lib')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        '@lib': path.resolve(__dirname, 'src/lib')
      }
    },
    plugins: [react()]
  }
});

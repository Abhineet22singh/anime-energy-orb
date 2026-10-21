import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    https: false,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
  assetsInclude: ['**/*.task'],
});

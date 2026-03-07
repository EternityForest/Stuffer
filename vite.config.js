import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'copy-manifest',
      apply: 'build',
      enforce: 'post',
      generateBundle() {
        // Copy manifest.json to dist folder after build
        const source = resolve(__dirname, 'public/manifest.json');
        const dest = resolve(__dirname, 'dist/manifest.json');
        mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
        copyFileSync(source, dest);
      },
    },
  ],
  base: './',
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
  },
  server: {
    port: 5173,
    https: true,
  },
  optimizeDeps: {
    include: ['peerjs'],
  },
});

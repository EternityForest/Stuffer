import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  root: 'src',
  build: {
    outDir: '../dist',
  },
  server: {
    port: 5173,
    https: true,
  },
});

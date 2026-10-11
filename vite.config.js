import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ONNX Runtime's wasm binaries are fetched at runtime by URL, so they must be
// served as static assets rather than bundled. Mirror them into public/ort so
// both the dev server and the production build ship them locally (offline).
const ORT_WASM_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

function copyOrtWasm() {
  const sourceDir = resolve(__dirname, 'node_modules/onnxruntime-web/dist');
  const destDir = resolve(__dirname, 'public/ort');
  mkdirSync(destDir, { recursive: true });
  for (const file of ORT_WASM_FILES) {
    const source = resolve(sourceDir, file);
    if (existsSync(source)) {
      copyFileSync(source, resolve(destDir, file));
    }
  }
}

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'copy-ort-wasm',
      buildStart() {
        copyOrtWasm();
      },
      configureServer() {
        copyOrtWasm();
      },
    },
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
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
  },
  // The OCR worker lazily imports its (large) dependencies, which forces a
  // code-split worker bundle; es output is required for that and matches the
  // module workers the app already creates.
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    https: true,
  },
  optimizeDeps: {
    include: ['yjs', 'lib0'],
    // Loaded lazily inside the OCR worker; letting Vite pre-bundle it can
    // rewrite its runtime wasm lookups.
    exclude: ['onnxruntime-web'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    alias: {
      events: 'events',
      buffer: 'buffer/',
      // Use the wasm-only ONNX Runtime build (no WebGPU/JSEP): our session is
      // pinned to the wasm execution provider, so this drops ~24MB of unused
      // binaries and keeps the OCR models self-hosted.
      'onnxruntime-web': resolve(
        __dirname,
        'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'
      ),
    },
  },
  define: {
    global: 'globalThis',
  },
});

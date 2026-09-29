// Сборка демо-версии: интерфейс + сервер платформы, работающий в браузере
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const shim = (f) => fileURLToPath(new URL(`./shims/${f}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  define: { __dirname: JSON.stringify('/app/server') },
  resolve: {
    alias: [
      { find: /^node:sqlite$/, replacement: shim('sqlite.js') },
      { find: /^fs$/, replacement: shim('fs.js') },
      { find: /^path$/, replacement: shim('path.js') },
      { find: /^crypto$/, replacement: shim('crypto.js') },
      { find: /^express$/, replacement: shim('express.js') },
      { find: /^multer$/, replacement: shim('multer.js') },
      { find: /^(cookie-parser|nodemailer|child_process)$/, replacement: shim('empty.js') },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('../release/demo', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 300000, // шрифты встраиваются в CSS
    chunkSizeWarningLimit: 4000,
  },
});

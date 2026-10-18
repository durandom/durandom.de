import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { renderLinks } from './src/links.ts';

export default defineConfig({
  build: {
    outDir: 'build',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        impressum: resolve(import.meta.dirname, 'impressum/index.html'),
      },
    },
  },
  plugins: [
    {
      name: 'static-links',
      // Bake the link list into the HTML so it works with JS off.
      transformIndexHtml: (html) => html.replace('<!--links-->', renderLinks()),
    },
  ],
});

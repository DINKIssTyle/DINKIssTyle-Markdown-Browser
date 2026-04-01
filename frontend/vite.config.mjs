import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '#minpath': path.resolve(__dirname, 'node_modules/vfile/lib/minpath.browser.js'),
      '#minproc': path.resolve(__dirname, 'node_modules/vfile/lib/minproc.browser.js'),
      '#minurl': path.resolve(__dirname, 'node_modules/vfile/lib/minurl.browser.js'),
    },
  },
});

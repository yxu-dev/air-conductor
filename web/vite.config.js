import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// Keep the font's redistribution notice with standalone frontend builds.
const fontLicense = {
  name: 'inter-license',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'assets/inter-license.txt',
      source: readFileSync(new URL('./node_modules/@fontsource-variable/inter/LICENSE', import.meta.url), 'utf8') });
  },
};

export default defineConfig({
  plugins: [tailwindcss(), fontLicense],
});

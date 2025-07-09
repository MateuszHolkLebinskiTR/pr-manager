import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icon-16.png', dest: '.' },
        { src: 'public/icon-48.png', dest: '.' },
        { src: 'public/icon-128.png', dest: '.' }
      ]
    })
  ]
});

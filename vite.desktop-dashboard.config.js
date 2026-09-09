// Builds src/apps/desktop-dashboard into home-app-dist/home-app.js +
// home-app.css — fixed filenames, not hashed, because home.html
// already references them directly:
//   <link rel="stylesheet" href="home-app-dist/home-app.css">
//   <script type="module" src="home-app-dist/home-app.js"></script>
// (see commit a89c9c2). This config replaces the previously
// sourceless home-app-dist bundle with a real, version-controlled
// source — home-app-dist/ itself stays generated output, not
// something to hand-edit.
//
// Unlike vite.mobile-home.config.js, there's no HTML entry template
// here and so no `root` override needed: the entry is main.tsx
// directly, and JS/TS import resolution (e.g. the image import in
// DesktopDashboard.tsx) is always relative to the importing file
// regardless of Vite's root, so the asset-resolution trap that hit
// the mobile-home config doesn't apply to this shape of build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'home-app-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/apps/desktop-dashboard/main.tsx'),
      output: {
        entryFileNames: 'home-app.js',
        chunkFileNames: 'home-app-[name].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name && assetInfo.name.endsWith('.css')
            ? 'home-app.css'
            : 'home-app-assets/[name][extname]',
      },
    },
  },
});

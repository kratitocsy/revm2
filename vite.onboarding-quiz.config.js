// Same pattern as vite.mobile-home.config.js — see that file's header
// comment for why `root` is set explicitly and why this is a static,
// no-server build. Run `npm run build:css` first.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/apps/onboarding-quiz'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/apps/onboarding-quiz/onboarding-quiz.html'),
      output: {
        entryFileNames: 'assets/onboarding-quiz-[hash].js',
        chunkFileNames: 'assets/onboarding-quiz-[hash].js',
        assetFileNames: 'assets/onboarding-quiz-[hash][extname]',
      },
    },
  },
});

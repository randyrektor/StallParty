import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/** Dev server for user tests. Does not open a browser window. */
export default mergeConfig(
  base,
  defineConfig({
    server: {
      port: 4173,
      strictPort: true,
      host: '127.0.0.1',
      open: false,
    },
  })
);

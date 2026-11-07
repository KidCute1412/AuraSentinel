import { defineConfig } from 'tsup';

// Dual build: the NestJS server is CommonJS, the Vite web app is ESM.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});

import { defineConfig } from 'vitest/config';
// The isolated native Medusa project has its own runner and dependency tree.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });

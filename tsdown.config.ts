import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts'],
    external: [],
    noExternal: [],
    platform: 'node',
    format: ['esm', 'cjs'],
    skipNodeModulesBundle: true,
    target: 'esnext',
    clean: true,
    minify: false,
    dts: true,
    sourcemap: true,
    treeshake: true,
    outDir: './dist',
    tsconfig: 'tsconfig.json',
    nodeProtocol: true
});
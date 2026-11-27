import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    rules: 'src/rules.ts',
    'locale-file': 'src/locale-file.ts',
  },
  format: 'esm',
  // jsonc-parser's `main` is a UMD build that requires its own files at run
  // time, which a bundle cannot satisfy; its ESM build bundles cleanly.
  alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' },
  dts: true,
  clean: true,
})

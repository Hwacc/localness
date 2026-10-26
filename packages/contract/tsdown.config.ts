import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    rules: 'src/rules.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
})

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    ignores: ['prisma/client/**/*'],
    rules: {
      'no-console': 'off',
      semi: ['error', 'never'],
      'semi-style': ['error', 'first'],
      'semi-spacing': ['error', { before: false, after: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'vue/html-self-closing': 'off',
      'import/first': 'off',
    },
  }
)

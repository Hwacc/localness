// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    rules: {
      'no-console': 'off',
      'semi': ['error', 'never'],
      'semi-style': ['error', 'first'],
      'semi-spacing': ['error', { 'before': false, 'after': true }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
)

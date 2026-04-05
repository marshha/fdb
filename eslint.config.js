import js from '@eslint/js'
import sveltePlugin from 'eslint-plugin-svelte'

export default [
  js.configs.recommended,
  ...sveltePlugin.configs['flat/recommended'],
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/', 'public/', 'coverage/'],
  },
]

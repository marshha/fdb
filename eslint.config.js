import js from '@eslint/js'
import sveltePlugin from 'eslint-plugin-svelte'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...sveltePlugin.configs['flat/recommended'],
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.js', 'src/**/*.svelte'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['cli/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: ['node_modules/', 'public/', 'coverage/'],
  },
]

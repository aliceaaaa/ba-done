const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const checkFile = require('eslint-plugin-check-file');

const KEBAB = '+([a-z0-9])*(-+([a-z0-9]))';
const EXPO_ROUTE_FILE = `@(_layout|${KEBAB}|\\+${KEBAB}|\\[${KEBAB}\\]|\\[...${KEBAB}\\])`;
const EXPO_ROUTE_FOLDER = `@(${KEBAB}|\\(${KEBAB}\\)|\\[${KEBAB}\\]|\\[...${KEBAB}\\])`;
const NAMING_MESSAGE = '"{{ target }}": file and folder names must be kebab-case (see AGENTS.md)';

module.exports = defineConfig([
  expoConfig,
  prettierRecommended,
  {
    ignores: ['node_modules/*', 'dist/*', 'ios/*', 'android/*', '.expo/*', 'expo-env.d.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/app/**'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*': KEBAB },
        { ignoreMiddleExtensions: true, errorMessage: NAMING_MESSAGE },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': KEBAB },
        { ignoreWords: ['__tests__'], errorMessage: NAMING_MESSAGE },
      ],
    },
  },
  {
    files: ['src/app/**/*.{js,jsx,ts,tsx}'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*': EXPO_ROUTE_FILE },
        { ignoreMiddleExtensions: true, errorMessage: NAMING_MESSAGE },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': EXPO_ROUTE_FOLDER },
        { ignoreWords: ['__tests__'], errorMessage: NAMING_MESSAGE },
      ],
    },
  },
]);

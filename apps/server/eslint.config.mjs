import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// Boundary rules: docs/architecture/codebase.md §2.4
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/modules/*/domain/**', mode: 'full' },
        { type: 'core', pattern: 'src/core/**', mode: 'full' },
        { type: 'module', pattern: 'src/modules/*', mode: 'folder', capture: ['name'] },
        { type: 'app', pattern: 'src/*.ts', mode: 'full' },
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off', // breaks Nest DI metadata
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'domain', allow: ['domain', 'core'] },
            { from: 'core', allow: ['core'] },
            { from: 'module', allow: ['core', 'domain', ['module', { name: '${from.name}' }]] },
            { from: 'app', allow: ['core', 'module'] },
          ],
        },
      ],
      // Invariant 4: money is bigint/string, never float
      'no-restricted-globals': ['error', { name: 'parseFloat', message: 'No floats for money; use bigint.' }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: 'No floats for money; use bigint.' },
      ],
      // domain/ is pure TypeScript
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@nestjs/*', 'viem', 'viem/*', 'drizzle-orm', 'drizzle-orm/*', 'ioredis', 'bullmq'] },
      ],
    },
  },
);

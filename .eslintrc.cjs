// ESLint configuration for TJR Suite monorepo
// Enforces code quality and consistency across all packages
// Individual packages can extend this with package-specific rules

module.exports = {
  // Specify the root config to prevent ESLint from searching parent directories
  root: true,

  // Parser: Use TypeScript parser for type-aware linting
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Note: Per-package tsconfig.json paths would go here for type-aware rules
    // Example: project: './tsconfig.json'
  },

  // Plugins: TypeScript-specific linting rules
  plugins: ['@typescript-eslint'],

  // Extends: Base configurations (order matters - later configs override earlier)
  extends: [
    'eslint:recommended',                   // ESLint's recommended rules
    'plugin:@typescript-eslint/recommended', // TypeScript recommended rules
    'prettier',                             // Disables ESLint rules that conflict with Prettier
  ],

  // Environment: Define global variables available in the code
  env: {
    node: true,   // Node.js global variables and scoping
    es2022: true, // ES2022 global variables
  },

  // Rules: Custom rule overrides
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',        // Allow unused args prefixed with _
        varsIgnorePattern: '^_',        // Allow unused vars prefixed with _
        caughtErrorsIgnorePattern: '^_', // Allow unused errors prefixed with _
      },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off', // Allow inferred return types
    '@typescript-eslint/explicit-module-boundary-types': 'off', // Allow inferred boundary types
    '@typescript-eslint/no-explicit-any': 'warn', // Warn on 'any' usage (not error)

    // General code quality rules
    'no-console': ['warn', { allow: ['warn', 'error'] }], // Warn on console.log, allow warn/error
    'prefer-const': 'error',   // Require const for variables that are never reassigned
    'no-var': 'error',         // Disallow var (use let/const)
  },

  // Ignore patterns: Don't lint these directories
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.config.js',  // Allow config files to use plain JS
    '*.config.cjs',
  ],
};
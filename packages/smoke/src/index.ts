/**
 * Smoke test package for TJR Suite monorepo
 *
 * This package exists solely to validate the toolchain:
 * - TypeScript compilation with project references
 * - ESLint type-aware linting
 * - Test execution via Node.js built-in test runner
 * - CI build and test pipeline
 *
 * It contains a trivial function to ensure the build pipeline works end-to-end.
 */

/**
 * Adds two numbers together.
 *
 * This is an intentionally simple function to validate:
 * - TypeScript compilation works
 * - Type checking is enforced (strict mode)
 * - Tests can import and run against built code
 *
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 *
 * @example
 * ```typescript
 * const result = add(2, 3);
 * console.log(result); // 5
 * ```
 */
export function add(a: number, b: number): number {
  // Validate inputs are actual numbers (strict mode catches most issues at compile time)
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('Both arguments must be numbers');
  }

  // Check for NaN (TypeScript allows NaN as a number type)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new TypeError('Arguments cannot be NaN');
  }

  return a + b;
}

/**
 * Greets a person by name.
 *
 * Another trivial function to validate string handling and strict null checks.
 *
 * @param name - Name of person to greet
 * @returns Greeting string
 *
 * @example
 * ```typescript
 * const greeting = greet('Alice');
 * console.log(greeting); // "Hello, Alice!"
 * ```
 */
export function greet(name: string): string {
  // TypeScript strict mode ensures 'name' cannot be null/undefined here
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('Name must be a non-empty string');
  }

  return `Hello, ${name}!`;
}
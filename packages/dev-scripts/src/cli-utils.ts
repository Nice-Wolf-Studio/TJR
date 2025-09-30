/**
 * Shared CLI utilities for @tjr-suite/dev-scripts
 *
 * This module provides common functionality used across all dev-scripts CLIs:
 * - Argument parsing with flag validation
 * - Consistent help text formatting
 * - Unified JSON/pretty output logic
 * - Standard result object structure
 *
 * Design Philosophy:
 * - All CLIs output JSON by default (machine-readable)
 * - --pretty flag enables human-readable colored output
 * - Mutating operations default to --dry-run mode
 * - Consistent exit codes: 0 = success, 1 = partial failure, 2 = error
 */

/**
 * Parsed command-line arguments
 */
export interface ParsedArgs {
  help: boolean;           // --help: Show help text
  execute: boolean;        // --execute: Actually perform mutating operation (vs dry-run)
  dryRun: boolean;         // --dry-run: Preview what would happen (default for mutating ops)
  pretty: boolean;         // --pretty: Human-readable formatted output
  fixture?: string;        // --fixture=path: Path to fixture file (for replay-run)
  remaining: string[];     // Positional arguments (non-flag args)
}

/**
 * Standard result object structure returned by all CLIs
 */
export interface CliResult {
  success: boolean;        // Overall operation success status
  command: string;         // Name of the command that ran
  timestamp: string;       // ISO 8601 timestamp of execution
  dryRun?: boolean;        // Whether this was a dry-run (omitted for read-only ops)
  data: unknown;           // Command-specific data (diff, cache stats, etc.)
  warnings?: string[];     // Non-fatal warnings
  errors?: string[];       // Fatal errors
}

/**
 * Parse command-line arguments from process.argv
 *
 * Supports flags:
 * - --help, -h: Show help text
 * - --execute: Perform mutating operation (vs dry-run)
 * - --dry-run: Preview mode (default for mutating operations)
 * - --pretty: Human-readable output with colors
 * - --fixture=path: Path to fixture file
 *
 * @param argv - Array of command-line arguments (typically process.argv.slice(2))
 * @param defaultDryRun - Whether dry-run should be default (true for mutating ops)
 * @returns Parsed arguments object
 *
 * @example
 * // Parse args with dry-run default
 * const args = parseArgs(process.argv.slice(2), true);
 * if (args.help) {
 *   printHelp('cache-warm', 'Preload cache layers');
 *   process.exit(0);
 * }
 */
export function parseArgs(argv: string[], defaultDryRun: boolean = false): ParsedArgs {
  const args: ParsedArgs = {
    help: false,
    execute: false,
    dryRun: defaultDryRun,
    pretty: false,
    remaining: [],
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--execute') {
      args.execute = true;
      args.dryRun = false;  // Execute mode disables dry-run
    } else if (arg === '--dry-run') {
      args.dryRun = true;
      args.execute = false;  // Dry-run mode disables execute
    } else if (arg === '--pretty') {
      args.pretty = true;
    } else if (arg.startsWith('--fixture=')) {
      args.fixture = arg.slice('--fixture='.length);
    } else if (arg.startsWith('--')) {
      // Unknown flag - could add error handling here
      args.remaining.push(arg);
    } else {
      // Positional argument
      args.remaining.push(arg);
    }
  }

  return args;
}

/**
 * Print standardized help text to stdout
 *
 * @param commandName - Name of the command (e.g., 'cache-warm')
 * @param description - Brief description of what the command does
 * @param additionalHelp - Optional additional help text (e.g., required flags)
 *
 * @example
 * printHelp('replay-run', 'Re-run historical bars through parsers',
 *   'Required: --fixture=path.json');
 */
export function printHelp(
  commandName: string,
  description: string,
  additionalHelp?: string
): void {
  console.log(`
${commandName} - ${description}

USAGE:
  ${commandName} [options]

OPTIONS:
  --help, -h        Show this help message
  --pretty          Human-readable formatted output (default: JSON)
  --execute         Actually perform the operation (for mutating commands)
  --dry-run         Preview what would happen (default for mutating commands)
  --fixture=path    Path to fixture file (required for replay-run)

OUTPUT:
  By default, outputs machine-readable JSON to stdout.
  Use --pretty for human-readable colored output.

EXIT CODES:
  0  Success (or no differences found)
  1  Partial failure or differences found
  2  Fatal error or invalid usage

${additionalHelp ? `\n${additionalHelp}\n` : ''}
For more information, see docs/adr/ADR-0054-dev-scripts.md
`);
}

/**
 * Output result to stdout in JSON or pretty format
 *
 * JSON mode: Single-line JSON for machine parsing
 * Pretty mode: Multi-line formatted output with colors and emojis
 *
 * @param result - Standard result object to output
 * @param pretty - Whether to use pretty formatting
 *
 * @example
 * const result = createResult('cache-warm', true, { keysWarmed: 42 });
 * outputResult(result, args.pretty);
 */
export function outputResult(result: CliResult, pretty: boolean): void {
  if (pretty) {
    // Human-readable formatted output
    console.log('\n' + '='.repeat(60));
    console.log(`Command: ${result.command}`);
    console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Timestamp: ${result.timestamp}`);

    if (result.dryRun !== undefined) {
      console.log(`Mode: ${result.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
    }

    console.log('='.repeat(60));
    console.log('\nData:');
    console.log(JSON.stringify(result.data, null, 2));

    if (result.warnings && result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log('');
  } else {
    // Machine-readable JSON output (single line)
    console.log(JSON.stringify(result));
  }
}

/**
 * Create a standard result object
 *
 * All CLIs should use this to ensure consistent result structure.
 *
 * @param command - Name of the command
 * @param success - Whether the operation succeeded
 * @param data - Command-specific data
 * @param options - Optional warnings, errors, dryRun flag
 * @returns Standard result object
 *
 * @example
 * const result = createResult('cache-verify', true, {
 *   healthy: true,
 *   totalKeys: 1000,
 *   staleKeys: 0
 * }, { warnings: ['High memory usage detected'] });
 */
export function createResult(
  command: string,
  success: boolean,
  data: unknown,
  options: {
    warnings?: string[];
    errors?: string[];
    dryRun?: boolean;
  } = {}
): CliResult {
  return {
    success,
    command,
    timestamp: new Date().toISOString(),
    dryRun: options.dryRun,
    data,
    warnings: options.warnings,
    errors: options.errors,
  };
}
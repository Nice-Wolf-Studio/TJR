#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Executes all integration and validation tests with reporting
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

class TestRunner {
    constructor() {
        this.testSuites = [
            {
                name: 'Integration Tests',
                paths: [
                    'tests/integration/discord-commands.test.js',
                    'tests/integration/data-pipeline.test.js',
                    'tests/integration/analysis-engine.test.js',
                    'tests/integration/alert-system.test.js',
                    'tests/integration/webhook-integration.test.js'
                ],
                timeout: 300000 // 5 minutes
            },
            {
                name: 'Performance Tests',
                paths: [
                    'tests/performance/load-testing.test.js'
                ],
                timeout: 600000 // 10 minutes
            },
            {
                name: 'Error Handling Tests',
                paths: [
                    'tests/error-handling/error-scenarios.test.js'
                ],
                timeout: 180000 // 3 minutes
            },
            {
                name: 'Security Tests',
                paths: [
                    'tests/security/security-validation.test.js'
                ],
                timeout: 240000 // 4 minutes
            },
            {
                name: 'System Validation Tests',
                paths: [
                    'tests/system/system-validation.test.js'
                ],
                timeout: 300000 // 5 minutes
            }
        ];

        this.results = {
            totalSuites: this.testSuites.length,
            passedSuites: 0,
            failedSuites: 0,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            startTime: null,
            endTime: null,
            suiteResults: []
        };
    }

    /**
     * Run all test suites
     */
    async runAllTests(options = {}) {
        console.log(chalk.blue.bold('\n🧪 Trading Bot - Comprehensive Integration Testing\n'));
        console.log(chalk.gray('=' .repeat(60)));

        this.results.startTime = new Date();

        try {
            // Setup test environment
            await this.setupTestEnvironment();

            // Run each test suite
            for (const suite of this.testSuites) {
                if (options.suites && !options.suites.includes(suite.name.toLowerCase())) {
                    continue;
                }

                await this.runTestSuite(suite, options);
            }

            // Generate final report
            await this.generateReport(options);

        } catch (error) {
            console.error(chalk.red.bold('\n❌ Test execution failed:'), error.message);
            process.exit(1);
        } finally {
            this.results.endTime = new Date();
            await this.cleanup();
        }
    }

    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        console.log(chalk.yellow('⚙️  Setting up test environment...'));

        // Set test environment variables
        process.env.NODE_ENV = 'test';
        process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

        // Create test directories if they don't exist
        const testDirs = ['coverage', 'test-results'];

        for (const dir of testDirs) {
            const dirPath = path.join(process.cwd(), dir);
            try {
                await fs.access(dirPath);
            } catch {
                await fs.mkdir(dirPath, { recursive: true });
            }
        }

        console.log(chalk.green('✓ Test environment ready\n'));
    }

    /**
     * Run a specific test suite
     */
    async runTestSuite(suite, options = {}) {
        console.log(chalk.cyan.bold(`\n📋 Running ${suite.name}...`));
        console.log(chalk.gray('-'.repeat(40)));

        const suiteResult = {
            name: suite.name,
            startTime: new Date(),
            endTime: null,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            success: false,
            output: '',
            errors: []
        };

        try {
            const result = await this.executeJestTests(suite, options);

            suiteResult.passed = result.numPassedTests || 0;
            suiteResult.failed = result.numFailedTests || 0;
            suiteResult.skipped = result.numSkippedTests || 0;
            suiteResult.success = result.success;
            suiteResult.output = result.output;

            if (!result.success) {
                suiteResult.errors = result.errors || [];
                this.results.failedSuites++;
                console.log(chalk.red(`❌ ${suite.name} FAILED`));

                if (result.errors && result.errors.length > 0) {
                    console.log(chalk.red('\nErrors:'));
                    result.errors.forEach(error => {
                        console.log(chalk.red(`  • ${error}`));
                    });
                }
            } else {
                this.results.passedSuites++;
                console.log(chalk.green(`✅ ${suite.name} PASSED`));
            }

            // Update totals
            this.results.totalTests += suiteResult.passed + suiteResult.failed + suiteResult.skipped;
            this.results.passedTests += suiteResult.passed;
            this.results.failedTests += suiteResult.failed;
            this.results.skippedTests += suiteResult.skipped;

        } catch (error) {
            suiteResult.success = false;
            suiteResult.errors.push(error.message);
            this.results.failedSuites++;

            console.log(chalk.red(`❌ ${suite.name} FAILED: ${error.message}`));
        } finally {
            suiteResult.endTime = new Date();
            suiteResult.duration = suiteResult.endTime - suiteResult.startTime;
            this.results.suiteResults.push(suiteResult);

            const duration = (suiteResult.duration / 1000).toFixed(2);
            console.log(chalk.gray(`   Duration: ${duration}s`));
        }
    }

    /**
     * Execute Jest tests for a suite
     */
    async executeJestTests(suite, options = {}) {
        return new Promise((resolve, reject) => {
            const jestArgs = [
                '--testTimeout', suite.timeout.toString(),
                '--detectOpenHandles',
                '--forceExit',
                '--maxWorkers=2'
            ];

            if (options.verbose) {
                jestArgs.push('--verbose');
            }

            if (options.coverage) {
                jestArgs.push('--coverage');
            }

            // Add test files
            jestArgs.push(...suite.paths);

            const jest = spawn('npx', ['jest', ...jestArgs], {
                stdio: 'pipe',
                env: { ...process.env }
            });

            let output = '';
            let errorOutput = '';

            jest.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;

                if (options.verbose) {
                    console.log(text);
                }
            });

            jest.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;

                if (options.verbose) {
                    console.error(text);
                }
            });

            jest.on('close', (code) => {
                const result = {
                    success: code === 0,
                    output: output,
                    errorOutput: errorOutput,
                    exitCode: code
                };

                // Parse Jest output for test counts
                try {
                    result.numPassedTests = this.extractTestCount(output, 'passed');
                    result.numFailedTests = this.extractTestCount(output, 'failed');
                    result.numSkippedTests = this.extractTestCount(output, 'skipped');

                    if (result.numFailedTests > 0) {
                        result.errors = this.extractErrors(output);
                    }
                } catch (parseError) {
                    console.warn('Failed to parse Jest output:', parseError.message);
                }

                resolve(result);
            });

            jest.on('error', (error) => {
                reject(new Error(`Failed to execute Jest: ${error.message}`));
            });

            // Kill process if it hangs
            setTimeout(() => {
                jest.kill('SIGTERM');
                reject(new Error(`Test suite timed out after ${suite.timeout}ms`));
            }, suite.timeout + 10000);
        });
    }

    /**
     * Extract test counts from Jest output
     */
    extractTestCount(output, type) {
        const regex = new RegExp(`(\\d+) ${type}`, 'i');
        const match = output.match(regex);
        return match ? parseInt(match[1]) : 0;
    }

    /**
     * Extract error messages from Jest output
     */
    extractErrors(output) {
        const errors = [];
        const lines = output.split('\n');

        let inError = false;
        let currentError = '';

        for (const line of lines) {
            if (line.includes('FAIL ')) {
                if (currentError) {
                    errors.push(currentError.trim());
                }
                currentError = line;
                inError = true;
            } else if (inError && line.trim().startsWith('●')) {
                if (currentError) {
                    errors.push(currentError.trim());
                }
                currentError = line;
            } else if (inError && line.trim()) {
                currentError += '\n' + line;
            } else if (inError && !line.trim()) {
                if (currentError) {
                    errors.push(currentError.trim());
                    currentError = '';
                    inError = false;
                }
            }
        }

        if (currentError) {
            errors.push(currentError.trim());
        }

        return errors;
    }

    /**
     * Generate test report
     */
    async generateReport(options = {}) {
        console.log(chalk.blue.bold('\n📊 Generating Test Report...'));

        const duration = (this.results.endTime - this.results.startTime) / 1000;
        const successRate = (this.results.passedTests / Math.max(this.results.totalTests, 1)) * 100;

        // Console report
        console.log(chalk.gray('=' .repeat(60)));
        console.log(chalk.blue.bold('TEST EXECUTION SUMMARY'));
        console.log(chalk.gray('=' .repeat(60)));

        console.log(chalk.white(`Total Duration: ${duration.toFixed(2)}s`));
        console.log(chalk.white(`Test Suites:    ${this.results.passedSuites}/${this.results.totalSuites} passed`));
        console.log(chalk.white(`Tests:          ${this.results.passedTests} passed, ${this.results.failedTests} failed, ${this.results.skippedTests} skipped`));
        console.log(chalk.white(`Success Rate:   ${successRate.toFixed(2)}%`));

        // Individual suite results
        console.log(chalk.gray('\nSUITE RESULTS:'));

        for (const suite of this.results.suiteResults) {
            const status = suite.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
            const duration = (suite.duration / 1000).toFixed(2);

            console.log(`${status} ${suite.name} (${duration}s)`);
            console.log(chalk.gray(`     Tests: ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped`));

            if (suite.errors.length > 0) {
                console.log(chalk.red(`     Errors: ${suite.errors.length}`));
            }
        }

        // Generate JSON report
        if (options.jsonReport) {
            await this.generateJSONReport();
        }

        // Generate HTML report if requested
        if (options.htmlReport) {
            await this.generateHTMLReport();
        }

        // Final status
        console.log(chalk.gray('=' .repeat(60)));

        if (this.results.failedSuites === 0) {
            console.log(chalk.green.bold('🎉 ALL TESTS PASSED!'));
            console.log(chalk.green('System is ready for production deployment.'));
        } else {
            console.log(chalk.red.bold('❌ SOME TESTS FAILED!'));
            console.log(chalk.yellow('Please review failed tests before deployment.'));
        }

        console.log(chalk.gray('=' .repeat(60)));
    }

    /**
     * Generate JSON test report
     */
    async generateJSONReport() {
        const reportPath = path.join(process.cwd(), 'test-results', 'test-report.json');

        const jsonReport = {
            summary: {
                totalDuration: this.results.endTime - this.results.startTime,
                totalSuites: this.results.totalSuites,
                passedSuites: this.results.passedSuites,
                failedSuites: this.results.failedSuites,
                totalTests: this.results.totalTests,
                passedTests: this.results.passedTests,
                failedTests: this.results.failedTests,
                skippedTests: this.results.skippedTests,
                successRate: (this.results.passedTests / Math.max(this.results.totalTests, 1)) * 100,
                startTime: this.results.startTime.toISOString(),
                endTime: this.results.endTime.toISOString()
            },
            suites: this.results.suiteResults.map(suite => ({
                name: suite.name,
                success: suite.success,
                duration: suite.duration,
                passed: suite.passed,
                failed: suite.failed,
                skipped: suite.skipped,
                startTime: suite.startTime.toISOString(),
                endTime: suite.endTime.toISOString(),
                errors: suite.errors
            })),
            timestamp: new Date().toISOString()
        };

        await fs.writeFile(reportPath, JSON.stringify(jsonReport, null, 2));
        console.log(chalk.gray(`📄 JSON report saved to: ${reportPath}`));
    }

    /**
     * Generate HTML test report
     */
    async generateHTMLReport() {
        const reportPath = path.join(process.cwd(), 'test-results', 'test-report.html');

        const html = this.generateHTMLContent();
        await fs.writeFile(reportPath, html);

        console.log(chalk.gray(`🌐 HTML report saved to: ${reportPath}`));
    }

    /**
     * Generate HTML report content
     */
    generateHTMLContent() {
        const successRate = (this.results.passedTests / Math.max(this.results.totalTests, 1)) * 100;
        const duration = (this.results.endTime - this.results.startTime) / 1000;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trading Bot - Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007acc; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007acc; }
        .metric-label { color: #666; margin-top: 5px; }
        .suite { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; }
        .suite-header { padding: 15px; background: #f8f9fa; border-bottom: 1px solid #ddd; }
        .suite-content { padding: 15px; }
        .success { color: #28a745; }
        .failure { color: #dc3545; }
        .errors { background: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 4px; margin-top: 10px; }
        .timestamp { text-align: center; color: #666; margin-top: 30px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Trading Bot - Comprehensive Test Report</h1>
            <p>Integration Testing and System Validation Results</p>
        </div>

        <div class="summary">
            <div class="metric">
                <div class="metric-value ${successRate >= 95 ? 'success' : 'failure'}">${successRate.toFixed(1)}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric">
                <div class="metric-value">${this.results.totalTests}</div>
                <div class="metric-label">Total Tests</div>
            </div>
            <div class="metric">
                <div class="metric-value">${this.results.passedSuites}/${this.results.totalSuites}</div>
                <div class="metric-label">Suites Passed</div>
            </div>
            <div class="metric">
                <div class="metric-value">${duration.toFixed(2)}s</div>
                <div class="metric-label">Total Duration</div>
            </div>
        </div>

        <h2>Test Suite Results</h2>
        ${this.results.suiteResults.map(suite => `
            <div class="suite">
                <div class="suite-header">
                    <h3 style="margin: 0; display: inline-block;">${suite.name}</h3>
                    <span class="${suite.success ? 'success' : 'failure'}" style="float: right; font-weight: bold;">
                        ${suite.success ? '✅ PASSED' : '❌ FAILED'}
                    </span>
                </div>
                <div class="suite-content">
                    <p><strong>Duration:</strong> ${(suite.duration / 1000).toFixed(2)}s</p>
                    <p><strong>Tests:</strong> ${suite.passed} passed, ${suite.failed} failed, ${suite.skipped} skipped</p>
                    ${suite.errors.length > 0 ? `
                        <div class="errors">
                            <h4>Errors:</h4>
                            ${suite.errors.map(error => `<pre>${error}</pre>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('')}

        <div class="timestamp">
            Report generated on ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Cleanup test environment
     */
    async cleanup() {
        // Reset environment variables
        delete process.env.NODE_ENV;
        delete process.env.LOG_LEVEL;

        console.log(chalk.gray('\n🧹 Cleanup completed'));
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        coverage: args.includes('--coverage'),
        jsonReport: args.includes('--json'),
        htmlReport: args.includes('--html') || args.includes('--report'),
        suites: args.find(arg => arg.startsWith('--suites='))?.split('=')[1]?.split(',')
    };

    const runner = new TestRunner();

    runner.runAllTests(options).then(() => {
        const exitCode = runner.results.failedSuites > 0 ? 1 : 0;
        process.exit(exitCode);
    }).catch((error) => {
        console.error(chalk.red.bold('Test runner failed:'), error);
        process.exit(1);
    });
}

module.exports = TestRunner;
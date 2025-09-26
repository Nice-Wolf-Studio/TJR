/**
 * Global Jest Setup
 * Runs once before all tests
 */

module.exports = async () => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.SUPPRESS_WARNINGS = 'true';

    // Any global setup logic can go here
    console.log('🧪 Starting Trading Bot Analysis Engine Tests...');

    // Initialize any test databases or external services if needed
    // For now, we'll just set up environment
};
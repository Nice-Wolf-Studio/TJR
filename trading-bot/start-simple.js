/**
 * Simple Trading Bot Starter - Discord Only
 */

require('dotenv').config();
const logger = require('./src/utils/logger');
const SimpleDatabaseConnection = require('./src/database/simple-connection');

async function startSimpleBot() {
    try {
        console.log('🚀 Starting TJR Trading Bot (Simple Mode)...\n');

        // Test database
        console.log('1️⃣ Testing database connection...');
        const db = new SimpleDatabaseConnection();
        await db.initialize();
        console.log('✅ Database connected successfully');
        await db.shutdown();

        // Start Discord bot
        console.log('\n2️⃣ Starting Discord bot...');
        const DiscordBot = require('./src/bot');
        const bot = new DiscordBot();
        await bot.start();

        console.log('\n🎉 TJR Trading Bot is running!');
        console.log('Bot commands available:');
        console.log('• /ping - Test bot connectivity');
        console.log('• /help - Show help information');
        console.log('• /bias - Get market bias analysis');
        console.log('• /levels - Get support/resistance levels');

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down bot...');
    process.exit(0);
});

startSimpleBot();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with trading bot commands'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🤖 TJR Trading Bot - Commands')
            .setDescription('Professional trading analysis and market insights')
            .addFields(
                {
                    name: '📊 Analysis Commands',
                    value: '`/bias` - Get daily market bias\n`/levels` - Key support/resistance levels\n`/setup` - Find trading opportunities\n`/flow` - Order flow analysis',
                    inline: false
                },
                {
                    name: '⚙️ Utility Commands',
                    value: '`/ping` - Check bot status\n`/help` - Show this help',
                    inline: false
                },
                {
                    name: '🎯 Example Usage',
                    value: '• `/bias pair:EURUSD` - Get EUR/USD bias\n• `/levels pair:GBPUSD` - Get GBP/USD levels\n• `/setup timeframe:15m` - Find 15m setups',
                    inline: false
                }
            )
            .setFooter({
                text: 'TJR Trading Bot - Professional Market Analysis',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
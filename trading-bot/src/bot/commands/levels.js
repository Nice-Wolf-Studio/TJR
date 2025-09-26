const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Get key support and resistance levels')
        .addStringOption(option =>
            option.setName('pair')
                .setDescription('Currency pair to analyze')
                .setRequired(true)
                .addChoices(
                    { name: 'EUR/USD', value: 'EURUSD' },
                    { name: 'GBP/USD', value: 'GBPUSD' },
                    { name: 'USD/JPY', value: 'USDJPY' },
                    { name: 'AUD/USD', value: 'AUDUSD' },
                    { name: 'XAU/USD', value: 'XAUUSD' }
                )),

    async execute(interaction) {
        const pair = interaction.options.getString('pair');

        // Mock levels data
        const levelsData = {
            support: [
                { level: '1.0880', strength: 'Strong', note: 'Order Block' },
                { level: '1.0860', strength: 'Medium', note: 'Previous Low' },
                { level: '1.0840', strength: 'Weak', note: 'Psychological' }
            ],
            resistance: [
                { level: '1.0920', strength: 'Strong', note: "Yesterday's High" },
                { level: '1.0945', strength: 'Very Strong', note: 'Equal Highs' },
                { level: '1.0970', strength: 'Medium', note: 'Weekly High' }
            ],
            session: 'London',
            currentPrice: '1.0885'
        };

        const embed = new EmbedBuilder()
            .setColor('#ffa500')
            .setTitle(`📊 KEY LEVELS - ${pair}`)
            .setDescription(`💹 Current Price: **${levelsData.currentPrice}** | Session: **${levelsData.session}**`)
            .addFields(
                {
                    name: '🔴 RESISTANCE LEVELS',
                    value: levelsData.resistance.map(r =>
                        `**${r.level}** (${r.strength}) - ${r.note}`
                    ).join('\n'),
                    inline: false
                },
                {
                    name: '🟢 SUPPORT LEVELS',
                    value: levelsData.support.map(s =>
                        `**${s.level}** (${s.strength}) - ${s.note}`
                    ).join('\n'),
                    inline: false
                },
                {
                    name: '🎯 TRADING ZONES',
                    value: '• **Buy Zone:** 1.0875 - 1.0885\n• **Sell Zone:** 1.0915 - 1.0925\n• **Breakout:** Above 1.0945',
                    inline: false
                }
            )
            .setFooter({ text: 'TJR Trading Bot - Level Analysis' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
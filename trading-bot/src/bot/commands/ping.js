const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and health status'),

    async execute(interaction) {
        const start = Date.now();

        // Defer reply for timing calculation
        await interaction.deferReply();

        const end = Date.now();
        const messageLatency = end - start;
        const wsLatency = interaction.client.ws.ping;

        // Determine status color
        let color = '#00ff00'; // Green
        if (wsLatency > 200) color = '#ffcc00'; // Yellow
        if (wsLatency > 500) color = '#ff0000'; // Red

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '📡 API Latency', value: `${messageLatency}ms`, inline: true },
                { name: '💓 WebSocket Latency', value: `${wsLatency}ms`, inline: true },
                { name: '📊 Status', value: wsLatency < 200 ? '✅ Excellent' : wsLatency < 500 ? '⚠️ Good' : '❌ Poor', inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
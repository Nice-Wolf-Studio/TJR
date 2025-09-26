import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and health status'),
  async execute(interaction: ChatInputCommandInteraction) {
    const start = Date.now();
    await interaction.deferReply({ ephemeral: true });
    const end = Date.now();

    const messageLatency = end - start;
    const wsLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(wsLatency < 200 ? '#00ff00' : wsLatency < 500 ? '#ffcc00' : '#ff0000')
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 API Latency', value: `${messageLatency}ms`, inline: true },
        { name: '💓 WebSocket Latency', value: `${Math.round(wsLatency)}ms`, inline: true },
        {
          name: '📊 Status',
          value:
            wsLatency < 200 ? '✅ Excellent' : wsLatency < 500 ? '⚠️ Good' : '❌ Poor',
          inline: true
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

export default command;
module.exports = command;

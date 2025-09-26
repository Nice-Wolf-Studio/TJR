import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Overview of the TJR trading bot commands'),
  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor('#0ea5e9')
      .setTitle('🤖 TJR Trading Bot')
      .setDescription('Daily plan tooling for index futures (ES, EQ, NQ).')
      .addFields(
        {
          name: '📈 Market Snapshot',
          value: '`/bias symbol:ES` – Daily bias + structure\n`/profile symbol:ES` – Day profile & targets\n`/levels symbol:ES` – Asia/London session extremes'
        },
        {
          name: '⚙️ Utilities',
          value: '`/ping` – Bot health check\n`/help` – This panel'
        },
        {
          name: '🕘 Snapshot Time',
          value: 'All analytics use the 09:29 ET pre-market snapshot per the Daily Bias & Day Profile design.'
        }
      )
      .setFooter({
        text: 'TJR Trading Bot – deterministic daily plan tooling',
        iconURL: interaction.client.user?.displayAvatarURL() ?? undefined
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

export default command;
module.exports = command;

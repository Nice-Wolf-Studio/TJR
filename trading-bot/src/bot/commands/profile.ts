import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import moment from 'moment-timezone';
import { generateDailyPlan } from '../../analysis/dailyPlan';
import logger from '../../utils/logger';

const TZ = 'America/New_York';

function resolveSnapshotTimestamp(): Date {
  const now = moment().tz(TZ);
  return now.clone().hour(9).minute(29).second(0).millisecond(0).toDate();
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return value.toFixed(decimals);
}

const command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show the day profile classification for an index futures symbol')
    .addStringOption((option) =>
      option
        .setName('symbol')
        .setDescription('Ticker symbol (e.g. ES, NQ, EQ)')
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const symbol = interaction.options.getString('symbol', true).toUpperCase();
    await interaction.deferReply();

    try {
      const plan = await generateDailyPlan({ symbol, asOf: resolveSnapshotTimestamp() });
      const embed = new EmbedBuilder()
        .setTitle(`Day Profile – ${plan.profile.symbol}`)
        .setColor(0x6366f1)
        .setFooter({
          text: `Bias: ${plan.bias.bias.toUpperCase()} • computed ${moment(plan.profile.asOf).tz(TZ).format('MMM D, YYYY HH:mm')} ET`
        })
        .addFields({
          name: 'Profile',
          value: `Classification: **${plan.profile.profile}**\nPrimary Target: ${plan.profile.targets.primary}\nSecondary Target: ${plan.profile.targets.secondary}`
        })
        .addFields({
          name: 'Sessions',
          value: `Asia ${plan.profile.sessionMap.asia.window}: H ${formatNumber(plan.profile.sessionMap.asia.high)} / L ${formatNumber(plan.profile.sessionMap.asia.low)}\nLondon ${plan.profile.sessionMap.london.window}: H ${formatNumber(plan.profile.sessionMap.london.high)} / L ${formatNumber(plan.profile.sessionMap.london.low)}`
        })
        .addFields({ name: 'Rationale', value: plan.profile.rationale.join('\n') });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to compute day profile', { symbol, error });
      await interaction.editReply('Unable to compute the day profile at this time.');
    }
  }
};

export default command;
module.exports = command;

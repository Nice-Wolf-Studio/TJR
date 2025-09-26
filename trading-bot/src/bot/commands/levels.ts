import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import moment from 'moment-timezone';
import { marketDataService } from '../../data/marketData';
import { buildSessionMap } from '../../analysis/session/sessions';
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
    .setName('levels')
    .setDescription('Show session extremes for a symbol (Asia & London)')
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
      const asOf = resolveSnapshotTimestamp();
      const bars10m = await marketDataService.getBars({ symbol, timeframe: '10m', asOf, lookback: 144 });
      const sessionMap = buildSessionMap({ bars10m: bars10m.bars, asOf });

      const embed = new EmbedBuilder()
        .setTitle(`Session Levels – ${symbol}`)
        .setColor(0x0ea5e9)
        .setFooter({ text: `Computed ${moment(asOf).tz(TZ).format('MMM D, YYYY HH:mm')} ET` })
        .addFields({
          name: 'Asia Session',
          value: `${sessionMap.asia.window}\nHigh: ${formatNumber(sessionMap.asia.high)}\nLow: ${formatNumber(sessionMap.asia.low)}`,
          inline: true
        })
        .addFields({
          name: 'London Session',
          value: `${sessionMap.london.window}\nHigh: ${formatNumber(sessionMap.london.high)}\nLow: ${formatNumber(sessionMap.london.low)}`,
          inline: true
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to fetch session levels', { symbol, error });
      await interaction.editReply('Unable to compute session levels at this time.');
    }
  }
};

export default command;
module.exports = command;

import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import moment from 'moment-timezone';
import { generateDailyPlan } from '../../analysis/dailyPlan';
import logger from '../../utils/logger';

const TZ = 'America/New_York';
const DATE_FORMAT = 'YYYY-MM-DD';
const SYMBOLS = ['ES=F', 'NQ=F'];
const PROFILE_DESCRIPTIONS: Record<string, string> = {
  P1: 'Trend day – expect continuation toward external liquidity.',
  P2: 'Retracement day – look for rotation back toward equilibrium first.',
  P3: 'Balanced day – expect two-sided range targeting both extremes.'
};

function resolveSnapshotTimestamp(dateInput?: string | null): Date {
  const base = dateInput
    ? moment.tz(dateInput, DATE_FORMAT, TZ)
    : moment().tz(TZ);

  if (!base.isValid()) {
    throw new Error(`Invalid date. Expected ${DATE_FORMAT}`);
  }

  return base.clone().hour(9).minute(29).second(0).millisecond(0).toDate();
}

function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return value.toFixed(decimals);
}

async function buildEmbeds(asOf: Date) {
  const plans = await Promise.all(
    SYMBOLS.map(async (symbol) => {
      try {
        const plan = await generateDailyPlan({ symbol, asOf });
        return { symbol, plan };
      } catch (error) {
        logger.error('Failed to compute daily bias', { symbol, error });
        return { symbol, error };
      }
    })
  );

  return plans.map(({ symbol, plan, error }) => {
    if (error || !plan) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to compute daily bias', { symbol, message, error });
      return new EmbedBuilder()
        .setTitle(`Daily Bias – ${symbol}`)
        .setColor(0xef4444)
        .setDescription(`Unable to compute bias at this time: ${message}`);
    }

    const { bias, profile } = plan;
    const color = bias.bias.startsWith('long') ? 0x22c55e : bias.bias.startsWith('short') ? 0xef4444 : 0xf59e0b;
    const profileDescription = PROFILE_DESCRIPTIONS[profile.profile] ?? profile.profile;

    const embed = new EmbedBuilder()
      .setTitle(`Daily Bias – ${symbol}`)
      .setColor(color)
      .setFooter({
        text: `${bias.trendTF} structure • computed ${moment(bias.asOf).tz(TZ).format('MMM D, YYYY HH:mm')} ET`
      })
      .addFields({
        name: 'Bias',
        value: `**${bias.bias.toUpperCase()}** (structure: ${bias.structure.state})\nNotes: ${bias.notes.join(' • ')}`
      })
      .addFields({
        name: 'Day Profile',
        value: `Profile: **${profile.profile}** – ${profileDescription}\nPrimary Target: ${profile.targets.primary}\nSecondary: ${profile.targets.secondary}`
      })
      .addFields({
        name: 'Sessions',
        value: `Asia ${profile.sessionMap.asia.window}: H ${formatNumber(profile.sessionMap.asia.high)} / L ${formatNumber(profile.sessionMap.asia.low)}\nLondon ${profile.sessionMap.london.window}: H ${formatNumber(profile.sessionMap.london.high)} / L ${formatNumber(profile.sessionMap.london.low)}`
      })
      .addFields({ name: 'Rationale', value: profile.rationale.join('\n') });

    if (bias.range) {
      embed.addFields({
        name: 'Active Range',
        value: `Low: ${formatNumber(bias.range.low)} | EQ: ${formatNumber(bias.range.eq)} | High: ${formatNumber(bias.range.high)}`
      });
    }

    return embed;
  });
}

const command = {
  data: new SlashCommandBuilder()
    .setName('bias')
    .setDescription('Daily bias snapshots for ES=F and NQ=F')
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Desired session date (YYYY-MM-DD, ET)')
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    let asOf: Date;
    try {
      const dateInput = interaction.options.getString('date');
      asOf = resolveSnapshotTimestamp(dateInput);
    } catch (error) {
      await interaction.reply({ content: (error as Error).message, ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const embeds = await buildEmbeds(asOf);
    await interaction.editReply({ embeds });
  }
};

export default command;
module.exports = command;

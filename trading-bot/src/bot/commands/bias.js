const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const TjrIndexBiasAnalyzer = require('../../analysis/strategies/tjr-index-bias');

let indexAnalyzer = null;

function getIndexAnalyzer() {
    if (!indexAnalyzer) {
        indexAnalyzer = new TjrIndexBiasAnalyzer();
    }
    return indexAnalyzer;
}

function formatNumber(value, decimals = 2) {
    if (value == null || Number.isNaN(value)) return 'n/a';
    return Number(value).toFixed(decimals);
}

function buildIndexEmbed(analysis) {
    const { bias, structure, liquidity, confluence, momentum, tradePlan, sessionContext } = analysis;

    const color = bias.direction === 'bullish' ? 0x4ade80 : bias.direction === 'bearish' ? 0xf87171 : 0xfbbf24;

    const structureLines = [
        `• **Daily:** ${structure.daily.direction.toUpperCase()} • ${structure.daily.summary}`,
        `• **4H:** ${structure.h4.direction.toUpperCase()} • ${structure.h4.summary}`,
        `• **1H:** ${structure.h1.direction.toUpperCase()} • ${structure.h1.summary}`,
        `• **15M:** ${structure.m15.direction.toUpperCase()} • ${structure.m15.summary}`
    ];

    const liquidityLines = liquidity.liquidityLevels
        .slice(0, 6)
        .map(level => `• ${formatNumber(level.level)} (${level.type.toUpperCase()}) — ${level.note}`);

    const catalystLines = bias.catalysts.slice(0, 6).map(item => `• ${item}`);

    const entryZoneText = tradePlan.entryZone &&
        tradePlan.entryZone.lower != null &&
        tradePlan.entryZone.upper != null
        ? `${formatNumber(tradePlan.entryZone.lower)} → ${formatNumber(tradePlan.entryZone.upper)} (${tradePlan.entryZone.comment})`
        : 'Pending setup confirmation';

    const confluenceLines = [
        `Total Score: **${formatNumber(confluence.total, 1)} / ${confluence.max}** (${confluence.percentage}%)`,
        `Tier 1 (${formatNumber(confluence.tier1.score, 1)}/${confluence.tier1.max}): ${confluence.tier1.factors.join('; ') || 'No Tier 1 confluence'}`,
        `Tier 2 (${formatNumber(confluence.tier2.score, 1)}/${confluence.tier2.max}): ${confluence.tier2.factors.join('; ') || 'No Tier 2 confluence'}`,
        `Tier 3 (${formatNumber(confluence.tier3.score, 1)}/${confluence.tier3.max}): ${confluence.tier3.factors.join('; ') || 'No Tier 3 confluence'}`
    ];

    const tradePlanLines = [
        tradePlan.narrative,
        `Entry Zone: ${entryZoneText}`,
        `Invalidation: ${formatNumber(tradePlan.invalidation)}`,
        `Targets: ${tradePlan.targets.length > 0 ? tradePlan.targets.map(t => `${formatNumber(t.level)} (${t.note})`).join(', ') : 'Waiting for structure'}`
    ];

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`📊 TJR Bias — ${analysis.symbol}`)
        .setDescription(`Market: **${analysis.market}** (Proxy: ${analysis.proxySymbol})\nPrice: ${formatNumber(analysis.price)} | Active Session: ${sessionContext.activeSession}`)
        .addFields(
            {
                name: '🎯 Bias & Confidence',
                value: `**${bias.direction.toUpperCase()}** bias with **${bias.confidence}%** conviction\nMomentum: ${momentum.direction.toUpperCase()} | Volume: ${momentum.volumeState}`,
                inline: false
            },
            {
                name: '📈 Structure Alignment',
                value: structureLines.join('\n'),
                inline: false
            },
            {
                name: '💧 Liquidity Map',
                value: liquidityLines.join('\n') || 'No key liquidity levels detected',
                inline: false
            },
            {
                name: '⚡ Confluence Matrix',
                value: confluenceLines.join('\n'),
                inline: false
            },
            {
                name: '🧭 Catalysts',
                value: catalystLines.join('\n') || 'Awaiting high-probability catalysts',
                inline: false
            },
            {
                name: '🎯 Execution Plan',
                value: tradePlanLines.join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'TJR Index Bias Framework • Multi-timeframe SMC' })
        .setTimestamp(analysis.timestamp);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bias')
        .setDescription('Get market bias using TJR’s multi-timeframe framework')
        .addStringOption(option =>
            option.setName('symbol')
                .setDescription('Instrument symbol (e.g. ES, EQ, NQ, EURUSD)')
                .setRequired(true)
                .addChoices(
                    { name: 'ES (E-mini S&P 500)', value: 'ES' },
                    { name: 'MES (Micro ES)', value: 'MES' },
                    { name: 'EQ (E-mini Nasdaq 100)', value: 'EQ' },
                    { name: 'NQ (E-mini Nasdaq 100)', value: 'NQ' },
                    { name: 'EUR/USD', value: 'EURUSD' },
                    { name: 'GBP/USD', value: 'GBPUSD' },
                    { name: 'USD/JPY', value: 'USDJPY' }
                )),

    allowPrefix: false,

    async execute(interaction) {
        const symbol = interaction.options.getString('symbol');

        try {
            await interaction.deferReply();

            if (TjrIndexBiasAnalyzer.isSupported(symbol)) {
                const analyzer = getIndexAnalyzer();
                const analysis = await analyzer.analyze(symbol);
                const embed = buildIndexEmbed(analysis);
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            await interaction.editReply({
                content: 'Forex bias reporting is coming soon. The TJR index framework currently supports ES, MES, EQ and NQ.',
                embeds: []
            });

        } catch (error) {
            logger.error('Bias command failed', { error: error.message, stack: error.stack });

            const message = error.message.includes('Alpha Vantage') ?
                `Unable to complete analysis: ${error.message}` :
                'Something went wrong while running the bias analysis. Please try again shortly.';

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: message, embeds: [] });
            } else {
                await interaction.reply({ content: message, ephemeral: true });
            }
        }
    }
};

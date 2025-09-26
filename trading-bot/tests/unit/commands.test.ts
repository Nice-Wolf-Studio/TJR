import { ChatInputCommandInteraction } from 'discord.js';

const generateDailyPlanMock = jest.fn(async ({ symbol }: { symbol: string }) => ({
  bias: {
    symbol,
    asOf: new Date('2024-02-01T14:29:00Z'),
    bias: symbol === 'ES=F' ? 'long' : 'short',
    trendTF: symbol === 'ES=F' ? '4H' : '1H',
    range: { low: 100, eq: 150, high: 200 },
    structure: { state: symbol === 'ES=F' ? 'bullish' : 'bearish', lastBos: symbol === 'ES=F' ? 'up' : 'down' },
    notes: ['auto test note']
  },
  profile: {
    symbol,
    asOf: new Date('2024-02-01T14:29:00Z'),
    profile: symbol === 'ES=F' ? 'P1' : 'P2',
    sessionMap: {
      asia: { name: 'asia', window: '18:00-01:00 ET', high: 210, low: 190 },
      london: { name: 'london', window: '03:00-07:00 ET', high: 220, low: 195 }
    },
    targets: { primary: 'prior day high', secondary: 'prior session high' },
    rationale: ['auto test rationale']
  }
}));

jest.mock('../../src/analysis/dailyPlan', () => ({
  generateDailyPlan: (params: any) => generateDailyPlanMock(params)
}));

const biasCommand = require('../../src/bot/commands/bias');

describe('bias command embed', () => {
  it('renders deterministic embed payload', async () => {
    const deferReply = jest.fn().mockResolvedValue(undefined);
    const editReply = jest.fn().mockResolvedValue(undefined);
    const getString = jest.fn().mockReturnValue(null);

    const interaction = {
      options: { getString },
      deferReply,
      editReply,
      replied: false,
      deferred: false
    } as unknown as ChatInputCommandInteraction;

    await biasCommand.execute(interaction);

    expect(deferReply).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledTimes(1);
    const embeds = editReply.mock.calls[0][0].embeds;
    expect(embeds).toHaveLength(2);
    expect(embeds[0].data.title).toContain('ES=F');
    expect(embeds[1].data.title).toContain('NQ=F');
    expect(getString).toHaveBeenCalledWith('date');
  });
});

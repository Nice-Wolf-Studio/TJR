import { createProvider } from '../../src/data/providerFactory';

describe('providerFactory', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws if Databento key missing', () => {
    delete process.env.DATABENTO_API_KEY;
    expect(() => createProvider()).toThrow('Databento provider unavailable');
  });

  it('returns Databento provider when key present', () => {
    process.env.DATABENTO_API_KEY = 'db-test-key';

    const provider = createProvider();

    expect(provider.id).toBe('databento');
  });
});

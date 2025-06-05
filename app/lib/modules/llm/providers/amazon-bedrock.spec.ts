import { describe, expect, it, vi } from 'vitest';
import AmazonBedrockProvider from './amazon-bedrock';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { LLMManager } from '../manager';

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => vi.fn()),
}));

vi.mock('../manager', () => ({
  LLMManager: { getInstance: vi.fn(() => ({ env: {} })) },
}));

describe('AmazonBedrockProvider', () => {
  it('parses minimal config using environment region', () => {
    const provider = new AmazonBedrockProvider();
    const config = (provider as any)._parseAndValidateConfig('{}', {
      AWS_BEDROCK_REGION: 'us-west-2',
    });
    expect(config).toEqual({ region: 'us-west-2' });
  });

  it('calls createAmazonBedrock with only region when credentials absent', () => {
    const provider = new AmazonBedrockProvider();
    const originalConfig = process.env.AWS_BEDROCK_CONFIG;
    delete process.env.AWS_BEDROCK_CONFIG;
    provider.getModelInstance({
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
      serverEnv: { AWS_BEDROCK_REGION: 'us-west-2' } as any,
      apiKeys: {},
      providerSettings: {},
    });
    expect(createAmazonBedrock).toHaveBeenCalledWith({
      bedrockOptions: { region: 'us-west-2' },
    });
    if (originalConfig !== undefined) {
      process.env.AWS_BEDROCK_CONFIG = originalConfig;
    }
  });
});

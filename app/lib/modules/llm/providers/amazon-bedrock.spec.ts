import { describe, expect, it, vi } from 'vitest';

// Mock the BaseProvider to avoid circular imports
vi.mock('~/lib/modules/llm/base-provider', () => ({
  BaseProvider: class BaseProvider {
    name = '';
    config = {};
    staticModels = [];
  },
}));

// Mock createAmazonBedrock to avoid AWS SDK imports in tests
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(),
}));

import AmazonBedrockProvider from './amazon-bedrock';

describe('AmazonBedrockProvider', () => {
  const provider = new AmazonBedrockProvider();

  describe('_parseAndValidateConfig', () => {
    it('should accept configuration with explicit credentials', () => {
      const config = JSON.stringify({
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
      });

      const result = (provider as any)._parseAndValidateConfig(config);

      expect(result).toEqual({
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
      });
    });

    it('should accept configuration with only region (for AWS SSO/default credentials)', () => {
      const config = JSON.stringify({
        region: 'us-east-1',
      });

      const result = (provider as any)._parseAndValidateConfig(config);

      expect(result).toEqual({
        region: 'us-east-1',
      });
    });

    it('should throw error when region is missing', () => {
      const config = JSON.stringify({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      });

      expect(() => (provider as any)._parseAndValidateConfig(config)).toThrow(
        'Missing required AWS region. Configuration must include region.',
      );
    });

    it('should throw error when only accessKeyId is provided without secretAccessKey', () => {
      const config = JSON.stringify({
        region: 'us-east-1',
        accessKeyId: 'test-key',
      });

      expect(() => (provider as any)._parseAndValidateConfig(config)).toThrow(
        'When providing explicit credentials, both accessKeyId and secretAccessKey must be specified.',
      );
    });

    it('should throw error when only secretAccessKey is provided without accessKeyId', () => {
      const config = JSON.stringify({
        region: 'us-east-1',
        secretAccessKey: 'test-secret',
      });

      expect(() => (provider as any)._parseAndValidateConfig(config)).toThrow(
        'When providing explicit credentials, both accessKeyId and secretAccessKey must be specified.',
      );
    });

    it('should throw error for invalid JSON', () => {
      const config = 'invalid json';

      expect(() => (provider as any)._parseAndValidateConfig(config)).toThrow(
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region and optionally accessKeyId and secretAccessKey.',
      );
    });
  });
});

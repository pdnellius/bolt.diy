import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AWS SDK modules
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => vi.fn(() => 'mock-language-model')),
}));

vi.mock('@aws-sdk/credential-provider-sso', () => ({
  fromSSO: vi.fn(() => 'mock-sso-credentials'),
}));

vi.mock('@aws-sdk/credential-provider-ini', () => ({
  fromIni: vi.fn(() => 'mock-ini-credentials'),
}));

vi.mock('../app/lib/services/awsSsoService', () => ({
  awsSsoService: {
    getAWSConfig: vi.fn(),
    getSSOCredentials: vi.fn(),
  },
}));

vi.mock('../app/lib/modules/llm/base-provider', () => ({
  BaseProvider: class MockBaseProvider {
    name = 'Mock';
    staticModels = [];
    config = {};
    getProviderBaseUrlAndKey(options: any) {
      // Return the mock API key from the test options
      const apiKey = options.apiKeys?.[this.name] || '';
      return { baseUrl: '', apiKey };
    }
  },
}));

import AmazonBedrockProvider from '../app/lib/modules/llm/providers/amazon-bedrock';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { fromIni } from '@aws-sdk/credential-provider-ini';

const mockCreateAmazonBedrock = vi.mocked(createAmazonBedrock);
const mockFromSSO = vi.mocked(fromSSO);
const mockFromIni = vi.mocked(fromIni);

describe('AmazonBedrockProvider', () => {
  let provider: AmazonBedrockProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AmazonBedrockProvider();
  });

  describe('_parseAndValidateConfig', () => {
    it('should parse static credentials configuration', () => {
      const staticConfig = {
        region: 'us-east-1',
        accessKeyId: 'AKIA123',
        secretAccessKey: 'secret123',
        sessionToken: 'token123',
      };

      const result = (provider as any)._parseAndValidateConfig(JSON.stringify(staticConfig));

      expect(result).toEqual(staticConfig);
    });

    it('should parse SSO configuration with profile', () => {
      const ssoConfig = {
        authType: 'sso',
        profile: 'test-profile',
        region: 'us-west-2',
      };

      const result = (provider as any)._parseAndValidateConfig(JSON.stringify(ssoConfig));

      expect(result).toEqual({
        authType: 'sso',
        profile: 'test-profile',
        region: 'us-west-2',
        ssoStartUrl: undefined,
        ssoRegion: undefined,
        ssoAccountId: undefined,
        ssoRoleName: undefined,
      });
    });

    it('should parse SSO configuration with direct SSO details', () => {
      const ssoConfig = {
        authType: 'sso',
        region: 'us-west-2',
        ssoStartUrl: 'https://test.awsapps.com/start',
        ssoRegion: 'us-east-1',
        ssoAccountId: '123456789012',
        ssoRoleName: 'TestRole',
      };

      const result = (provider as any)._parseAndValidateConfig(JSON.stringify(ssoConfig));

      expect(result).toEqual({
        authType: 'sso',
        profile: undefined,
        region: 'us-west-2',
        ssoStartUrl: 'https://test.awsapps.com/start',
        ssoRegion: 'us-east-1',
        ssoAccountId: '123456789012',
        ssoRoleName: 'TestRole',
      });
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        (provider as any)._parseAndValidateConfig('invalid-json');
      }).toThrow('Invalid AWS Bedrock configuration format');
    });

    it('should throw error for missing required static credentials', () => {
      const incompleteConfig = {
        region: 'us-east-1',
        accessKeyId: 'AKIA123',
        // missing secretAccessKey
      };

      expect(() => {
        (provider as any)._parseAndValidateConfig(JSON.stringify(incompleteConfig));
      }).toThrow('Missing required AWS credentials');
    });

    it('should throw error for SSO config missing region', () => {
      const ssoConfig = {
        authType: 'sso',
        profile: 'test-profile',
        // missing region
      };

      expect(() => {
        (provider as any)._parseAndValidateConfig(JSON.stringify(ssoConfig));
      }).toThrow('Missing required region for AWS configuration');
    });

    it('should throw error for SSO config without profile or SSO details', () => {
      const ssoConfig = {
        authType: 'sso',
        region: 'us-east-1',
        // missing profile and SSO details
      };

      expect(() => {
        (provider as any)._parseAndValidateConfig(JSON.stringify(ssoConfig));
      }).toThrow('AWS SSO configuration must include either a profile name or SSO details');
    });
  });

  describe('getModelInstance', () => {
    it('should create model instance with static credentials', () => {
      const staticConfig = {
        region: 'us-east-1',
        accessKeyId: 'AKIA123',
        secretAccessKey: 'secret123',
        sessionToken: 'token123',
      };

      const mockLangModel = vi.fn(() => 'mock-model');
      (mockCreateAmazonBedrock as any).mockReturnValue(mockLangModel);

      const options = {
        model: 'claude-3-sonnet',
        serverEnv: {},
        apiKeys: { AmazonBedrock: JSON.stringify(staticConfig) },
        providerSettings: {},
      };

      const result = provider.getModelInstance(options);

      expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(staticConfig);
      expect(mockLangModel).toHaveBeenCalledWith('claude-3-sonnet');
      expect(result).toBe('mock-model');
    });

    it('should create model instance with SSO profile credentials', () => {
      const ssoConfig = {
        authType: 'sso',
        profile: 'test-profile',
        region: 'us-west-2',
      };

      const mockLangModel = vi.fn(() => 'mock-model');
      (mockCreateAmazonBedrock as any).mockReturnValue(mockLangModel);

      const options = {
        model: 'claude-3-sonnet',
        serverEnv: {},
        apiKeys: { AmazonBedrock: JSON.stringify(ssoConfig) },
        providerSettings: {},
      };

      const result = provider.getModelInstance(options);

      // Check that createAmazonBedrock was called with bedrockOptions containing credentials function
      expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
        expect.objectContaining({
          bedrockOptions: expect.objectContaining({
            region: 'us-west-2',
            credentials: expect.any(Function),
          }),
        })
      );
      expect(mockLangModel).toHaveBeenCalledWith('claude-3-sonnet');
      expect(result).toBe('mock-model');
    });

    it('should create model instance with direct SSO credentials', () => {
      const ssoConfig = {
        authType: 'sso',
        region: 'us-west-2',
        ssoStartUrl: 'https://test.awsapps.com/start',
        ssoRegion: 'us-east-1',
        ssoAccountId: '123456789012',
        ssoRoleName: 'TestRole',
      };

      const mockLangModel = vi.fn(() => 'mock-model');
      (mockCreateAmazonBedrock as any).mockReturnValue(mockLangModel);

      const options = {
        model: 'claude-3-sonnet',
        serverEnv: {},
        apiKeys: { AmazonBedrock: JSON.stringify(ssoConfig) },
        providerSettings: {},
      };

      const result = provider.getModelInstance(options);

      // Check that createAmazonBedrock was called with bedrockOptions containing credentials function
      expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
        expect.objectContaining({
          bedrockOptions: expect.objectContaining({
            region: 'us-west-2',
            credentials: expect.any(Function),
          }),
        })
      );
      expect(mockLangModel).toHaveBeenCalledWith('claude-3-sonnet');
      expect(result).toBe('mock-model');
    });

    it('should throw error when API key is missing', () => {
      const options = {
        model: 'claude-3-sonnet',
        serverEnv: {},
        apiKeys: {},
        providerSettings: {},
      };

      expect(() => {
        provider.getModelInstance(options);
      }).toThrow('Missing API key for AmazonBedrock provider');
    });
  });

  describe('staticModels', () => {
    it('should have predefined static models', () => {
      expect(provider.staticModels).toBeDefined();
      expect(Array.isArray(provider.staticModels)).toBe(true);
      expect(provider.staticModels.length).toBeGreaterThan(0);

      // Check that Claude models are included
      const claudeModels = provider.staticModels.filter(model => 
        model.name.includes('claude')
      );
      expect(claudeModels.length).toBeGreaterThan(0);

      // Check that Nova models are included
      const novaModels = provider.staticModels.filter(model => 
        model.name.includes('nova')
      );
      expect(novaModels.length).toBeGreaterThan(0);
    });

    it('should have correct model structure', () => {
      const firstModel = provider.staticModels[0];
      expect(firstModel).toHaveProperty('name');
      expect(firstModel).toHaveProperty('label');
      expect(firstModel).toHaveProperty('provider');
      expect(firstModel).toHaveProperty('maxTokenAllowed');
      expect(firstModel.provider).toBe('AmazonBedrock');
    });
  });
});
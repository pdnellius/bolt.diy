import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { awsCredentialService, type AWSCredentialConfig } from '~/lib/services/awsCredentialService';

interface AWSBedRockConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface AWSSSORBedRockConfig {
  authType: 'sso' | 'auto';
  profile?: string;
  region: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}

export default class AmazonBedrockProvider extends BaseProvider {
  name = 'AmazonBedrock';
  getApiKeyLink = 'https://console.aws.amazon.com/iam/home';

  config = {
    apiTokenKey: 'AWS_BEDROCK_CONFIG',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      label: 'Claude 3.5 Sonnet v2 (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 200000,
    },
    {
      name: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      label: 'Claude 3.5 Sonnet (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 4096,
    },
    {
      name: 'anthropic.claude-3-sonnet-20240229-v1:0',
      label: 'Claude 3 Sonnet (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 4096,
    },
    {
      name: 'anthropic.claude-3-haiku-20240307-v1:0',
      label: 'Claude 3 Haiku (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 4096,
    },
    {
      name: 'amazon.nova-pro-v1:0',
      label: 'Amazon Nova Pro (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 5120,
    },
    {
      name: 'amazon.nova-lite-v1:0',
      label: 'Amazon Nova Lite (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 5120,
    },
    {
      name: 'mistral.mistral-large-2402-v1:0',
      label: 'Mistral Large 24.02 (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 8192,
    },
  ];

  private _parseAndValidateConfig(apiKey: string): AWSBedRockConfig | AWSSSORBedRockConfig {
    let parsedConfig: any;

    try {
      parsedConfig = JSON.parse(apiKey);
    } catch {
      throw new Error(
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string.',
      );
    }

    // Check if this is SSO or auto configuration
    if (parsedConfig.authType === 'sso' || parsedConfig.authType === 'auto') {
      const { authType, region, profile, ssoStartUrl, ssoRegion, ssoAccountId, ssoRoleName } = parsedConfig;

      if (!region) {
        throw new Error(
          'Missing required region for AWS configuration.',
        );
      }

      // For SSO mode, validate that we have either a profile or SSO details
      // For auto mode, these are optional as it can fall back to IAM roles
      if (authType === 'sso' && !profile && (!ssoStartUrl || !ssoRegion)) {
        throw new Error(
          'AWS SSO configuration must include either a profile name or SSO details (ssoStartUrl, ssoRegion).',
        );
      }

      return {
        authType,
        region,
        profile,
        ssoStartUrl,
        ssoRegion,
        ssoAccountId,
        ssoRoleName,
      } as AWSSSORBedRockConfig;
    }

    // Legacy static credentials configuration
    const { region, accessKeyId, secretAccessKey, sessionToken } = parsedConfig;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Missing required AWS credentials. Configuration must include region, accessKeyId, and secretAccessKey.',
      );
    }

    return {
      region,
      accessKeyId,
      secretAccessKey,
      ...(sessionToken && { sessionToken }),
    } as AWSBedRockConfig;
  }



  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'AWS_BEDROCK_CONFIG',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const config = this._parseAndValidateConfig(apiKey);
    
    // For production environments, use the new credential service
    // which automatically handles ECS/EKS/EC2 roles and development SSO
    if ('authType' in config && (config.authType === 'sso' || config.authType === 'auto')) {
      const bedrock = createAmazonBedrock({
        bedrockOptions: {
          region: config.region,
          credentials: async () => {
            const credentialConfig: AWSCredentialConfig = {
              authType: config.authType || 'auto',
              region: config.region,
              profile: config.profile,
              ssoStartUrl: config.ssoStartUrl,
              ssoRegion: config.ssoRegion,
              ssoAccountId: config.ssoAccountId,
              ssoRoleName: config.ssoRoleName,
            };
            return await awsCredentialService.getCredentials(credentialConfig);
          },
        },
      });
      return bedrock(model);
    } else {
      // Use static credentials (legacy/fallback)
      const staticConfig = config as AWSBedRockConfig;
      const bedrock = createAmazonBedrock(staticConfig);
      return bedrock(model);
    }
  }
}

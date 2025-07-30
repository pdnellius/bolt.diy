import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

interface AWSBedRockConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
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

  private _parseAndValidateConfig(apiKey: string): AWSBedRockConfig {
    let parsedConfig: AWSBedRockConfig;

    try {
      parsedConfig = JSON.parse(apiKey);
    } catch {
      throw new Error(
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region and either explicit credentials (accessKeyId, secretAccessKey) or use AWS credential chain (SSO, environment variables, etc.).',
      );
    }

    const { region, accessKeyId, secretAccessKey, sessionToken } = parsedConfig;

    if (!region) {
      throw new Error('Missing required AWS region. Configuration must include region.');
    }

    if (accessKeyId || secretAccessKey) {
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('When using explicit credentials, both accessKeyId and secretAccessKey are required.');
      }
    }

    return {
      region,
      ...(accessKeyId && { accessKeyId }),
      ...(secretAccessKey && { secretAccessKey }),
      ...(sessionToken && { sessionToken }),
    };
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

    console.log('[AmazonBedrock] Configuration debug:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      model,
      serverEnvKeys: Object.keys(serverEnv || {}),
    });

    if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
      try {
        const config = this._parseAndValidateConfig(apiKey);
        console.log('[AmazonBedrock] Using explicit credentials from config:', {
          region: config.region,
          hasAccessKeyId: !!config.accessKeyId,
          hasSecretAccessKey: !!config.secretAccessKey,
          hasSessionToken: !!config.sessionToken,
        });

        const bedrock = createAmazonBedrock(config);

        return bedrock(model);
      } catch (error) {
        console.error('[AmazonBedrock] Error parsing config:', error);
        throw error;
      }
    }

    const region = serverEnv?.AWS_REGION || process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = serverEnv?.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = serverEnv?.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = serverEnv?.AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;

    console.log('[AmazonBedrock] Using credential chain:', {
      region,
      hasAccessKeyId: !!accessKeyId,
      hasSecretAccessKey: !!secretAccessKey,
      hasSessionToken: !!sessionToken,
      usingCredentialProvider: !accessKeyId || !secretAccessKey,
    });

    const bedrockConfig: any = { region };

    if (accessKeyId && secretAccessKey) {
      bedrockConfig.accessKeyId = accessKeyId;
      bedrockConfig.secretAccessKey = secretAccessKey;

      if (sessionToken) {
        bedrockConfig.sessionToken = sessionToken;
      }

      console.log('[AmazonBedrock] Using explicit environment credentials');
    } else {
      bedrockConfig.credentialProvider = async () => {
        console.log('[AmazonBedrock] Using AWS credential chain for authentication');
        return undefined;
      };
    }

    const bedrock = createAmazonBedrock(bedrockConfig);

    return bedrock(model);
  }
}

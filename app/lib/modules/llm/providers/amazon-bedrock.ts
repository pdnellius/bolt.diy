import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

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
      name: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      label: 'Claude 4 Sonnet (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 65536,
    },
    {
      name: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      label: 'Claude 3.5 Sonnet v2 (Bedrock)',
      provider: 'AmazonBedrock',
      maxTokenAllowed: 65536,
    },
    {
      name: 'us.anthropic.claude-3-5-sonnet-20240620-v1:0',
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
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing at minimum the region.',
      );
    }

    const { region, accessKeyId, secretAccessKey, sessionToken } = parsedConfig;

    if (!region) {
      throw new Error(
        'Missing required region. Configuration must include at minimum the region.',
      );
    }

    // If any explicit credentials are provided, all required credentials must be present
    if ((accessKeyId || secretAccessKey) && (!accessKeyId || !secretAccessKey)) {
      throw new Error(
        'Incomplete AWS credentials. If providing explicit credentials, both accessKeyId and secretAccessKey are required.',
      );
    }

    return {
      region,
      ...(accessKeyId && { accessKeyId }),
      ...(secretAccessKey && { secretAccessKey }),
      ...(sessionToken && { sessionToken }),
    };
  }

  async getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): Promise<LanguageModelV1> {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'AWS_BEDROCK_CONFIG',
    });

    let bedrockConfig: any;

    if (apiKey) {
      // Config provided - could be explicit credentials or just region
      const config = this._parseAndValidateConfig(apiKey);

      if (config.accessKeyId && config.secretAccessKey) {
        // Explicit credentials provided - use them directly
        bedrockConfig = config;
      } else {
        // Only region provided - use AWS credential provider chain (SSO support)
        const credentialsProvider = fromNodeProviderChain();
        const credentials = await credentialsProvider();

        bedrockConfig = {
          region: config.region,
          ...credentials,
        };
      }
    } else {
      // No config provided - use AWS_REGION env var and credential provider chain
      const region = serverEnv?.AWS_REGION || process?.env?.AWS_REGION || 'us-east-1';
      const credentialsProvider = fromNodeProviderChain();
      const credentials = await credentialsProvider();

      bedrockConfig = {
        region,
        ...credentials,
      };
    }

    const bedrock = createAmazonBedrock(bedrockConfig);

    return bedrock(model);
  }
}

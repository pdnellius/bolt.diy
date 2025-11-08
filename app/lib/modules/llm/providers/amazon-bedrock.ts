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

  /**
   * Get a model instance with AWS credentials.
   *
   * Supports multiple authentication methods via AWS credential provider chain:
   * 1. Explicit credentials in AWS_BEDROCK_CONFIG JSON
   * 2. AWS SSO (run `aws sso login` first)
   * 3. ECS Task Roles (automatic in ECS via container metadata)
   * 4. EC2 Instance Profiles (automatic on EC2)
   * 5. Lambda Execution Roles (automatic in Lambda)
   * 6. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
   *
   * For ECS deployments: Just set AWS_REGION or AWS_DEFAULT_REGION environment variable.
   * The ECS task role credentials will be automatically retrieved via the container
   * credentials provider (AWS_CONTAINER_CREDENTIALS_RELATIVE_URI).
   */
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
        // Only region provided - use AWS credential provider chain
        // This supports: SSO, ECS task roles, EC2 instance profiles, etc.
        const credentialsProvider = fromNodeProviderChain();
        const credentials = await credentialsProvider();

        bedrockConfig = {
          region: config.region,
          ...credentials,
        };
      }
    } else {
      // No config provided - use AWS credential provider chain with region from env
      // Check both AWS_REGION and AWS_DEFAULT_REGION (common in ECS/Lambda)
      const region =
        serverEnv?.AWS_REGION ||
        serverEnv?.AWS_DEFAULT_REGION ||
        process?.env?.AWS_REGION ||
        process?.env?.AWS_DEFAULT_REGION ||
        'us-east-1';
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

import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AmazonBedrock');

// Type for the credential provider function (imported dynamically to avoid browser bundling issues)
type FromNodeProviderChain = typeof import('@aws-sdk/credential-providers').fromNodeProviderChain;

interface AWSBedRockConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
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

  // Cache for resolved credentials from the provider chain
  private _cachedCredentials: AWSCredentials | null = null;
  private _credentialsCacheExpiry: number = 0;

  private _parseAndValidateConfig(apiKey: string): AWSBedRockConfig {
    let parsedConfig: AWSBedRockConfig;

    try {
      parsedConfig = JSON.parse(apiKey);
    } catch {
      throw new Error(
        'Invalid AWS Bedrock configuration format. Please provide a valid JSON string containing region, accessKeyId, and secretAccessKey.',
      );
    }

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
    };
  }

  /**
   * Dynamically loads the AWS credential provider chain.
   * This uses dynamic import to avoid bundling Node.js-specific code for the browser.
   */
  private async _loadCredentialProvider(): Promise<FromNodeProviderChain> {
    // Dynamic import to avoid browser bundling issues
    // The @aws-sdk/credential-providers browser build doesn't include fromNodeProviderChain
    const module = await import('@aws-sdk/credential-providers');
    return module.fromNodeProviderChain;
  }

  /**
   * Resolves AWS credentials using the default credential provider chain.
   * This supports:
   * - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
   * - Shared credentials file (~/.aws/credentials)
   * - SSO credentials (when user has run `aws sso login`)
   * - ECS container credentials
   * - EC2 instance metadata
   */
  private async _resolveCredentialsFromChain(region: string, profile?: string): Promise<AWSCredentials> {
    // Check if we have valid cached credentials
    if (this._cachedCredentials && Date.now() < this._credentialsCacheExpiry) {
      logger.debug('Using cached AWS credentials');
      return this._cachedCredentials;
    }

    logger.debug('Resolving AWS credentials from provider chain');

    // Dynamically load the credential provider to avoid browser bundling issues
    const fromNodeProviderChain = await this._loadCredentialProvider();

    const credentialProvider = fromNodeProviderChain({
      clientConfig: { region },
      ...(profile && { profile }),
    });

    const credentials = await credentialProvider();

    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error(
        'No AWS credentials found. Please run "aws sso login" or configure AWS credentials in ~/.aws/credentials',
      );
    }

    const resolvedCredentials: AWSCredentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
      ...(credentials.expiration && { expiration: credentials.expiration }),
    };

    // Cache credentials for 5 minutes (or until expiry if sooner)
    this._cachedCredentials = resolvedCredentials;

    if (credentials.expiration) {
      // Cache until 5 minutes before expiry
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes in ms
      this._credentialsCacheExpiry = Math.min(
        Date.now() + 5 * 60 * 1000,
        credentials.expiration.getTime() - expiryBuffer,
      );
    } else {
      // Cache for 5 minutes if no expiry
      this._credentialsCacheExpiry = Date.now() + 5 * 60 * 1000;
    }

    logger.debug('AWS credentials resolved successfully from provider chain');

    return resolvedCredentials;
  }

  /**
   * Gets the AWS region from various sources in order of precedence:
   * 1. Explicit config (from AWS_BEDROCK_CONFIG JSON)
   * 2. AWS_BEDROCK_REGION environment variable
   * 3. AWS_REGION environment variable
   * 4. AWS_DEFAULT_REGION environment variable
   * 5. Default to us-east-1
   */
  private _getRegion(serverEnv?: Record<string, string>): string {
    return (
      serverEnv?.['AWS_BEDROCK_REGION'] ||
      process.env.AWS_BEDROCK_REGION ||
      serverEnv?.['AWS_REGION'] ||
      process.env.AWS_REGION ||
      serverEnv?.['AWS_DEFAULT_REGION'] ||
      process.env.AWS_DEFAULT_REGION ||
      'us-east-1'
    );
  }

  /**
   * Gets the AWS profile from environment if set
   */
  private _getProfile(serverEnv?: Record<string, string>): string | undefined {
    return serverEnv?.['AWS_PROFILE'] || process.env.AWS_PROFILE;
  }

  /**
   * Checks if the credential chain should be used.
   * Returns true if:
   * - AWS_BEDROCK_USE_CREDENTIAL_CHAIN is set to 'true'
   * - OR no explicit credentials are configured AND AWS_BEDROCK_REGION is set
   */
  private _shouldUseCredentialChain(apiKey: string | undefined, serverEnv?: Record<string, string>): boolean {
    // Explicit flag to use credential chain
    const useChainFlag =
      serverEnv?.['AWS_BEDROCK_USE_CREDENTIAL_CHAIN'] || process.env.AWS_BEDROCK_USE_CREDENTIAL_CHAIN;

    if (useChainFlag === 'true') {
      return true;
    }

    // If no explicit credentials and region is set, use credential chain
    if (!apiKey) {
      const hasRegion = !!(
        serverEnv?.['AWS_BEDROCK_REGION'] ||
        process.env.AWS_BEDROCK_REGION ||
        serverEnv?.['AWS_REGION'] ||
        process.env.AWS_REGION
      );

      return hasRegion;
    }

    return false;
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

    // Check if we should use the credential chain
    if (this._shouldUseCredentialChain(apiKey, serverEnv)) {
      return this._getModelInstanceWithCredentialChain(model, serverEnv);
    }

    // Use explicit credentials
    if (!apiKey) {
      throw new Error(
        `Missing API key for ${this.name} provider. Either provide AWS_BEDROCK_CONFIG with explicit credentials, or set AWS_BEDROCK_REGION to use the AWS credential chain (supports SSO, IAM roles, etc.).`,
      );
    }

    const config = this._parseAndValidateConfig(apiKey);
    const bedrock = createAmazonBedrock(config);

    return bedrock(model);
  }

  /**
   * Creates a model instance using the AWS credential provider chain.
   * This is an async operation but we need to return synchronously,
   * so we use a wrapper that resolves credentials on first use.
   */
  private _getModelInstanceWithCredentialChain(model: string, serverEnv?: Record<string, string>): LanguageModelV1 {
    const region = this._getRegion(serverEnv);
    const profile = this._getProfile(serverEnv);

    logger.debug(`Creating Bedrock model with credential chain, region: ${region}, profile: ${profile || 'default'}`);

    // Create a bedrock instance with a credential provider function
    // The @ai-sdk/amazon-bedrock package internally uses @aws-sdk/client-bedrock-runtime
    // which supports async credential providers
    const bedrock = createAmazonBedrock({
      region,
      // Pass an async function that resolves credentials
      // This will be called by the AWS SDK when making requests
      credentials: async () => {
        const creds = await this._resolveCredentialsFromChain(region, profile);
        return {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
          expiration: creds.expiration,
        };
      },
    } as any); // Type assertion needed as the AI SDK types may not expose credentials option directly

    return bedrock(model);
  }
}

import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

/**
 * Checks if AWS Bedrock credentials are available through the credential chain.
 * This includes SSO, IAM roles, environment variables, etc.
 */
function checkAwsCredentialChainAvailable(
  serverEnv: Record<string, any> | undefined,
  llmManagerEnv: Record<string, string>,
): boolean {
  // Check if credential chain is explicitly enabled
  const useChainFlag =
    serverEnv?.['AWS_BEDROCK_USE_CREDENTIAL_CHAIN'] || process.env.AWS_BEDROCK_USE_CREDENTIAL_CHAIN;

  if (useChainFlag === 'true') {
    return true;
  }

  // Check if region is set (required for credential chain mode)
  const hasRegion = !!(
    serverEnv?.['AWS_BEDROCK_REGION'] ||
    process.env.AWS_BEDROCK_REGION ||
    serverEnv?.['AWS_REGION'] ||
    process.env.AWS_REGION ||
    llmManagerEnv?.['AWS_BEDROCK_REGION'] ||
    llmManagerEnv?.['AWS_REGION']
  );

  return hasRegion;
}

export const loader: LoaderFunction = async ({ context, request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return Response.json({ isSet: false });
  }

  const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
  const providerInstance = llmManager.getProvider(provider);

  if (!providerInstance || !providerInstance.config.apiTokenKey) {
    return Response.json({ isSet: false });
  }

  const envVarName = providerInstance.config.apiTokenKey;
  const serverEnv = context?.cloudflare?.env as Record<string, any> | undefined;

  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);

  /*
   * Check API key in order of precedence:
   * 1. Client-side API keys (from cookies)
   * 2. Server environment variables (from Cloudflare env)
   * 3. Process environment variables (from .env.local)
   * 4. LLMManager environment variables
   */
  let isSet = !!(
    apiKeys?.[provider] ||
    serverEnv?.[envVarName] ||
    process.env[envVarName] ||
    llmManager.env[envVarName]
  );

  // Special handling for AmazonBedrock: also check credential chain availability
  if (!isSet && provider === 'AmazonBedrock') {
    isSet = checkAwsCredentialChainAvailable(serverEnv, llmManager.env);
  }

  return Response.json({ isSet });
};

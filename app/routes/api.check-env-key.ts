import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

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
  const env = context?.cloudflare?.env as Record<string, any>;

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
  let isSet = !!(apiKeys?.[provider] || env?.[envVarName] || process.env[envVarName] || llmManager.env[envVarName]);

  /*
   * Amazon Bedrock can use AWS SSO or container credentials when
   * AWS_BEDROCK_CONFIG is not provided, so check for common AWS
   * credential environment variables as a fallback.
   */
  if (!isSet && provider === 'AmazonBedrock') {
    const region =
      env?.AWS_REGION || env?.AWS_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

    const hasAwsCreds =
      env?.AWS_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      env?.AWS_PROFILE ||
      process.env.AWS_PROFILE ||
      env?.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      env?.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      env?.AWS_ROLE_ARN ||
      process.env.AWS_ROLE_ARN;

    if (region && hasAwsCreds) {
      isSet = true;
    }
  }

  return Response.json({ isSet });
};

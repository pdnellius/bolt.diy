import type { LoaderFunction } from '@remix-run/cloudflare';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.aws-credentials');

/**
 * API endpoint to resolve AWS credentials using the default credential provider chain.
 * This supports:
 * - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
 * - Shared credentials file (~/.aws/credentials)
 * - SSO credentials (~/.aws/sso/cache/) - when user has run `aws sso login`
 * - ECS container credentials (via AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
 * - EC2 instance metadata service
 *
 * Returns temporary credentials that can be used with AWS services.
 */
export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const profile = url.searchParams.get('profile') || process.env.AWS_PROFILE;

  try {
    // Create a credential provider chain that tries multiple sources
    const credentialProvider = fromNodeProviderChain({
      clientConfig: { region },
      ...(profile && { profile }),
    });

    // Resolve the credentials
    const credentials = await credentialProvider();

    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      logger.warn('No AWS credentials found in credential chain');
      return Response.json(
        {
          success: false,
          error: 'No AWS credentials found. Please run "aws sso login" or configure AWS credentials.',
        },
        { status: 401 },
      );
    }

    // Return the credentials (with expiration info if available)
    const response = {
      success: true,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
        ...(credentials.expiration && { expiration: credentials.expiration.toISOString() }),
      },
      region,
    };

    logger.debug('AWS credentials resolved successfully');

    return Response.json(response);
  } catch (error: any) {
    logger.error('Failed to resolve AWS credentials:', error.message);

    // Provide helpful error messages based on common issues
    let errorMessage = 'Failed to resolve AWS credentials.';

    if (error.message?.includes('Could not load credentials')) {
      errorMessage =
        'No AWS credentials found. Please run "aws sso login" or configure AWS credentials in ~/.aws/credentials';
    } else if (error.message?.includes('Token has expired')) {
      errorMessage = 'AWS SSO session has expired. Please run "aws sso login" to refresh your credentials.';
    } else if (error.message?.includes('ENOENT')) {
      errorMessage = 'AWS configuration not found. Please configure AWS CLI with "aws configure sso" or "aws configure"';
    }

    return Response.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 401 },
    );
  }
};

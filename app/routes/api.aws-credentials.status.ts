import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { awsCredentialService, type AWSCredentialConfig } from '~/lib/services/awsCredentialService';

interface StatusRequest {
  region: string;
  authType?: 'auto' | 'sso' | 'static';
  profile?: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const requestData: StatusRequest = await request.json();
    
    const config: AWSCredentialConfig = {
      authType: requestData.authType || 'auto',
      region: requestData.region,
      profile: requestData.profile,
      ssoStartUrl: requestData.ssoStartUrl,
      ssoRegion: requestData.ssoRegion,
      ssoAccountId: requestData.ssoAccountId,
      ssoRoleName: requestData.ssoRoleName,
    };

    // Check credential status
    const status = await awsCredentialService.checkCredentialStatus(config);
    
    // Get environment information
    const environment = await awsCredentialService.detectEnvironment();
    
    return json({
      ...status,
      environment,
    });
  } catch (error) {
    console.error('AWS credential status check error:', error);
    return json(
      { 
        available: false,
        method: 'none',
        error: error instanceof Error ? error.message : 'Unknown error during AWS credential status check',
        environment: null,
      },
      { status: 500 }
    );
  }
}
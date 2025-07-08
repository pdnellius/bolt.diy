import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { awsCredentialService, type AWSCredentialConfig } from '~/lib/services/awsCredentialService';

interface StatusRequest {
  profile?: string;
  region: string;
  authType?: 'auto' | 'sso' | 'static';
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile, region, authType }: StatusRequest = await request.json();
    
    const config: AWSCredentialConfig = {
      authType: authType || 'auto',
      region,
      profile,
    };
    
    // Check credential status using the new service
    const status = await awsCredentialService.checkCredentialStatus(config);
    
    // Get environment information
    const environment = await awsCredentialService.detectEnvironment();
    
    return json({ 
      isActive: status.available,
      method: status.method,
      identity: status.identity,
      environment,
      message: status.available 
        ? `AWS credentials available via ${status.method}` 
        : status.error || 'AWS credentials not available'
    });
  } catch (error) {
    console.error('AWS credential status check error:', error);
    return json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error during AWS credential status check',
        isActive: false,
        method: 'none',
        environment: null,
      },
      { status: 500 }
    );
  }
}
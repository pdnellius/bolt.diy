import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { awsCredentialService } from '~/lib/services/awsCredentialService';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Get environment information
    const environment = await awsCredentialService.detectEnvironment();
    
    // Get available AWS profiles (development only)
    const profiles = await awsCredentialService.getAvailableProfiles();
    
    return json({ 
      profiles,
      environment,
      message: environment.isContainer 
        ? 'Profiles not available in container environments'
        : `Found ${profiles.length} AWS profiles`
    });
  } catch (error) {
    console.error('AWS profiles fetch error:', error);
    return json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error during AWS profiles fetch',
        profiles: [],
        environment: null,
      },
      { status: 500 }
    );
  }
}
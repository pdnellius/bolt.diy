import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { awsCredentialService } from '~/lib/services/awsCredentialService';

interface LoginRequest {
  profile?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { profile }: LoginRequest = await request.json();
    
    // Check environment first
    const environment = await awsCredentialService.detectEnvironment();
    
    if (environment.isContainer) {
      return json({
        success: false,
        error: 'SSO login is not available in container environments. Use IAM roles for production.',
        environment,
      }, { status: 400 });
    }
    
    if (!environment.hasAwsCli) {
      return json({
        success: false,
        error: 'AWS CLI is not available. Install AWS CLI for SSO login in development environments.',
        environment,
      }, { status: 400 });
    }
    
    // Initiate AWS SSO login (development only)
    await awsCredentialService.initiateSSORLogin(profile);
    
    return json({ 
      success: true, 
      message: 'AWS SSO login initiated successfully',
      environment,
    });
  } catch (error) {
    console.error('AWS SSO login error:', error);
    return json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error during AWS SSO login',
        success: false 
      },
      { status: 500 }
    );
  }
}
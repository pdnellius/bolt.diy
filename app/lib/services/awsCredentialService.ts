import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface AWSCredentialConfig {
  authType?: 'auto' | 'sso' | 'static';
  region: string;
  
  // SSO Configuration
  profile?: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  
  // Static Configuration (fallback)
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  
  // Production Configuration
  roleArn?: string;
  externalId?: string;
}

export interface EnvironmentInfo {
  isContainer: boolean;
  isECS: boolean;
  isEKS: boolean;
  hasAwsCli: boolean;
  hasIamRole: boolean;
}

export class AWSCredentialService {
  private static instance: AWSCredentialService;
  private environmentInfo: EnvironmentInfo | null = null;

  private constructor() {}

  public static getInstance(): AWSCredentialService {
    if (!AWSCredentialService.instance) {
      AWSCredentialService.instance = new AWSCredentialService();
    }
    return AWSCredentialService.instance;
  }

  /**
   * Detect the runtime environment to determine the best authentication strategy
   */
  public async detectEnvironment(): Promise<EnvironmentInfo> {
    if (this.environmentInfo) {
      return this.environmentInfo;
    }

    const isContainer = this.isRunningInContainer();
    const isECS = await this.isRunningInECS();
    const isEKS = await this.isRunningInEKS();
    const hasAwsCli = await this.isAwsCliAvailable();
    const hasIamRole = await this.hasIamRoleAttached();

    this.environmentInfo = {
      isContainer,
      isECS,
      isEKS,
      hasAwsCli,
      hasIamRole,
    };

    console.log('AWS Environment Detection:', this.environmentInfo);
    return this.environmentInfo;
  }

  /**
   * Get AWS credentials using the best available method for the current environment
   */
  public async getCredentials(config: AWSCredentialConfig): Promise<AwsCredentialIdentity> {
    const env = await this.detectEnvironment();
    
    try {
      // Production container environments (ECS/EKS)
      if (env.isContainer && (env.isECS || env.isEKS || env.hasIamRole)) {
        return await this.getProductionCredentials(config);
      }
      
      // Development environment with AWS CLI and SSO
      if (env.hasAwsCli && config.authType === 'sso') {
        return await this.getDevelopmentSSOCredentials(config);
      }
      
      // Fallback to static credentials or auto-detection
      return await this.getFallbackCredentials(config);
      
    } catch (error) {
      console.error('Failed to get AWS credentials:', error);
      throw new Error(`AWS credential resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Production-ready credential resolution for containers
   */
  private async getProductionCredentials(config: AWSCredentialConfig): Promise<AwsCredentialIdentity> {
    console.log('Using production credential resolution');
    
    // Use AWS SDK credential provider chain
    // This automatically handles: ECS task roles, EKS service accounts, EC2 instance profiles, env vars
    const credentialProvider = fromNodeProviderChain({
      // Try in order: env vars, ECS/EKS roles, EC2 instance metadata
      clientConfig: { region: config.region },
    });

    const credentials = await credentialProvider();
    
    // Validate credentials work by testing them
    await this.validateCredentials(credentials, config.region);
    
    return credentials;
  }

  /**
   * Development SSO credential resolution
   */
  private async getDevelopmentSSOCredentials(config: AWSCredentialConfig): Promise<AwsCredentialIdentity> {
    console.log('Using development SSO credential resolution');
    
    if (config.profile) {
      // Use AWS profile
      const credentialProvider = fromIni({
        profile: config.profile,
        clientConfig: { region: config.region },
      });
      return await credentialProvider();
    } else if (config.ssoStartUrl) {
      // Use direct SSO configuration
      const credentialProvider = fromSSO({
        ssoStartUrl: config.ssoStartUrl,
        ssoRegion: config.ssoRegion!,
        ssoAccountId: config.ssoAccountId,
        ssoRoleName: config.ssoRoleName,
        clientConfig: { region: config.region },
      });
      return await credentialProvider();
    } else {
      throw new Error('SSO configuration requires either profile or SSO details');
    }
  }

  /**
   * Fallback credential resolution
   */
  private async getFallbackCredentials(config: AWSCredentialConfig): Promise<AwsCredentialIdentity> {
    console.log('Using fallback credential resolution');
    
    // Try static credentials first if provided
    if (config.accessKeyId && config.secretAccessKey) {
      return {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      };
    }
    
    // Otherwise use default AWS credential chain
    const credentialProvider = fromNodeProviderChain({
      clientConfig: { region: config.region },
    });
    
    return await credentialProvider();
  }

  /**
   * Validate credentials by making a test AWS API call
   */
  private async validateCredentials(credentials: AwsCredentialIdentity, region: string): Promise<void> {
    try {
      const stsClient = new STSClient({
        region,
        credentials,
      });
      
      await stsClient.send(new GetCallerIdentityCommand({}));
      console.log('AWS credentials validated successfully');
    } catch (error) {
      throw new Error(`Credential validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if running inside a container
   */
  private isRunningInContainer(): boolean {
    try {
      // Check for container-specific files
      return fs.existsSync('/.dockerenv') || 
             fs.existsSync('/proc/1/cgroup') && 
             fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
    } catch {
      return false;
    }
  }

  /**
   * Check if running in AWS ECS
   */
  private async isRunningInECS(): Promise<boolean> {
    try {
      // ECS sets these environment variables
      return !!(process.env.AWS_EXECUTION_ENV?.includes('ECS') || 
                process.env.ECS_CONTAINER_METADATA_URI ||
                process.env.ECS_CONTAINER_METADATA_URI_V4);
    } catch {
      return false;
    }
  }

  /**
   * Check if running in AWS EKS
   */
  private async isRunningInEKS(): Promise<boolean> {
    try {
      // EKS typically has service account token mounted
      return fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token') &&
             !!(process.env.KUBERNETES_SERVICE_HOST);
    } catch {
      return false;
    }
  }

  /**
   * Check if AWS CLI is available
   */
  private async isAwsCliAvailable(): Promise<boolean> {
    try {
      await execAsync('aws --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if IAM role is attached to the instance/container
   */
  private async hasIamRoleAttached(): Promise<boolean> {
    try {
      // Try to access instance metadata service with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      const response = await fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/', {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Legacy method for development environments - initiate SSO login
   */
  public async initiateSSORLogin(profile?: string): Promise<void> {
    const env = await this.detectEnvironment();
    
    if (!env.hasAwsCli) {
      throw new Error('AWS CLI is not available. In production, use IAM roles instead of SSO.');
    }
    
    if (env.isContainer) {
      throw new Error('SSO login is not supported in container environments. Use IAM roles for production.');
    }

    const command = profile ? `aws sso login --profile ${profile}` : 'aws sso login';
    console.log(`Executing: ${command}`);

    try {
      const { stdout } = await execAsync(command);
      console.log('AWS SSO login successful:', stdout);
    } catch (error) {
      console.error('AWS SSO login failed:', error);
      throw new Error(`AWS SSO login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if credentials are available and valid
   */
  public async checkCredentialStatus(config: AWSCredentialConfig): Promise<{
    available: boolean;
    method: string;
    identity?: any;
    error?: string;
  }> {
    try {
      const credentials = await this.getCredentials(config);
      const env = await this.detectEnvironment();
      
      // Test credentials
      const stsClient = new STSClient({
        region: config.region,
        credentials,
      });
      
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      
      let method = 'unknown';
      if (env.isECS) method = 'ECS Task Role';
      else if (env.isEKS) method = 'EKS Service Account';
      else if (env.hasIamRole) method = 'EC2 Instance Profile';
      else if (config.authType === 'sso') method = 'AWS SSO';
      else if (config.accessKeyId) method = 'Static Credentials';
      else method = 'Default Credential Chain';
      
      return {
        available: true,
        method,
        identity: {
          Account: identity.Account,
          Arn: identity.Arn,
          UserId: identity.UserId,
        },
      };
    } catch (error) {
      return {
        available: false,
        method: 'none',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available AWS profiles (development only)
   */
  public async getAvailableProfiles(): Promise<string[]> {
    const env = await this.detectEnvironment();
    
    if (env.isContainer) {
      return []; // No profiles in container environments
    }

    try {
      const configPath = path.join(os.homedir(), '.aws', 'config');
      if (!fs.existsSync(configPath)) {
        return [];
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      const profiles: string[] = [];
      const lines = configContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('[default]')) {
          profiles.push('default');
        } else if (trimmedLine.startsWith('[profile ')) {
          const profileName = trimmedLine.slice(9, -1).trim();
          profiles.push(profileName);
        }
      }

      return profiles;
    } catch (error) {
      console.error('Failed to read AWS config:', error);
      return [];
    }
  }
}

export const awsCredentialService = AWSCredentialService.getInstance();
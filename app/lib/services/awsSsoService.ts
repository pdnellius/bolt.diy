import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface AWSSSOConfig {
  ssoStartUrl: string;
  ssoRegion: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  region: string;
  profile?: string;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export class AWSSSOService {
  private static instance: AWSSSOService;

  private constructor() {}

  public static getInstance(): AWSSSOService {
    if (!AWSSSOService.instance) {
      AWSSSOService.instance = new AWSSSOService();
    }
    return AWSSSOService.instance;
  }

  /**
   * Check if AWS CLI is installed and available
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
   * Check if user is already logged in via AWS SSO
   */
  public async isSSOSessionActive(profile?: string): Promise<boolean> {
    try {
      if (!await this.isAwsCliAvailable()) {
        throw new Error('AWS CLI is not installed or not available in PATH');
      }

      const command = profile ? `aws sts get-caller-identity --profile ${profile}` : 'aws sts get-caller-identity';
      await execAsync(command);
      return true;
    } catch (error) {
      console.warn('SSO session not active:', error);
      return false;
    }
  }

  /**
   * Initiate AWS SSO login using AWS CLI
   */
  public async loginSSO(profile?: string): Promise<void> {
    try {
      if (!await this.isAwsCliAvailable()) {
        throw new Error('AWS CLI is not installed or not available in PATH. Please install AWS CLI first.');
      }

      const command = profile ? `aws sso login --profile ${profile}` : 'aws sso login';
      console.log(`Executing: ${command}`);
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && stderr.includes('error')) {
        throw new Error(`AWS SSO login failed: ${stderr}`);
      }
      
      console.log('AWS SSO login successful:', stdout);
    } catch (error) {
      console.error('AWS SSO login failed:', error);
      throw new Error(`AWS SSO login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get AWS credentials from SSO session
   */
  public async getSSOCredentials(config: AWSSSOConfig): Promise<AWSCredentials> {
    try {
      let credentialProvider;

      if (config.profile) {
        // Use profile-based credential provider
        credentialProvider = fromIni({
          profile: config.profile,
        });
      } else {
        // Use direct SSO credential provider
        credentialProvider = fromSSO({
          ssoStartUrl: config.ssoStartUrl,
          ssoRegion: config.ssoRegion,
          ssoAccountId: config.ssoAccountId,
          ssoRoleName: config.ssoRoleName,
        });
      }

      const credentials: AwsCredentialIdentity = await credentialProvider();

      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        region: config.region,
      };
    } catch (error) {
      console.error('Failed to get SSO credentials:', error);
      throw new Error(`Failed to get SSO credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get AWS config from AWS config file
   */
  public async getAWSConfig(profile: string = 'default'): Promise<AWSSSOConfig | null> {
    try {
      const configPath = path.join(os.homedir(), '.aws', 'config');
      
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const configContent = fs.readFileSync(configPath, 'utf-8');
      const profileSection = profile === 'default' ? '[default]' : `[profile ${profile}]`;
      
      const lines = configContent.split('\n');
      let inTargetProfile = false;
      const config: Partial<AWSSSOConfig> = {};

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === profileSection) {
          inTargetProfile = true;
          continue;
        }
        
        if (trimmedLine.startsWith('[') && inTargetProfile) {
          break;
        }
        
        if (inTargetProfile && trimmedLine.includes('=')) {
          const [key, value] = trimmedLine.split('=').map((s: string) => s.trim());
          
          switch (key) {
            case 'sso_start_url':
              config.ssoStartUrl = value;
              break;
            case 'sso_region':
              config.ssoRegion = value;
              break;
            case 'sso_account_id':
              config.ssoAccountId = value;
              break;
            case 'sso_role_name':
              config.ssoRoleName = value;
              break;
            case 'region':
              config.region = value;
              break;
          }
        }
      }

      if (config.ssoStartUrl && config.ssoRegion && config.region) {
        return {
          ...config,
          profile,
        } as AWSSSOConfig;
      }

      return null;
    } catch (error) {
      console.error('Failed to read AWS config:', error);
      return null;
    }
  }

  /**
   * List available AWS profiles
   */
  public async getAvailableProfiles(): Promise<string[]> {
    try {
      const configPath = path.join(os.homedir(), '.aws', 'config');
      
      if (!fs.existsSync(configPath)) {
        return [];
      }

      const configContent = fs.readFileSync(configPath, 'utf-8');
      const lines = configContent.split('\n');
      const profiles: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === '[default]') {
          profiles.push('default');
        } else if (trimmedLine.startsWith('[profile ') && trimmedLine.endsWith(']')) {
          const profileName = trimmedLine.slice(9, -1);
          profiles.push(profileName);
        }
      }

      return profiles;
    } catch (error) {
      console.error('Failed to get available profiles:', error);
      return [];
    }
  }
}

export const awsSsoService = AWSSSOService.getInstance();
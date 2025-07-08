import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

interface AWSProfile {
  name: string;
}

interface AWSBedrockSettingsProps {
  onConfigChange: (config: any) => void;
  currentConfig?: any;
}

interface ProfilesResponse {
  profiles: string[];
  message: string;
}

interface StatusResponse {
  isActive: boolean;
  message: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export function AWSBedrockSettings({ onConfigChange, currentConfig }: AWSBedrockSettingsProps) {
  const [authType, setAuthType] = useState<'static' | 'sso'>('static');
  const [profiles, setProfiles] = useState<AWSProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [ssoStartUrl, setSsoStartUrl] = useState('');
  const [ssoRegion, setSsoRegion] = useState('us-east-1');
  const [ssoAccountId, setSsoAccountId] = useState('');
  const [ssoRoleName, setSsoRoleName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ssoSessionActive, setSsoSessionActive] = useState(false);

  // Load current configuration
  useEffect(() => {
    if (currentConfig) {
      try {
        const config = typeof currentConfig === 'string' ? JSON.parse(currentConfig) : currentConfig;
        if (config.authType === 'sso') {
          setAuthType('sso');
          setSelectedProfile(config.profile || '');
          setRegion(config.region || 'us-east-1');
          setSsoStartUrl(config.ssoStartUrl || '');
          setSsoRegion(config.ssoRegion || 'us-east-1');
          setSsoAccountId(config.ssoAccountId || '');
          setSsoRoleName(config.ssoRoleName || '');
        } else {
          setAuthType('static');
        }
      } catch (error) {
        console.error('Failed to parse current config:', error);
      }
    }
  }, [currentConfig]);

  // Load available AWS profiles
  useEffect(() => {
    if (authType === 'sso') {
      loadProfiles();
      checkSSOStatus();
    }
  }, [authType]);

  const loadProfiles = async () => {
    try {
      const response = await fetch('/api/aws-sso/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data: ProfilesResponse = await response.json();
      
      if (data.profiles) {
        setProfiles(data.profiles.map((name: string) => ({ name })));
      }
    } catch (error) {
      console.error('Failed to load AWS profiles:', error);
      toast.error('Failed to load AWS profiles');
    }
  };

  const checkSSOStatus = async () => {
    try {
      const response = await fetch('/api/aws-sso/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: selectedProfile }),
      });
      const data: StatusResponse = await response.json();
      setSsoSessionActive(data.isActive);
    } catch (error) {
      console.error('Failed to check SSO status:', error);
    }
  };

  const handleSSOLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/aws-sso/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: selectedProfile }),
      });
      
      const data: LoginResponse = await response.json();
      
      if (data.success) {
        toast.success('AWS SSO login initiated successfully');
        setSsoSessionActive(true);
      } else {
        toast.error(data.error || 'Failed to initiate AWS SSO login');
      }
    } catch (error) {
      console.error('SSO login failed:', error);
      toast.error('Failed to initiate AWS SSO login');
    } finally {
      setIsLoading(false);
    }
  };

  const generateConfig = () => {
    if (authType === 'sso') {
      const config = {
        authType: 'sso',
        region,
        ...(selectedProfile && { profile: selectedProfile }),
        ...(!selectedProfile && {
          ssoStartUrl,
          ssoRegion,
          ssoAccountId,
          ssoRoleName,
        }),
      };
      return JSON.stringify(config, null, 2);
    }
    return '';
  };

  const handleConfigChange = () => {
    const config = generateConfig();
    onConfigChange(config);
  };

  useEffect(() => {
    if (authType === 'sso') {
      handleConfigChange();
    }
  }, [authType, selectedProfile, region, ssoStartUrl, ssoRegion, ssoAccountId, ssoRoleName]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">
          AWS Bedrock Authentication
        </h3>
        
        <div className="space-y-4">
          {/* Authentication Type Selection */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
              Authentication Type
            </label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as 'static' | 'sso')}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
            >
              <option value="static">Static Credentials (JSON)</option>
              <option value="sso">AWS SSO</option>
            </select>
          </div>

          {authType === 'static' && (
            <div className="bg-bolt-elements-background-depth-1 p-4 rounded-md">
              <p className="text-sm text-bolt-elements-textSecondary mb-2">
                For static credentials, provide a JSON configuration with your AWS access keys:
              </p>
              <pre className="text-xs bg-bolt-elements-background-depth-2 p-2 rounded text-bolt-elements-textPrimary overflow-x-auto">
{`{
  "region": "us-east-1",
  "accessKeyId": "your-access-key",
  "secretAccessKey": "your-secret-key",
  "sessionToken": "optional-session-token"
}`}
              </pre>
            </div>
          )}

          {authType === 'sso' && (
            <div className="space-y-4">
              {/* SSO Session Status */}
              <div className="bg-bolt-elements-background-depth-1 p-4 rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-bolt-elements-textPrimary">
                      SSO Session Status
                    </p>
                    <p className={`text-sm ${ssoSessionActive ? 'text-green-500' : 'text-red-500'}`}>
                      {ssoSessionActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <button
                    onClick={handleSSOLogin}
                    disabled={isLoading}
                    className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
                  >
                    {isLoading ? 'Logging in...' : 'AWS SSO Login'}
                  </button>
                </div>
              </div>

              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  AWS Region
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="us-east-1"
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                />
              </div>

              {/* Profile Selection */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  AWS Profile (Optional)
                </label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                >
                  <option value="">Select a profile or configure manually</option>
                  {profiles.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedProfile && (
                <div className="space-y-4">
                  <p className="text-sm text-bolt-elements-textSecondary">
                    Manual SSO Configuration (if not using a profile):
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      SSO Start URL
                    </label>
                    <input
                      type="text"
                      value={ssoStartUrl}
                      onChange={(e) => setSsoStartUrl(e.target.value)}
                      placeholder="https://your-sso-portal.awsapps.com/start"
                      className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      SSO Region
                    </label>
                    <input
                      type="text"
                      value={ssoRegion}
                      onChange={(e) => setSsoRegion(e.target.value)}
                      placeholder="us-east-1"
                      className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      SSO Account ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={ssoAccountId}
                      onChange={(e) => setSsoAccountId(e.target.value)}
                      placeholder="123456789012"
                      className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      SSO Role Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={ssoRoleName}
                      onChange={(e) => setSsoRoleName(e.target.value)}
                      placeholder="YourRoleName"
                      className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
                    />
                  </div>
                </div>
              )}

              {/* Generated Configuration Preview */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Generated Configuration
                </label>
                <pre className="text-xs bg-bolt-elements-background-depth-2 p-2 rounded text-bolt-elements-textPrimary overflow-x-auto">
                  {generateConfig()}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
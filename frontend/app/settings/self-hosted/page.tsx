'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Shield, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';

interface SelfHostedStatus {
  self_hosted_mode: boolean;
  license_valid: boolean;
  license_key_hash?: string;
  message: string;
}

export default function SelfHostedSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<SelfHostedStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadStatus();
  }, [router]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const { selfHostedAPI } = await import('@/lib/api');
      const data = await selfHostedAPI.getStatus();
      setStatus(data);
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to load self-hosted status',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLicense = async () => {
    if (!licenseKey.trim()) {
      toast.showToast('Please enter a license key', 'error');
      return;
    }

    try {
      setVerifying(true);
      const { selfHostedAPI } = await import('@/lib/api');
      const result = await selfHostedAPI.verifyLicense(licenseKey);
      
      if (result.valid) {
        toast.showToast('License key is valid', 'success');
        loadStatus();
      } else {
        toast.showToast(result.message || 'Invalid license key', 'error');
      }
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to verify license',
        'error',
      );
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ag-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Self-hosted Settings</h1>
        <p className="text-slate-400">Configure AgentGuard for on-premise deployment (Enterprise only)</p>
      </div>

      {/* Status Card */}
      {status && (
        <div className="bg-dark-card rounded-lg border border-dark-border p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-ag-accent" />
              <div>
                <h2 className="text-xl font-semibold text-white">Self-hosted Status</h2>
                <p className="text-sm text-slate-400 mt-1">{status.message}</p>
              </div>
            </div>
            {status.license_valid ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-slate-400">Self-hosted Mode</p>
              <p className="text-lg font-semibold text-white">
                {status.self_hosted_mode ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">License Status</p>
              <p className={`text-lg font-semibold ${status.license_valid ? 'text-green-400' : 'text-red-400'}`}>
                {status.license_valid ? 'Valid' : 'Invalid'}
              </p>
            </div>
          </div>

          {status.license_key_hash && (
            <div className="mt-4 pt-4 border-t border-dark-border">
              <p className="text-sm text-slate-400">License Key Hash</p>
              <code className="text-xs bg-dark-bg px-2 py-1 rounded text-slate-300 mt-1">
                {status.license_key_hash}
              </code>
            </div>
          )}
        </div>
      )}

      {/* License Verification */}
      <div className="bg-dark-card rounded-lg border border-dark-border p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">Verify License Key</h2>
        <p className="text-slate-400 text-sm mb-4">
          Enter your Enterprise license key to verify it&apos;s valid for self-hosted deployment.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">License Key</label>
            <Input
              type="password"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="AGENTGUARD-ENTERPRISE-..."
              className="font-mono"
            />
          </div>

          <Button
            onClick={handleVerifyLicense}
            disabled={verifying || !licenseKey.trim()}
            className="w-full"
          >
            {verifying ? 'Verifying...' : 'Verify License'}
          </Button>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="bg-dark-card rounded-lg border border-dark-border p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Setup Guide</h2>
            <p className="text-slate-400 text-sm mb-4">
              Follow the self-hosted setup guide to deploy AgentGuard on your infrastructure.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href="/docs/guides/SELF_HOSTED_SETUP.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-ag-accent hover:text-ag-accentLight transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>View Setup Guide</span>
          </a>
          <a
            href="mailto:enterprise@agentguard.ai"
            className="flex items-center gap-2 text-ag-accent hover:text-ag-accentLight transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Contact Enterprise Support</span>
          </a>
        </div>

        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-sm text-yellow-400">
            <strong>Note:</strong> Self-hosted deployment requires an Enterprise license. 
            Contact sales@agentguard.ai for licensing information.
          </p>
        </div>
      </div>
    </div>
  );
}

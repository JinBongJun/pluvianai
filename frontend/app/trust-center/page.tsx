'use client';

import { useState, useEffect } from 'react';
import { Shield, Lock, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ToastContainer';

interface SecurityPolicies {
  data_encryption: {
    at_rest: string;
    in_transit: string;
    key_management: string;
  };
  access_control: {
    authentication: string;
    authorization: string;
    api_keys: string;
  };
  data_retention: {
    free: string;
    pro: string;
    enterprise: string;
    auto_archiving: string;
  };
  compliance: {
    gdpr: string;
    ccpa: string;
    soc2: string;
  };
}

interface ComplianceStatus {
  gdpr: {
    status: string;
    data_processing_agreement: string;
    right_to_erasure: string;
    data_portability: string;
  };
  soc2: {
    status: string;
    type1_target: string;
    type2_target: string;
    current_phase: string;
  };
  ccpa: {
    status: string;
    data_sale: string;
    opt_out: string;
  };
}

export default function TrustCenterPage() {
  const toast = useToast();
  const [policies, setPolicies] = useState<SecurityPolicies | null>(null);
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrustCenterData();
  }, []);

  const loadTrustCenterData = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const [policiesRes, complianceRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/trust-center/policies`),
        fetch(`${API_URL}/api/v1/trust-center/compliance`),
      ]);

      if (policiesRes.ok) {
        const policiesData = await policiesRes.json();
        setPolicies(policiesData.data || policiesData);
      }

      if (complianceRes.ok) {
        const complianceData = await complianceRes.json();
        setCompliance(complianceData.data || complianceData);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load trust center data:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
      toast.showToast('Failed to load trust center data', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ag-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent mx-auto mb-4"></div>
          <p className="text-ag-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ag-bg text-ag-text">
      {/* Header */}
      <header className="border-b border-white/10 bg-ag-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center">
                <span className="text-ag-accent-light font-bold text-sm">AG</span>
              </div>
              <span className="text-ag-text font-semibold">AgentGuard</span>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-ag-primary to-ag-primaryHover mb-4">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-ag-text mb-4">Trust Center</h1>
          <p className="text-xl text-ag-muted max-w-2xl mx-auto">
            Transparency in security, compliance, and data protection
          </p>
        </div>

        {/* Security Policies */}
        {policies && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-ag-text mb-6 flex items-center gap-2">
              <Lock className="h-6 w-6 text-ag-accent" />
              Security Policies
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-ag-surface border border-white/10 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-ag-text mb-4">Data Encryption</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-ag-muted">At Rest</dt>
                    <dd className="text-ag-text font-medium">{policies.data_encryption.at_rest}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">In Transit</dt>
                    <dd className="text-ag-text font-medium">{policies.data_encryption.in_transit}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">Key Management</dt>
                    <dd className="text-ag-text font-medium">{policies.data_encryption.key_management}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-ag-surface border border-white/10 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-ag-text mb-4">Access Control</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-ag-muted">Authentication</dt>
                    <dd className="text-ag-text font-medium">{policies.access_control.authentication}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">Authorization</dt>
                    <dd className="text-ag-text font-medium">{policies.access_control.authorization}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">API Keys</dt>
                    <dd className="text-ag-text font-medium">{policies.access_control.api_keys}</dd>
                  </div>
                </dl>
              </div>

              <div className="bg-ag-surface border border-white/10 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-ag-text mb-4">Data Retention</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-ag-muted">Free Plan</dt>
                    <dd className="text-ag-text font-medium">{policies.data_retention.free}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">Pro Plan</dt>
                    <dd className="text-ag-text font-medium">{policies.data_retention.pro}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">Enterprise Plan</dt>
                    <dd className="text-ag-text font-medium">{policies.data_retention.enterprise}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ag-muted">Auto-Archiving</dt>
                    <dd className="text-ag-text font-medium">{policies.data_retention.auto_archiving}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* Compliance Status */}
        {compliance && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-ag-text mb-6 flex items-center gap-2">
              <FileText className="h-6 w-6 text-ag-accent" />
              Compliance Status
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {/* GDPR */}
              <div className="bg-ag-surface border border-white/10 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  {compliance.gdpr.status === 'Compliant' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <h3 className="text-lg font-semibold text-white">GDPR</h3>
                </div>
                <p className="text-sm text-slate-400 mb-4">{compliance.gdpr.status}</p>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li>• {compliance.gdpr.data_processing_agreement}</li>
                  <li>• {compliance.gdpr.right_to_erasure}</li>
                  <li>• {compliance.gdpr.data_portability}</li>
                </ul>
              </div>

              {/* SOC2 */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold text-white">SOC2</h3>
                </div>
                <p className="text-sm text-slate-400 mb-4">{compliance.soc2.status}</p>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li>• Type 1 Target: {compliance.soc2.type1_target}</li>
                  <li>• Type 2 Target: {compliance.soc2.type2_target}</li>
                  <li>• Current Phase: {compliance.soc2.current_phase}</li>
                </ul>
              </div>

              {/* CCPA */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <h3 className="text-lg font-semibold text-white">CCPA</h3>
                </div>
                <p className="text-sm text-slate-400 mb-4">{compliance.ccpa.status}</p>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li>• {compliance.ccpa.data_sale}</li>
                  <li>• {compliance.ccpa.opt_out}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Data Ownership */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">Data Ownership</h2>
          <p className="text-slate-300 mb-4">
            Your data is yours. We believe in complete transparency and user control over their data.
          </p>
          <ul className="space-y-2 text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Export your data anytime in JSON or CSV format</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Delete your data at any time</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>We never sell your data to third parties</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>PII is automatically sanitized before storage</span>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div className="text-center">
          <p className="text-slate-400 mb-4">
            Questions about security or compliance?
          </p>
          <a
            href="mailto:security@agentguard.ai"
            className="text-ag-accent hover:text-ag-accentLight transition-colors"
          >
            security@agentguard.ai
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-ag-surface mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} AgentGuard. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/trust-center" className="text-ag-accent font-medium">
                Trust Center
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

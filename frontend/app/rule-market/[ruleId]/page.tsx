'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import RuleMarketDetail from '@/components/rule-market/RuleMarketDetail';

export default function RuleMarketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ruleId = Number(Array.isArray(params?.ruleId) ? params.ruleId[0] : params?.ruleId);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    // Rule Market is public, but we check token for authenticated features
  }, []);

  if (!ruleId || isNaN(ruleId)) {
    return null;
  }

  const handleDownload = (ruleId: number, projectId: number) => {
    // Redirect to firewall page after download
    router.push(`/organizations/${projectId}/projects/${projectId}/firewall`);
  };

  return (
    <div className="min-h-screen bg-ag-bg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Rule Market
          </button>
        </div>

        <RuleMarketDetail ruleId={ruleId} onDownload={handleDownload} />
      </div>
    </div>
  );
}

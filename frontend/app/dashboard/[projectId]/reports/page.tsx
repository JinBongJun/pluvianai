'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { reportsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { FileText, Download, Calendar } from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState('standard');
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date;
    })(),
    to: new Date(),
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
  }, [router]);

  const handleGenerate = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.showToast('Please select a date range', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await reportsAPI.generate(projectId, {
        template,
        date_from: dateRange.from.toISOString(),
        date_to: dateRange.to.toISOString(),
      });
      setReport(data);
    } catch (error: any) {
      console.error('Failed to generate report:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'pdf') => {
    if (!dateRange.from || !dateRange.to) {
      toast.showToast('Please select a date range', 'warning');
      return;
    }

    try {
      await reportsAPI.download(projectId, {
        template,
        format,
        date_from: dateRange.from.toISOString(),
        date_to: dateRange.to.toISOString(),
      });
      toast.showToast('Report downloaded successfully', 'success');
    } catch (error: any) {
      console.error('Failed to download report:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to download report', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
            <p className="text-gray-600 mt-1">Generate and download project reports</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push(`/dashboard/${projectId}`)}
          >
            Back to Project
          </Button>
        </div>

        {/* Report Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template
              </label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
              >
                <option value="standard">Standard Report</option>
                <option value="detailed">Detailed Report</option>
                <option value="executive">Executive Summary</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Range
              </label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
              {report && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('json')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('pdf')}
                    className="flex items-center gap-2"
                    disabled
                  >
                    <Download className="h-4 w-4" />
                    Download PDF (Coming Soon)
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Report Display */}
        {report && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Report Preview</h2>
              <div className="text-sm text-gray-500">
                Generated: {new Date(report.generated_at).toLocaleString()}
              </div>
            </div>

            <div className="space-y-6">
              {/* Summary */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 mb-3">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Total API Calls</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {report.summary.total_api_calls.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Success Rate</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {report.summary.success_rate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Total Cost</div>
                    <div className="text-2xl font-bold text-gray-900">
                      ${report.summary.total_cost.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Avg Quality</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {report.summary.quality_scores.average
                        ? report.summary.quality_scores.average.toFixed(1)
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quality Scores */}
              {report.summary.quality_scores.total_evaluations > 0 && (
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Quality Scores</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Average</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {report.summary.quality_scores.average?.toFixed(1) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Min</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {report.summary.quality_scores.min?.toFixed(1) || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Max</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {report.summary.quality_scores.max?.toFixed(1) || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Drift Detections */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 mb-3">Drift Detections</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Total Detections</div>
                    <div className="text-xl font-bold text-gray-900">
                      {report.summary.drift_detections.total}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">High Severity</div>
                    <div className="text-xl font-bold text-gray-900">
                      {report.summary.drift_detections.high_severity}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

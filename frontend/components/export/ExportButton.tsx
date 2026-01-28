'use client';

import { useState } from 'react';
import { Download, FileText, FileJson } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { exportAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { FilterState } from '@/components/filters/FilterPanel';
import posthog from 'posthog-js';

interface ExportButtonProps {
  projectId: number;
  filters?: FilterState;
  className?: string;
}

export default function ExportButton({ projectId, filters, className }: ExportButtonProps) {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeData, setIncludeData] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      // CSV export returns streaming response, so we track start
      posthog.capture('export_started', { format: 'csv', project_id: projectId });
      
      await exportAPI.exportCSV(projectId, filters);
      
      // Track export completion (CSV is streaming, so completion is immediate)
      posthog.capture('export_completed', {
        format: 'csv',
        project_id: projectId,
      });
      
      toast.showToast('CSV export started', 'success');
      setShowModal(false);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to export CSV:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, format: 'csv' } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to export CSV', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const result = await exportAPI.exportJSON(projectId, filters, includeData);
      
      // Track export completion event
      posthog.capture('export_completed', {
        format: 'json',
        project_id: projectId,
        include_data: includeData,
        total_records: (result as any)?.total_records || 0,
      });
      
      posthog.capture('export_started', { format: 'json', include_data: includeData });
      toast.showToast('JSON export started', 'success');
      setShowModal(false);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to export JSON:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, format: 'json', includeData } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to export JSON', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-2 ${className}`}
      >
        <Download className="h-4 w-4" />
        Export
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Export Data"
      >
        <div className="space-y-4">
          <p className="text-sm text-ag-muted">
            Choose a format to export your API calls data.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-4 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <div className="p-2 bg-white/5 rounded-lg">
                <FileText className="h-5 w-5 text-sky-400" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-ag-text">Export as CSV</div>
                <div className="text-sm text-ag-muted">Comma-separated values, easy to open in Excel</div>
              </div>
            </button>

            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-4 border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <div className="p-2 bg-white/5 rounded-lg">
                <FileJson className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-ag-text">Export as JSON</div>
                <div className="text-sm text-ag-muted">Structured data format, includes metadata</div>
              </div>
            </button>
          </div>

          <div className="pt-4 border-t border-white/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeData}
                onChange={(e) => setIncludeData(e.target.checked)}
                className="h-4 w-4 text-ag-accent focus:ring-ag-accent border-white/20 rounded"
              />
              <span className="text-sm text-ag-muted">
                Include full request/response data (JSON only, larger file size)
              </span>
            </label>
          </div>

          {exporting && (
            <div className="text-sm text-ag-muted text-center py-2">
              Exporting... This may take a moment.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

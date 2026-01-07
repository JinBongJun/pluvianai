'use client';

import { useState } from 'react';
import { Download, FileText, FileJson } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { exportAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { FilterState } from '@/components/filters/FilterPanel';

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
      await exportAPI.exportCSV(projectId, filters);
      toast.showToast('CSV export started', 'success');
      setShowModal(false);
    } catch (error: any) {
      console.error('Failed to export CSV:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to export CSV', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    try {
      await exportAPI.exportJSON(projectId, filters, includeData);
      toast.showToast('JSON export started', 'success');
      setShowModal(false);
    } catch (error: any) {
      console.error('Failed to export JSON:', error);
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
          <p className="text-sm text-gray-600">
            Choose a format to export your API calls data.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">Export as CSV</div>
                <div className="text-sm text-gray-600">Comma-separated values, easy to open in Excel</div>
              </div>
            </button>

            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <div className="p-2 bg-green-50 rounded-lg">
                <FileJson className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">Export as JSON</div>
                <div className="text-sm text-gray-600">Structured data format, includes metadata</div>
              </div>
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeData}
                onChange={(e) => setIncludeData(e.target.checked)}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                Include full request/response data (JSON only, larger file size)
              </span>
            </label>
          </div>

          {exporting && (
            <div className="text-sm text-gray-600 text-center py-2">
              Exporting... This may take a moment.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}


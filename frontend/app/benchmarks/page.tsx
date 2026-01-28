'use client';

import BenchmarkList from '@/components/benchmarks/BenchmarkList';

export default function BenchmarksPage() {
  return (
    <div className="min-h-screen bg-ag-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Public Benchmarks</h1>
          <p className="text-slate-400">
            Compare AI model performance across different tasks and datasets
          </p>
        </div>

        <BenchmarkList />
      </div>
    </div>
  );
}

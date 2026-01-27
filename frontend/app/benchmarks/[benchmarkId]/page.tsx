'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import BenchmarkDetail from '@/components/benchmarks/BenchmarkDetail';

export default function BenchmarkDetailPage() {
  const router = useRouter();
  const params = useParams();
  const benchmarkId = Number(Array.isArray(params?.benchmarkId) ? params.benchmarkId[0] : params?.benchmarkId);

  if (!benchmarkId || isNaN(benchmarkId)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#000314]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Benchmarks
          </button>
        </div>

        <BenchmarkDetail benchmarkId={benchmarkId} />
      </div>
    </div>
  );
}

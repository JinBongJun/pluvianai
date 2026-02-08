'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0c] text-white p-8">
            <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
                <p className="text-slate-400 mb-6 font-mono text-sm break-all">
                    {error.message || 'An unexpected error occurred'}
                </p>
                <button
                    onClick={reset}
                    className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}

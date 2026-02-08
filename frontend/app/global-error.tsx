'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body className="bg-black text-white flex items-center justify-center min-h-screen">
                <div className="text-center p-8 bg-white/5 border border-white/10 rounded-2xl max-w-md">
                    <h2 className="text-2xl font-bold mb-4">Global Error</h2>
                    <p className="text-slate-400 mb-6 font-mono text-xs break-all">
                        {error.message || 'Fatal system error'}
                    </p>
                    <button
                        onClick={() => reset()}
                        className="px-6 py-2 bg-emerald-500 text-black font-bold rounded-lg"
                    >
                        Retry
                    </button>
                </div>
            </body>
        </html>
    );
}

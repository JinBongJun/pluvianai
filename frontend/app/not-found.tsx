import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0c] text-white p-8">
            <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <h2 className="text-2xl font-bold mb-4">404 - Not Found</h2>
                <p className="text-slate-400 mb-6">
                    The page you are looking for does not exist.
                </p>
                <Link
                    href="/"
                    className="inline-block w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors"
                >
                    Return Home
                </Link>
            </div>
        </div>
    );
}

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-pluvian-border bg-[#0a0a0c]/90 text-pluvian-muted">
      <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm">
        <Link href="/" className="text-white font-semibold tracking-tight hover:text-pluvian-protocol-400 transition-colors">
          PluvianAI
        </Link>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link href="/blog" className="hover:text-pluvian-protocol-400 transition-colors">
            Laboratory
          </Link>
          <Link href="/docs" className="hover:text-pluvian-protocol-400 transition-colors">
            Docs
          </Link>
          <Link href="/terms" className="hover:text-pluvian-protocol-400 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-pluvian-protocol-400 transition-colors">
            Privacy
          </Link>
        </nav>
        <p className="text-xs text-pluvian-muted/80">© {new Date().getFullYear()} PluvianAI</p>
      </div>
    </footer>
  );
}

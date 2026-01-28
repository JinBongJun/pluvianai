'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, ChevronRight, Check, Code2, Zap, Shield, BarChart3, Globe2, Github, Twitter, Linkedin } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function LandingPage() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<'python' | 'node'>('python');

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('access_token');
    if (token) {
      router.push('/organizations');
    }
  }, [router]);

  const pythonCode = `pip install agentguard

import agentguard
agentguard.init(
  api_key="your-api-key",
  project_id=1
)

# That's it! Your OpenAI calls are now monitored.`;

  const nodeCode = `npm install agentguard

import { init } from 'agentguard';
init({
  apiKey: 'your-api-key',
  projectId: 1
});

// That's it! Your OpenAI calls are now monitored.`;

  return (
    <div className="min-h-screen bg-ag-bg text-ag-text">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-ag-bg/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center shadow-lg shadow-ag-primary/40">
                <span className="text-ag-accent-light font-bold text-sm">AG</span>
              </div>
              <span className="font-semibold text-lg">AgentGuard</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-ag-muted hover:text-ag-text transition-colors text-sm font-medium">
                Features
              </Link>
              <Link href="#integrations" className="text-ag-muted hover:text-ag-text transition-colors text-sm font-medium">
                Integrations
              </Link>
              <Link href="#pricing" className="text-ag-muted hover:text-ag-text transition-colors text-sm font-medium">
                Pricing
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/5">
                  Sign in
                </Button>
              </Link>
              <Link href="/login?mode=signup">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-ag-muted hover:text-ag-text"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-ag-surface">
            <div className="px-4 py-4 space-y-4">
              <Link
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-ag-muted hover:text-ag-text transition-colors"
              >
                Features
              </Link>
              <Link
                href="#integrations"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-ag-muted hover:text-ag-text transition-colors"
              >
                Integrations
              </Link>
              <Link
                href="#pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block text-ag-muted hover:text-ag-text transition-colors"
              >
                Pricing
              </Link>
              <div className="flex flex-col gap-2 pt-4">
                <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/5">
                    Sign in
                  </Button>
                </Link>
                <Link href="/login?mode=signup" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto animate-fade-in">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-ag-text via-ag-accentLight to-ag-text bg-clip-text text-transparent animate-scale-in">
              Monitor Your LLM Agents
              <br />
              <span className="bg-gradient-to-r from-ag-accent to-ag-accentLight bg-clip-text text-transparent">
                With Confidence
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-ag-muted mb-8 max-w-2xl mx-auto">
              Track quality, detect drift, analyze costs, and benchmark models—all in one place.
              Zero-config SDK integration.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link href="/login?mode=signup">
                <Button size="lg" className="text-lg px-8 py-6">
                  Get Started Free
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="outline" size="lg" className="text-lg px-8 py-6 border-white/20 text-white hover:bg-white/5">
                  Learn More
                </Button>
              </Link>
            </div>

            {/* Code Snippet */}
            <div className="mt-16 max-w-3xl mx-auto animate-slide-in">
              <div className="bg-ag-surface rounded-2xl border border-white/10 overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-glow-gold hover:border-white/20">
                {/* Code Tabs */}
                <div className="flex border-b border-white/10 bg-ag-surface">
                  <button
                    onClick={() => setCodeTab('python')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${
                      codeTab === 'python'
                        ? 'text-ag-text border-b-2 border-ag-accent bg-ag-accent/10'
                        : 'text-ag-muted hover:text-ag-text hover:bg-white/5'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setCodeTab('node')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${
                      codeTab === 'node'
                        ? 'text-ag-text border-b-2 border-ag-accent bg-ag-accent/10'
                        : 'text-ag-muted hover:text-ag-text hover:bg-white/5'
                    }`}
                  >
                    Node.js
                  </button>
                </div>
                {/* Code Content */}
                <div className="p-6">
                  <pre className="text-sm font-mono text-ag-muted overflow-x-auto">
                    <code>{codeTab === 'python' ? pythonCode : nodeCode}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-ag-bg/60">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Everything You Need</h2>
            <p className="text-xl text-ag-muted max-w-2xl mx-auto">
              Comprehensive monitoring and analytics for your LLM applications
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1: Quality Assurance */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-8 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-gold">
              <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />
              <div className="relative z-10">
                <div className="h-12 w-12 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-ag-primary/40">
                  <Check className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Quality Assurance</h3>
                <p className="text-slate-400 leading-relaxed">
                  Automatic quality scoring with transparency. Track response quality, detect anomalies,
                  and ensure consistent performance across all your agents.
                </p>
              </div>
            </div>

            {/* Feature 2: Drift Detection */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-8 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-emerald">
              <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />
              <div className="relative z-10">
                <div className="h-12 w-12 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-ag-primary/40">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Drift Detection</h3>
                <p className="text-ag-muted leading-relaxed">
                  Real-time detection of model drift. Get alerted when response patterns change,
                  with detailed evidence and before/after comparisons.
                </p>
              </div>
            </div>

            {/* Feature 3: Cost Analysis */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-8 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-gold">
              <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />
              <div className="relative z-10">
                <div className="h-12 w-12 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-ag-primary/40">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Cost Analysis</h3>
                <p className="text-ag-muted leading-relaxed">
                  Track spending across models and projects. Get cost optimization recommendations
                  and detect unexpected cost spikes automatically.
                </p>
              </div>
            </div>

            {/* Feature 4: Model Benchmarking */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-8 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-emerald">
              <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />
              <div className="relative z-10">
                <div className="h-12 w-12 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-ag-primary/40">
                  <Code2 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Model Benchmarking</h3>
                <p className="text-ag-muted leading-relaxed">
                  Compare models side-by-side. Get recommendations for optimal model selection
                  based on your specific use case and requirements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section id="integrations" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Works With Your Stack</h2>
            <p className="text-xl text-ag-muted max-w-2xl mx-auto">
              Seamless integration with popular LLM providers and frameworks
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 items-center justify-items-center">
            {/* OpenAI */}
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-ag-surface hover:border-white/20 transition-all">
              <div className="text-3xl font-bold text-ag-text">OpenAI</div>
              <div className="text-xs text-ag-muted">Native Support</div>
            </div>

            {/* Anthropic */}
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-ag-surface hover:border-white/20 transition-all">
              <div className="text-2xl font-bold text-ag-text">Anthropic</div>
              <div className="text-xs text-ag-muted">Native Support</div>
            </div>

            {/* Google */}
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-ag-surface hover:border-white/20 transition-all">
              <div className="text-2xl font-bold text-ag-text">Google</div>
              <div className="text-xs text-ag-muted">Native Support</div>
            </div>

            {/* Python SDK */}
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-ag-surface hover:border-white/20 transition-all">
              <div className="text-xl font-bold text-ag-text font-mono">Python</div>
              <div className="text-xs text-ag-muted">SDK Available</div>
            </div>

            {/* Node.js SDK */}
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-ag-surface hover:border-white/20 transition-all">
              <div className="text-xl font-bold text-ag-text font-mono">Node.js</div>
              <div className="text-xs text-ag-muted">SDK Available</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-ag-bg/60 to-ag-bg">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-ag-muted mb-8">
            Start monitoring your LLM agents in minutes. No credit card required.
          </p>
          <Link href="/login?mode=signup">
            <Button size="lg" className="text-lg px-8 py-6">
              Get Started Free
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-ag-surface py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 bg-gradient-to-br from-ag-primary to-ag-primaryHover rounded-lg flex items-center justify-center shadow-lg shadow-ag-primary/40">
                  <span className="text-ag-accent-light font-bold text-sm">AG</span>
                </div>
                <span className="font-semibold">AgentGuard</span>
              </div>
              <p className="text-sm text-ag-muted">
                Monitor your LLM agents with confidence.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link href="#features" className="hover:text-white transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#integrations" className="hover:text-white transition-colors">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="https://docs.agentguard.ai" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="https://docs.agentguard.ai/api" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="mailto:support@agentguard.ai" className="hover:text-white transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link href="/about" className="hover:text-white transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <a href="mailto:contact@agentguard.ai" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
            <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} AgentGuard. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/trust-center" className="text-slate-400 hover:text-white transition-colors text-sm">
                Trust Center
              </Link>
              <div className="flex items-center gap-4">
                <a href="https://github.com/agentguard" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="GitHub">
                  <Github className="h-5 w-5" />
                </a>
                <a href="https://twitter.com/agentguard" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="Twitter">
                  <Twitter className="h-5 w-5" />
                </a>
                <a href="https://linkedin.com/company/agentguard" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="LinkedIn">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

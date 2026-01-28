'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { projectsAPI, onboardingAPI } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { CheckCircle, Copy, Terminal, Code, Zap, Play, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ToastContainer';
import clsx from 'clsx';

type Step = 'welcome' | 'agreement' | 'quick-start' | 'playground' | 'complete';

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'node'>('python');
  const [copied, setCopied] = useState(false);
  const [quickStartData, setQuickStartData] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<any>(null);
  const [agreementAccepted, setAgreementAccepted] = useState({
    liability: false,
    terms: false,
    privacy: false,
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    // Check onboarding status
    checkOnboardingStatus();
  }, [router]);

  const checkOnboardingStatus = async () => {
    try {
      const status = await onboardingAPI.getStatus();
      if (status.completed && status.has_project) {
        // User already onboarded, redirect to dashboard
        if (status.project_count > 0) {
          router.push('/dashboard');
        }
      }
    } catch (error) {
      // Ignore errors, continue with onboarding
    }
  };

  const loadQuickStartGuide = async () => {
    try {
      const data = await onboardingAPI.getQuickStart(projectId || undefined);
      setQuickStartData(data);
      setApiKey(data.api_key || '');
      if (data.project_id) {
        setProjectId(data.project_id);
      }
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to load Quick Start guide', 'error');
    }
  };

  const handleSimulateTraffic = async () => {
    if (!projectId) {
      toast.showToast('Please create a project first', 'error');
      return;
    }

    setIsSimulating(true);
    try {
      const result = await onboardingAPI.simulateTraffic(projectId);
      toast.showToast('Virtual traffic generated successfully!', 'success');
      
      // Check if this is first snapshot
      try {
        const celebration = await onboardingAPI.checkFirstSnapshot(projectId);
        if (celebration.is_first) {
          setCelebrationData(celebration);
          setShowCelebration(true);
        }
      } catch (err) {
        // Ignore celebration errors
      }
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to simulate traffic', 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const project = await projectsAPI.create({
        name: projectName,
        description: 'My first AgentGuard project',
        generate_sample_data: false, // We'll use Magic Setup Playground instead
      });
      setProjectId(project.id);
      
      // Check if user has already accepted agreement
      try {
        const status = await onboardingAPI.getStatus();
        if (status.has_agreement) {
          // User already accepted, skip to quick-start
          await loadQuickStartGuide();
          setStep('quick-start');
        } else {
          // Show agreement step
          setStep('agreement');
        }
      } catch (error) {
        // If status check fails, show agreement step
        setStep('agreement');
      }
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to create project', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.showToast('Copied to clipboard!', 'success');
  };

  const installCommands = {
    python: 'pip install agentguard',
    node: 'npm install @agentguard/sdk',
  };

  const initCode = {
    python: `import agentguard

# Initialize AgentGuard (auto-patches OpenAI)
agentguard.init()

# That's it! All OpenAI calls are now monitored
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(...)`,
    node: `import agentguard from '@agentguard/sdk';

// Initialize AgentGuard (auto-patches OpenAI)
agentguard.init();

// That's it! All OpenAI calls are now monitored
import OpenAI from 'openai';
const openai = new OpenAI();
const response = await openai.chat.completions.create({...});`,
  };

  const envVars = `export AGENTGUARD_API_KEY="${apiKey}"
export AGENTGUARD_PROJECT_ID="${projectId}"`;

  // Progress indicator
  const steps = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'agreement', label: 'Agreement' },
    { id: 'quick-start', label: 'Quick Start' },
    { id: 'playground', label: 'Playground' },
    { id: 'complete', label: 'Complete' },
  ];
  const currentStepIndex = steps.findIndex((s) => s.id === step);

  const ProgressBar = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {steps.map((s, index) => (
          <div key={s.id} className="flex-1 flex items-center">
            <div className="flex items-center flex-1">
              <div
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  index <= currentStepIndex
                    ? 'bg-ag-accent text-black'
                    : 'bg-white/10 text-ag-muted'
                )}
              >
                {index < currentStepIndex ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-1 mx-2 transition-colors',
                    index < currentStepIndex ? 'bg-ag-accent' : 'bg-white/10'
                  )}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-ag-muted">
        Step {currentStepIndex + 1} of {steps.length}: {steps[currentStepIndex]?.label}
      </div>
    </div>
  );

  const handleAcceptAgreement = async () => {
    if (!agreementAccepted.liability || !agreementAccepted.terms || !agreementAccepted.privacy) {
      toast.showToast('Please accept all agreements to continue', 'error');
      return;
    }

    try {
      await onboardingAPI.acceptAgreement({
        liability_agreement_accepted: agreementAccepted.liability,
        terms_of_service_accepted: agreementAccepted.terms,
        privacy_policy_accepted: agreementAccepted.privacy,
      });
      
      // Load Quick Start guide
      await loadQuickStartGuide();
      setStep('quick-start');
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to accept agreement', 'error');
    }
  };

  if (step === 'welcome') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <ProgressBar />
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-ag-text mb-4">
              Welcome to AgentGuard!
            </h1>
            <p className="text-xl text-ag-muted mb-8">
              Get started in 60 seconds. Monitor your LLM APIs with zero configuration.
            </p>
          </div>

          <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6 text-ag-text">Create Your First Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ag-text mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="w-full px-4 py-2 bg-ag-bg border border-white/10 rounded-md text-ag-text focus:ring-2 focus:ring-ag-accent focus:border-ag-accent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateProject();
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleCreateProject}
                disabled={!projectName.trim()}
                className="w-full"
              >
                Create Project & Continue
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-ag-surface border border-white/5 rounded-lg">
              <Zap className="h-12 w-12 text-ag-accent mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-ag-text">Zero Config</h3>
              <p className="text-sm text-ag-muted">
                Auto-patches OpenAI SDK. No code changes needed.
              </p>
            </div>
            <div className="text-center p-6 bg-ag-surface border border-white/5 rounded-lg">
              <Code className="h-12 w-12 text-ag-accent mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-ag-text">60 Second Setup</h3>
              <p className="text-sm text-ag-muted">
                Get monitoring in less than a minute.
              </p>
            </div>
            <div className="text-center p-6 bg-ag-surface border border-white/5 rounded-lg">
              <CheckCircle className="h-12 w-12 text-ag-accent mx-auto mb-4" />
              <h3 className="font-semibold mb-2 text-ag-text">Sample Data</h3>
              <p className="text-sm text-ag-muted">
                See your dashboard populated immediately.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'agreement') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <ProgressBar />
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-ag-text mb-2">Terms of Service & Liability Agreement</h1>
            <p className="text-ag-muted">
              Please read and accept the following agreements to continue
            </p>
          </div>

          <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-8 mb-6 space-y-6">
            {/* Liability Agreement */}
            <div className="border-b border-white/10 pb-6">
              <div className="flex items-start gap-4 mb-4">
                <input
                  type="checkbox"
                  id="liability"
                  checked={agreementAccepted.liability}
                  onChange={(e) => setAgreementAccepted({ ...agreementAccepted, liability: e.target.checked })}
                  className="mt-1 w-5 h-5 text-ag-accent bg-ag-bg border-white/20 rounded focus:ring-ag-accent"
                />
                <div className="flex-1">
                  <label htmlFor="liability" className="font-semibold text-lg cursor-pointer text-ag-text">
                    AI Judge Liability Agreement (Required)
                  </label>
                  <div className="mt-2 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                    <p className="text-sm text-amber-300 mb-2">
                      <strong>Important:</strong> AI Judge results are non-deterministic and may not always be accurate.
                    </p>
                    <ul className="text-sm text-amber-200/80 list-disc list-inside space-y-1">
                      <li>AI Judge scores are estimates and may vary between evaluations</li>
                      <li>You are responsible for reviewing and validating AI responses</li>
                      <li>AgentGuard does not guarantee the accuracy of AI Judge evaluations</li>
                      <li>You accept full responsibility for decisions made based on AI Judge results</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms of Service */}
            <div className="border-b border-white/10 pb-6">
              <div className="flex items-start gap-4 mb-4">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreementAccepted.terms}
                  onChange={(e) => setAgreementAccepted({ ...agreementAccepted, terms: e.target.checked })}
                  className="mt-1 w-5 h-5 text-ag-accent bg-ag-bg border-white/20 rounded focus:ring-ag-accent"
                />
                <div className="flex-1">
                  <label htmlFor="terms" className="font-semibold text-lg cursor-pointer text-ag-text">
                    Terms of Service (Required)
                  </label>
                  <p className="text-sm text-ag-muted mt-2">
                    By using AgentGuard, you agree to our Terms of Service. You understand that AgentGuard is a monitoring tool and does not guarantee the accuracy of AI responses.
                  </p>
                </div>
              </div>
            </div>

            {/* Privacy Policy */}
            <div>
              <div className="flex items-start gap-4 mb-4">
                <input
                  type="checkbox"
                  id="privacy"
                  checked={agreementAccepted.privacy}
                  onChange={(e) => setAgreementAccepted({ ...agreementAccepted, privacy: e.target.checked })}
                  className="mt-1 w-5 h-5 text-ag-accent bg-ag-bg border-white/20 rounded focus:ring-ag-accent"
                />
                <div className="flex-1">
                  <label htmlFor="privacy" className="font-semibold text-lg cursor-pointer text-ag-text">
                    Privacy Policy (Required)
                  </label>
                  <p className="text-sm text-ag-muted mt-2">
                    Your data is encrypted and stored securely. You can export or delete your data at any time. See our Privacy Policy for details.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={() => setStep('welcome')} variant="outline" className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleAcceptAgreement}
              disabled={!agreementAccepted.liability || !agreementAccepted.terms || !agreementAccepted.privacy}
              className="flex-1"
            >
              Accept & Continue
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'quick-start') {
    const quickStart = quickStartData || {
      curl_command: '',
      python_code: '',
      node_code: '',
      api_key: apiKey,
      project_id: projectId,
      base_url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    };

    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <ProgressBar />
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-ag-text">Quick Start Guide</h1>
              <div className="flex bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setSelectedLanguage('python')}
                  className={clsx(
                    'px-4 py-2 rounded-md text-sm font-medium transition-all',
                    selectedLanguage === 'python'
                      ? 'bg-ag-primary text-ag-accent-light shadow-sm'
                      : 'text-ag-muted hover:text-ag-text'
                  )}
                >
                  Python
                </button>
                <button
                  onClick={() => setSelectedLanguage('node')}
                  className={clsx(
                    'px-4 py-2 rounded-md text-sm font-medium transition-all',
                    selectedLanguage === 'node'
                      ? 'bg-ag-primary text-ag-accent-light shadow-sm'
                      : 'text-ag-muted hover:text-ag-text'
                  )}
                >
                  Node.js
                </button>
              </div>
            </div>
            <p className="text-ag-muted">Copy and run these commands to get started</p>
          </div>

          <div className="space-y-6">
            <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-6">
              <h2 className="font-semibold text-ag-text mb-4 flex items-center gap-2">
                <Terminal className="h-5 w-5 text-ag-accent" />
                cURL Command
              </h2>
              <div className="bg-ag-bg rounded-lg p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-ag-muted text-xs uppercase tracking-widest font-bold">Terminal</span>
                  <button
                    onClick={() => copyToClipboard(quickStart.curl_command || '')}
                    className="text-ag-muted hover:text-ag-accent transition-colors"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
                <code className="text-emerald-400 text-sm block whitespace-pre-wrap font-mono">
                  {quickStart.curl_command || 'Loading...'}
                </code>
              </div>
            </div>

            <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-6">
              <h2 className="font-semibold text-ag-text mb-4 flex items-center gap-2">
                <Code className="h-5 w-5 text-ag-accent" />
                {selectedLanguage === 'python' ? 'Python' : 'Node.js'} Code
              </h2>
              <div className="bg-ag-bg rounded-lg p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-ag-muted text-xs uppercase tracking-widest font-bold">
                    {selectedLanguage === 'python' ? 'Python' : 'TypeScript'}
                  </span>
                  <button
                    onClick={() => copyToClipboard(
                      selectedLanguage === 'python' ? quickStart.python_code : quickStart.node_code
                    )}
                    className="text-ag-muted hover:text-ag-accent transition-colors"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
                <pre className="text-emerald-400 text-sm overflow-x-auto font-mono">
                  <code>
                    {selectedLanguage === 'python' ? quickStart.python_code : quickStart.node_code}
                  </code>
                </pre>
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <Button onClick={() => setStep('welcome')} variant="outline" className="flex-1">
              Back
            </Button>
            <Button onClick={() => setStep('playground')} className="flex-1">
              Next: Magic Setup Playground
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'playground') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <ProgressBar />
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-ag-text mb-2">Magic Setup Playground</h1>
            <p className="text-ag-muted">
              Generate virtual agent traffic to see AgentGuard in action
            </p>
          </div>

          <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-8 mb-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ag-accent/20 mb-4 text-ag-accent">
                <Play className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-ag-text">Simulate Virtual Traffic</h2>
              <p className="text-ag-muted">
                This will create sample snapshots so you can explore the dashboard immediately
              </p>
            </div>

            <div className="bg-ag-primary/10 border border-ag-primary/30 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-ag-text/90">
                <strong>What happens:</strong> We&apos;ll generate realistic API call snapshots
                that demonstrate AgentGuard&apos;s monitoring capabilities.
              </p>
            </div>

            <Button
              onClick={handleSimulateTraffic}
              disabled={!projectId || isSimulating}
              className="w-full"
              size="lg"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Traffic...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Generate Virtual Traffic
                </>
              )}
            </Button>
          </div>

          <div className="flex gap-4">
            <Button onClick={() => setStep('quick-start')} variant="outline" className="flex-1">
              Back
            </Button>
            <Button onClick={() => setStep('complete')} className="flex-1">
              Skip to Dashboard
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'complete') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <ProgressBar />
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
              <CheckCircle className="h-12 w-12" />
            </div>
            <h1 className="text-4xl font-bold text-ag-text mb-4">You&apos;re All Set!</h1>
            <p className="text-xl text-ag-muted mb-8">
              Your project is ready. Start monitoring your LLM APIs!
            </p>
          </div>

          <div className="bg-ag-surface border border-white/10 rounded-lg shadow-2xl p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6 text-ag-text">What&apos;s Next?</h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-emerald-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-ag-text">View Your Dashboard</h3>
                  <p className="text-sm text-ag-muted">
                    See your project overview and monitoring data
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-emerald-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-ag-text">Make API Calls</h3>
                  <p className="text-sm text-ag-muted">
                      Start using your LLM APIs - they&apos;re automatically monitored
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-emerald-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-ag-text">Explore Features</h3>
                  <p className="text-sm text-ag-muted">
                    Check out drift detection, quality scores, and cost analysis
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={() => router.push(`/dashboard/${projectId}`)}
            className="w-full"
            size="lg"
          >
            Go to Dashboard
          </Button>
        </div>

        {/* Celebration Modal */}
        <Modal
          isOpen={showCelebration}
          onClose={() => setShowCelebration(false)}
          size="md"
        >
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 mb-4 shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-ag-text mb-2">
              🎉 Congratulations!
            </h2>
            <p className="text-ag-muted mb-6">
              You&apos;ve created your first snapshot!
            </p>
            {celebrationData && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-6">
                <p className="text-sm text-emerald-300 font-mono">
                  <strong>Snapshot ID:</strong> {celebrationData.snapshot_id}
                </p>
              </div>
            )}
            <Button
              onClick={() => {
                setShowCelebration(false);
                router.push(`/dashboard/${projectId}`);
              }}
              className="w-full"
            >
              View Dashboard
            </Button>
          </div>
        </Modal>
      </DashboardLayout>
    );
  }

  return null;
}

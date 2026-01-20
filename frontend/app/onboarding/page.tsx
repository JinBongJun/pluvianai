'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { projectsAPI } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { CheckCircle, Copy, Terminal, Code, Zap } from 'lucide-react';
import { useToast } from '@/components/ToastContainer';

type Step = 'welcome' | 'install' | 'configure' | 'test' | 'complete';

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'node'>('python');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
  }, [router]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.showToast('Please enter a project name', 'error');
      return;
    }

    try {
      const project = await projectsAPI.create({
        name: projectName,
        description: 'My first AgentGuard project',
        generate_sample_data: true, // Auto-generate sample data
      });
      setProjectId(project.id);
      
      // Get API key from localStorage or generate
      const storedApiKey = localStorage.getItem('api_key');
      if (storedApiKey) {
        setApiKey(storedApiKey);
      } else {
        // In production, fetch from API
        setApiKey('ag_live_xxxxxxxxxxxxx');
      }
      
      setStep('install');
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

  if (step === 'welcome') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome to AgentGuard!
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Get started in 60 seconds. Monitor your LLM APIs with zero configuration.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6">Create Your First Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <Zap className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Zero Config</h3>
              <p className="text-sm text-gray-600">
                Auto-patches OpenAI SDK. No code changes needed.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <Code className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">60 Second Setup</h3>
              <p className="text-sm text-gray-600">
                Get monitoring in less than a minute.
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-primary-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Sample Data</h3>
              <p className="text-sm text-gray-600">
                See your dashboard populated immediately.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'install') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold">Step 1: Install SDK</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedLanguage('python')}
                  className={`px-4 py-2 rounded-md ${
                    selectedLanguage === 'python'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Python
                </button>
                <button
                  onClick={() => setSelectedLanguage('node')}
                  className={`px-4 py-2 rounded-md ${
                    selectedLanguage === 'node'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Node.js
                </button>
              </div>
            </div>
            <p className="text-gray-600">Install the AgentGuard SDK for your language</p>
          </div>

          <div className="bg-gray-900 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-gray-400">
                <Terminal className="h-5 w-5" />
                <span className="text-sm">Terminal</span>
              </div>
              <button
                onClick={() => copyToClipboard(installCommands[selectedLanguage])}
                className="text-gray-400 hover:text-white"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <code className="text-green-400 text-lg">
              {installCommands[selectedLanguage]}
            </code>
          </div>

          <Button onClick={() => setStep('configure')} className="w-full">
            Next: Configure
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'configure') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Step 2: Configure</h1>
            <p className="text-gray-600">Set environment variables or initialize in code</p>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-semibold mb-4">Option 1: Environment Variables</h2>
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Terminal</span>
                  <button
                    onClick={() => copyToClipboard(envVars)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
                <code className="text-green-400 text-sm block whitespace-pre">
                  {envVars}
                </code>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-semibold mb-4">Option 2: Code Initialization</h2>
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">
                    {selectedLanguage === 'python' ? 'Python' : 'TypeScript'}
                  </span>
                  <button
                    onClick={() => copyToClipboard(initCode[selectedLanguage])}
                    className="text-gray-400 hover:text-white"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
                <pre className="text-green-400 text-sm overflow-x-auto">
                  <code>{initCode[selectedLanguage]}</code>
                </pre>
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <Button onClick={() => setStep('install')} variant="outline" className="flex-1">
              Back
            </Button>
            <Button onClick={() => setStep('test')} className="flex-1">
              Next: Test
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'test') {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Step 3: Test It Out</h1>
            <p className="text-gray-600">Make a test API call to see it in action</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">
                  {selectedLanguage === 'python' ? 'Python' : 'TypeScript'}
                </span>
                <button
                  onClick={() => copyToClipboard(
                    selectedLanguage === 'python'
                      ? `from openai import OpenAI\nclient = OpenAI()\nresponse = client.chat.completions.create(\n    model="gpt-3.5-turbo",\n    messages=[{"role": "user", "content": "Hello!"}]\n)`
                      : `import OpenAI from 'openai';\nconst openai = new OpenAI();\nconst response = await openai.chat.completions.create({\n  model: 'gpt-3.5-turbo',\n  messages: [{ role: 'user', content: 'Hello!' }]\n});`
                  )}
                  className="text-gray-400 hover:text-white"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
              <pre className="text-green-400 text-sm overflow-x-auto">
                <code>
                  {selectedLanguage === 'python'
                    ? `from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)`
                    : `import OpenAI from 'openai';
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }]
});`}
                </code>
              </pre>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> After running this code, check your dashboard to see the API call appear!
            </p>
          </div>

          <div className="flex gap-4">
            <Button onClick={() => setStep('configure')} variant="outline" className="flex-1">
              Back
            </Button>
            <Button onClick={() => setStep('complete')} className="flex-1">
              Complete Setup
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
          <div className="text-center mb-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-gray-900 mb-4">You&apos;re All Set!</h1>
            <p className="text-xl text-gray-600 mb-8">
              Your project is ready. Sample data has been generated to help you explore.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6">What&apos;s Next?</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="font-semibold">View Your Dashboard</h3>
                  <p className="text-sm text-gray-600">
                    See your project overview with sample data
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="font-semibold">Make API Calls</h3>
                    <p className="text-sm text-gray-600">
                      Start using your LLM APIs - they&apos;re automatically monitored
                    </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h3 className="font-semibold">Explore Features</h3>
                  <p className="text-sm text-gray-600">
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
      </DashboardLayout>
    );
  }

  return null;
}

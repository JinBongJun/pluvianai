'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { projectsAPI, adminAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { CheckCircle, ArrowRight, Sparkles, Database, BarChart3 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProjects();
  }, [router]);

  const loadProjects = async () => {
    try {
      const data = await projectsAPI.list();
      setProjects(data);
      if (data.length > 0) {
        setStep(3); // Skip to step 3 if projects exist
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleCreateProject = () => {
    router.push('/dashboard?create=true');
  };

  const handleGenerateSampleData = async () => {
    if (projects.length === 0) {
      toast.showToast('Please create a project first', 'warning');
      return;
    }

    setGenerating(true);
    try {
      await adminAPI.generateSampleData(projects[0].id);
      toast.showToast('Sample data generated successfully!', 'success');
      router.push(`/dashboard/${projects[0].id}`);
    } catch (error: any) {
      console.error('Failed to generate sample data:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to generate sample data', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const steps = [
    {
      title: 'Welcome to AgentGuard',
      description: 'Monitor and optimize your LLM applications',
      icon: <Sparkles className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">
            AgentGuard helps you monitor, analyze, and optimize your LLM applications.
            Let's get you started!
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Track API calls and monitor performance
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Detect drift and quality issues
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Optimize costs and improve reliability
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: 'Create Your First Project',
      description: 'Projects help you organize your LLM applications',
      icon: <Database className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">
            Create a project to start monitoring your LLM API calls. You can create multiple projects
            for different applications or environments.
          </p>
          <Button onClick={handleCreateProject} className="flex items-center gap-2">
            Create Project
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      title: 'Generate Sample Data',
      description: 'See AgentGuard in action with sample data',
      icon: <BarChart3 className="h-8 w-8" />,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600">
            Generate sample API calls, quality scores, drift detections, and alerts to explore
            AgentGuard's features.
          </p>
          <Button
            onClick={handleGenerateSampleData}
            disabled={generating || projects.length === 0}
            className="flex items-center gap-2"
          >
            {generating ? 'Generating...' : 'Generate Sample Data'}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {projects.length === 0 && (
            <p className="text-sm text-gray-500">
              Please create a project first to generate sample data.
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between mb-8">
            {steps.map((s, index) => (
              <div key={index} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index + 1 <= step
                        ? 'bg-black text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {index + 1 < step ? (
                      <CheckCircle className="h-6 w-6" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-2 text-center max-w-[100px]">
                    {s.title}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index + 1 < step ? 'bg-black' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-black text-white rounded-full mb-4">
              {steps[step - 1].icon}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {steps[step - 1].title}
            </h2>
            <p className="text-gray-600">{steps[step - 1].description}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            {steps[step - 1].content}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="secondary"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              Previous
            </Button>
            {step < steps.length ? (
              <Button onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


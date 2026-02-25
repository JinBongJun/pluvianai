'use client';

import { useRouter } from 'next/navigation';
import Button from './ui/Button';
import { FileText, BarChart3, Zap, ArrowRight, Plus } from 'lucide-react';

interface EmptyStateProps {
  type: 'api-calls' | 'quality' | 'drift' | 'cost' | 'compare' | 'reports' | 'general';
  projectId?: number;
  onGenerateSample?: () => void;
  title?: string;
  description?: string;
}

export default function EmptyState({
  type,
  projectId,
  onGenerateSample,
  title,
  description
}: EmptyStateProps) {
  const router = useRouter();

  const getContent = () => {
    switch (type) {
      case 'api-calls':
        return {
          icon: Zap,
          title: title || 'No API Calls Yet',
          description: description || 'Start making API calls to see them tracked here. Your LLM requests will appear in real-time.',
          actions: [
            {
              label: 'View Documentation',
              onClick: () => window.open('https://docs.pluvian.ai', '_blank'),
              variant: 'outline' as const,
            },
            {
              label: 'Generate Sample Data',
              onClick: onGenerateSample,
              variant: 'primary' as const,
            },
          ],
        };
      case 'quality':
        return {
          icon: BarChart3,
          title: title || 'No Quality Scores',
          description: description || 'Quality scores are generated automatically when API calls are evaluated. Make some API calls first.',
          actions: [
            {
              label: 'View API Calls',
              onClick: () => projectId && router.push(`/dashboard/${projectId}/api-calls`),
              variant: 'primary' as const,
            },
          ],
        };
      case 'drift':
        return {
          icon: BarChart3,
          title: title || 'No Drift Detections',
          description: description || 'Drift detection runs automatically on your API calls. Make some calls and wait for drift analysis.',
          actions: [
            {
              label: 'View API Calls',
              onClick: () => projectId && router.push(`/dashboard/${projectId}/api-calls`),
              variant: 'primary' as const,
            },
          ],
        };
      case 'cost':
        return {
          icon: BarChart3,
          title: title || 'No Cost Data',
          description: description || 'Cost analysis is calculated from your API calls. Start making calls to see cost breakdowns.',
          actions: [
            {
              label: 'View API Calls',
              onClick: () => projectId && router.push(`/dashboard/${projectId}/api-calls`),
              variant: 'primary' as const,
            },
          ],
        };
      case 'compare':
        return {
          icon: BarChart3,
          title: title || 'No Comparison Data',
          description: description || 'Compare different models by making API calls with multiple models. Data will appear here automatically.',
          actions: [
            {
              label: 'View API Calls',
              onClick: () => projectId && router.push(`/dashboard/${projectId}/api-calls`),
              variant: 'primary' as const,
            },
          ],
        };
      case 'reports':
        return {
          icon: FileText,
          title: title || 'No Reports Generated',
          description: description || 'Generate your first report to see project insights and analytics.',
          actions: [
            {
              label: 'Generate Report',
              onClick: () => { },
              variant: 'primary' as const,
            },
          ],
        };
      default:
        return {
          icon: FileText,
          title: title || 'No Data Available',
          description: description || 'Get started by creating your first item.',
          actions: [
            {
              label: 'Get Started',
              onClick: () => { },
              variant: 'primary' as const,
            },
          ],
        };
    }
  };

  const content = getContent();
  const Icon = content.icon;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-12 text-center shadow-2xl">
      <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-ag-accent/20 blur-[60px]" />
      <div className="relative z-10">
        <Icon className="h-12 w-12 text-ag-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-ag-text mb-2">{content.title}</h3>
        <p className="text-sm text-ag-muted mb-6 max-w-md mx-auto">
          {content.description}
        </p>
        <div className="flex items-center justify-center gap-3">
          {content.actions.map((action, idx) => (
            <Button
              key={idx}
              variant={action.variant}
              onClick={action.onClick}
              className="flex items-center gap-2"
            >
              {action.label}
              {action.variant === 'primary' && <ArrowRight className="h-4 w-4" />}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
  requiredPlan?: string;
  feature?: string;
  upgradeUrl?: string;
}

export default function UpgradePrompt({
  isOpen,
  onClose,
  currentPlan = 'free',
  requiredPlan = 'pro',
  feature,
  upgradeUrl,
}: UpgradePromptProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleUpgrade = () => {
    setIsNavigating(true);
    if (upgradeUrl) {
      router.push(upgradeUrl);
    } else {
      router.push(`/settings/billing?upgrade=${requiredPlan}`);
    }
  };

  const planFeatures: Record<string, string[]> = {
    pro: [
      'Unlimited snapshots',
      'Advanced analytics & insights',
      'Auto-mapping & dependency visualization',
      'CI/CD integration',
      'Priority support',
    ],
    enterprise: [
      'Everything in Pro',
      'Custom retention policies',
      'Dedicated support',
      'SLA guarantees',
      'Custom integrations',
    ],
  };

  const features = planFeatures[requiredPlan] || planFeatures.pro;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="">
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute top-0 right-0 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 mb-4">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Upgrade to {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)}
          </h2>
          {feature && (
            <p className="text-gray-600">
              This feature requires a {requiredPlan} plan
            </p>
          )}
        </div>

        {feature && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Feature:</strong> {feature}
            </p>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            What you&apos;ll get:
          </h3>
          <ul className="space-y-2">
            {features.map((feat, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center mt-0.5">
                  <svg
                    className="w-3 h-3 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span className="text-gray-700">{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button
            onClick={handleUpgrade}
            className="flex-1"
            disabled={isNavigating}
          >
            {isNavigating ? 'Redirecting...' : 'Upgrade Now'}
            {!isNavigating && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { firewallAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { Trash2, Edit2, Plus, Shield, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import posthog from 'posthog-js';

interface FirewallRule {
  id: number;
  project_id: number;
  rule_type: string;
  name: string;
  description?: string;
  pattern?: string;
  pattern_type?: string;
  action: string;
  severity: string;
  enabled: boolean;
  config?: any;
  created_at: string;
  updated_at?: string;
}

interface FirewallRulesProps {
  projectId: number;
}

export default function FirewallRules({ projectId }: FirewallRulesProps) {
  const toast = useToast();
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<FirewallRule | null>(null);
  const [formData, setFormData] = useState({
    rule_type: 'pii',
    name: '',
    description: '',
    pattern: '',
    pattern_type: 'regex',
    action: 'block',
    severity: 'medium',
    enabled: true,
  });

  useEffect(() => {
    loadRules();
  }, [projectId]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await firewallAPI.getRules(projectId);
      setRules(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to load firewall rules',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const rule = await firewallAPI.createRule(projectId, formData);
      
      // Track firewall rule creation event
      posthog.capture('firewall_rule_created', {
        project_id: projectId,
        rule_type: formData.rule_type,
        rule_id: rule.id,
      });
      
      toast.showToast('Firewall rule created successfully', 'success');
      setShowCreateModal(false);
      resetForm();
      loadRules();
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to create rule',
        'error',
      );
    }
  };

  const handleUpdate = async () => {
    if (!editingRule) return;
    try {
      await firewallAPI.updateRule(projectId, editingRule.id, formData);
      toast.showToast('Firewall rule updated successfully', 'success');
      setEditingRule(null);
      resetForm();
      loadRules();
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to update rule',
        'error',
      );
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await firewallAPI.deleteRule(projectId, ruleId);
      toast.showToast('Firewall rule deleted successfully', 'success');
      loadRules();
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to delete rule',
        'error',
      );
    }
  };

  const handleToggle = async (rule: FirewallRule) => {
    try {
      await firewallAPI.updateRule(projectId, rule.id, { enabled: !rule.enabled });
      toast.showToast(
        `Rule ${rule.enabled ? 'disabled' : 'enabled'} successfully`,
        'success',
      );
      loadRules();
    } catch (error: any) {
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to toggle rule',
        'error',
      );
    }
  };

  const resetForm = () => {
    setFormData({
      rule_type: 'pii',
      name: '',
      description: '',
      pattern: '',
      pattern_type: 'regex',
      action: 'block',
      severity: 'medium',
      enabled: true,
    });
  };

  const openEditModal = (rule: FirewallRule) => {
    setEditingRule(rule);
    setFormData({
      rule_type: rule.rule_type,
      name: rule.name,
      description: rule.description || '',
      pattern: rule.pattern || '',
      pattern_type: rule.pattern_type || 'regex',
      action: rule.action,
      severity: rule.severity,
      enabled: rule.enabled,
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-500 bg-red-500/10';
      case 'high':
        return 'text-orange-500 bg-orange-500/10';
      case 'medium':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'low':
        return 'text-blue-500 bg-blue-500/10';
      default:
        return 'text-slate-400 bg-slate-400/10';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'block':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'log':
        return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ag-accent/20 border-t-ag-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Firewall Rules</h2>
          <p className="text-slate-400 mt-1">Protect your production traffic with real-time blocking rules</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-12 bg-dark-card rounded-lg border border-dark-border">
          <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No firewall rules configured</p>
          <p className="text-slate-500 text-sm mt-2">Create your first rule to start protecting your API traffic</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-dark-card rounded-lg border border-dark-border p-6 hover:border-ag-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{rule.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(rule.severity)}`}>
                      {rule.severity}
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-ag-accent/10 text-ag-accent">
                      {rule.rule_type}
                    </span>
                    {getActionIcon(rule.action)}
                    <span className="text-xs text-slate-500">{rule.action}</span>
                  </div>
                  {rule.description && (
                    <p className="text-slate-400 text-sm mb-3">{rule.description}</p>
                  )}
                  {rule.pattern && (
                    <div className="mt-2">
                      <code className="text-xs bg-dark-bg px-2 py-1 rounded text-slate-300">{rule.pattern}</code>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(rule)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      rule.enabled
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-slate-500/10 text-slate-400 hover:bg-slate-500/20'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-dark-border rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal || editingRule !== null}
        onClose={() => {
          setShowCreateModal(false);
          setEditingRule(null);
          resetForm();
        }}
        title={editingRule ? 'Edit Firewall Rule' : 'Create Firewall Rule'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Rule Type</label>
            <Select
              value={formData.rule_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rule_type: (e as any)?.target?.value ?? formData.rule_type,
                })
              }
              options={[
                { value: 'pii', label: 'PII Detection' },
                { value: 'toxicity', label: 'Toxicity' },
                { value: 'hallucination', label: 'Hallucination' },
                { value: 'custom', label: 'Custom Pattern' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: (e as any)?.target?.value ?? formData.name })
              }
              placeholder="Rule name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <Input
              value={formData.description}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  description: (e as any)?.target?.value ?? formData.description,
                })
              }
              placeholder="Rule description (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Pattern (Regex/Keyword)</label>
            <Input
              value={formData.pattern}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  pattern: (e as any)?.target?.value ?? formData.pattern,
                })
              }
              placeholder="Regular expression or keyword"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Pattern Type</label>
            <Select
              value={formData.pattern_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  pattern_type: (e as any)?.target?.value ?? formData.pattern_type,
                })
              }
              options={[
                { value: 'regex', label: 'Regular Expression' },
                { value: 'keyword', label: 'Keyword' },
                { value: 'llm', label: 'LLM-based' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Action</label>
            <Select
              value={formData.action}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  action: (e as any)?.target?.value ?? formData.action,
                })
              }
              options={[
                { value: 'block', label: 'Block' },
                { value: 'warn', label: 'Warn' },
                { value: 'log', label: 'Log Only' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Severity</label>
            <Select
              value={formData.severity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  severity: (e as any)?.target?.value ?? formData.severity,
                })
              }
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  enabled: (e as any)?.target?.checked ?? formData.enabled,
                })
              }
              className="w-4 h-4 rounded border-dark-border bg-dark-card text-ag-accent focus:ring-ag-accent"
            />
            <label htmlFor="enabled" className="text-sm text-slate-300">
              Enabled
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={editingRule ? handleUpdate : handleCreate}
              className="flex-1"
              disabled={!formData.name}
            >
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setEditingRule(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

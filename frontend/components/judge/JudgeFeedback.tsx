'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { MessageSquare, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';

interface JudgeFeedback {
  id: number;
  project_id: number;
  evaluation_id: number;
  judge_score: number;
  human_score: number;
  alignment_score?: number;
  comment?: string;
  correction_reason?: string;
  metadata?: any;
  created_at: string;
  updated_at?: string;
}

interface JudgeFeedbackProps {
  projectId: number;
  evaluationId?: number;
}

export default function JudgeFeedbackComponent({ projectId, evaluationId }: JudgeFeedbackProps) {
  const toast = useToast();
  const [feedbacks, setFeedbacks] = useState<JudgeFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<JudgeFeedback | null>(null);
  const [formData, setFormData] = useState({
    evaluation_id: evaluationId || 0,
    judge_score: 0,
    human_score: 0,
    comment: '',
    correction_reason: '',
  });
  const [reliabilityMetrics, setReliabilityMetrics] = useState<any>(null);

  useEffect(() => {
    loadFeedbacks();
    loadReliabilityMetrics();
  }, [projectId, evaluationId]);

  const loadFeedbacks = async () => {
    try {
      setLoading(true);
      const { judgeFeedbackAPI } = await import('@/lib/api');
      const data = await judgeFeedbackAPI.getFeedback(projectId, evaluationId);
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error('Failed to load judge feedback', error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReliabilityMetrics = async () => {
    try {
      const { judgeFeedbackAPI } = await import('@/lib/api');
      const metrics = await judgeFeedbackAPI.getReliabilityMetrics(projectId);
      setReliabilityMetrics(metrics);
    } catch (error: any) {
      // Ignore errors for metrics
    }
  };

  const handleCreate = async () => {
    try {
      const { judgeFeedbackAPI } = await import('@/lib/api');
      await judgeFeedbackAPI.createFeedback(projectId, formData);
      toast.success('Judge feedback created successfully');
      setShowCreateModal(false);
      resetForm();
      loadFeedbacks();
      loadReliabilityMetrics();
    } catch (error: any) {
      toast.error('Failed to create feedback', error.response?.data?.detail || error.message);
    }
  };

  const handleUpdate = async () => {
    if (!editingFeedback) return;
    try {
      const { judgeFeedbackAPI } = await import('@/lib/api');
      await judgeFeedbackAPI.updateFeedback(projectId, editingFeedback.id, {
        human_score: formData.human_score,
        comment: formData.comment,
        correction_reason: formData.correction_reason,
      });
      toast.success('Judge feedback updated successfully');
      setEditingFeedback(null);
      resetForm();
      loadFeedbacks();
      loadReliabilityMetrics();
    } catch (error: any) {
      toast.error('Failed to update feedback', error.response?.data?.detail || error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      evaluation_id: evaluationId || 0,
      judge_score: 0,
      human_score: 0,
      comment: '',
      correction_reason: '',
    });
  };

  const openEditModal = (feedback: JudgeFeedback) => {
    setEditingFeedback(feedback);
    setFormData({
      evaluation_id: feedback.evaluation_id,
      judge_score: feedback.judge_score,
      human_score: feedback.human_score,
      comment: feedback.comment || '',
      correction_reason: feedback.correction_reason || '',
    });
  };

  const getAlignmentColor = (alignment?: number) => {
    if (!alignment) return 'text-slate-400';
    if (alignment >= 90) return 'text-green-400';
    if (alignment >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500/20 border-t-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {reliabilityMetrics && (
        <div className="bg-dark-card rounded-lg border border-dark-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Judge Reliability Metrics</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-400">Total Feedbacks</p>
              <p className="text-2xl font-bold text-white">{reliabilityMetrics.total_feedbacks}</p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Average Alignment</p>
              <p className={`text-2xl font-bold ${getAlignmentColor(reliabilityMetrics.average_alignment)}`}>
                {reliabilityMetrics.average_alignment?.toFixed(1) || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">Reliability Score</p>
              <p className={`text-2xl font-bold ${getAlignmentColor(reliabilityMetrics.reliability_score)}`}>
                {reliabilityMetrics.reliability_score?.toFixed(1) || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Judge Feedback</h2>
          <p className="text-slate-400 mt-1">Provide feedback to improve Judge reliability</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Add Feedback
        </Button>
      </div>

      {feedbacks.length === 0 ? (
        <div className="text-center py-12 bg-dark-card rounded-lg border border-dark-border">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No judge feedback yet</p>
          <p className="text-slate-500 text-sm mt-2">Add feedback to help improve Judge accuracy</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <div
              key={feedback.id}
              className="bg-dark-card rounded-lg border border-dark-border p-6 hover:border-purple-500/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <div>
                      <p className="text-sm text-slate-400">Judge Score</p>
                      <p className="text-lg font-semibold text-white">{feedback.judge_score.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Human Score</p>
                      <p className="text-lg font-semibold text-white">{feedback.human_score.toFixed(1)}</p>
                    </div>
                    {feedback.alignment_score !== undefined && (
                      <div>
                        <p className="text-sm text-slate-400">Alignment</p>
                        <p className={`text-lg font-semibold ${getAlignmentColor(feedback.alignment_score)}`}>
                          {feedback.alignment_score.toFixed(1)}
                        </p>
                      </div>
                    )}
                  </div>
                  {feedback.comment && (
                    <p className="text-slate-300 text-sm mb-2">{feedback.comment}</p>
                  )}
                  {feedback.correction_reason && (
                    <p className="text-slate-400 text-xs">Reason: {feedback.correction_reason}</p>
                  )}
                </div>
                <button
                  onClick={() => openEditModal(feedback)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-dark-border rounded transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal || editingFeedback !== null}
        onClose={() => {
          setShowCreateModal(false);
          setEditingFeedback(null);
          resetForm();
        }}
        title={editingFeedback ? 'Edit Judge Feedback' : 'Add Judge Feedback'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Evaluation ID</label>
            <Input
              type="number"
              value={formData.evaluation_id}
              onChange={(e) => setFormData({ ...formData, evaluation_id: parseInt(e.target.value) || 0 })}
              placeholder="Evaluation ID"
              disabled={!!editingFeedback}
            />
          </div>

          {!editingFeedback && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Judge Score (0-100)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.judge_score}
                onChange={(e) => setFormData({ ...formData, judge_score: parseFloat(e.target.value) || 0 })}
                placeholder="AI Judge score"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Human Score (0-100)</label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.human_score}
              onChange={(e) => setFormData({ ...formData, human_score: parseFloat(e.target.value) || 0 })}
              placeholder="Your score"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Comment</label>
            <Input
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Optional comment"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Correction Reason</label>
            <Input
              value={formData.correction_reason}
              onChange={(e) => setFormData({ ...formData, correction_reason: e.target.value })}
              placeholder="Why did you correct the score?"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={editingFeedback ? handleUpdate : handleCreate}
              className="flex-1"
              disabled={!formData.evaluation_id || formData.human_score < 0 || formData.human_score > 100}
            >
              {editingFeedback ? 'Update Feedback' : 'Add Feedback'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setEditingFeedback(null);
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

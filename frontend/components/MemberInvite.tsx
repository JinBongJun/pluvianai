'use client';

import { useState } from 'react';
import { projectMembersAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Link2, Copy, Check, Clock, Users } from 'lucide-react';

interface MemberInviteProps {
  projectId: number;
  onInviteCreated?: () => void;
}

export default function MemberInvite({ projectId, onInviteCreated }: MemberInviteProps) {
  const toast = useToast();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [expirationDays, setExpirationDays] = useState(7);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerateInvite = async () => {
    setGenerating(true);
    try {
      // Note: This would require backend API endpoint for invite link generation
      // For now, we'll create a placeholder link
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const token = `invite_${projectId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const link = `${baseUrl}/invite/${token}`;
      setInviteLink(link);
      toast.showToast('Invite link generated successfully', 'success');
      if (onInviteCreated) {
        onInviteCreated();
      }
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to generate invite link', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.showToast('Invite link copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <Button
        onClick={() => setShowInviteModal(true)}
        variant="outline"
        className="flex items-center gap-2"
      >
        <Link2 className="h-4 w-4" />
        Generate Invite Link
      </Button>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Generate Invite Link</h3>
            
            {!inviteLink ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Link Expiration (days)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={expirationDays}
                    onChange={(e) => setExpirationDays(parseInt(e.target.value) || 7)}
                    className="w-full bg-white/5 border-white/10 text-white"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    The link will expire after {expirationDays} day{expirationDays !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowInviteModal(false);
                      setExpirationDays(7);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleGenerateInvite} isLoading={generating}>
                    Generate Link
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-4">
                  <p className="text-sm text-yellow-300 font-medium mb-2">
                    ⚠️ Save this link now
                  </p>
                  <p className="text-xs text-yellow-200">
                    This link will only be shown once. Make sure to copy it and share it with the team member.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Invite Link
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="flex-1 bg-white/5 border-white/10 text-white font-mono text-sm"
                    />
                    <Button
                      onClick={handleCopyLink}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock className="h-4 w-4" />
                  <span>Expires in {expirationDays} day{expirationDays !== 1 ? 's' : ''}</span>
                </div>
                
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteLink(null);
                      setExpirationDays(7);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

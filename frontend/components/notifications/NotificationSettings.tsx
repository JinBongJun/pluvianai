// Notifications - NotificationSettings
import React from "react";

interface NotificationSettingsProps {
  projectId: number;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ projectId }) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
      <h3 className="text-sm font-medium text-white mb-3">
        Notification Settings (Project: {projectId})
      </h3>
      <p className="text-xs text-slate-400">Configure your notification preferences</p>
    </div>
  );
};

export default NotificationSettings;

// Notifications - NotificationCenter
import React from "react";
import { Bell } from "lucide-react";

const NotificationCenter: React.FC = () => {
  return (
    <button className="relative p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
      <Bell className="w-5 h-5" />
      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
    </button>
  );
};

export default NotificationCenter;

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, AlertTriangle } from 'lucide-react';
import { notificationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';

interface Notification {
  id: number;
  project_id: number;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationCenter() {
  const router = useRouter();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  useEffect(() => {
    // Poll for unread count
    let interval: NodeJS.Timeout | null = null;
    
    const setupPolling = () => {
      loadUnreadCount();
      interval = setInterval(() => {
        loadUnreadCount();
      }, 30000); // Every 30 seconds
    };
    
    setupPolling();
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await notificationsAPI.list({ limit: 20 });
      // Ensure data is an array
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load notifications:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
      setNotifications([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await notificationsAPI.getUnreadCount();
      setUnreadCount(data.count);
    } catch (error) {
      // Ignore errors
    }
  };

  const handleMarkRead = async (notificationId: number) => {
    try {
      await notificationsAPI.markRead(notificationId);
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, is_read: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to mark notification as read:', error);
      }
    }
  };

  const handleDelete = async (notificationId: number) => {
    try {
      await notificationsAPI.delete(notificationId);
      setNotifications(notifications.filter(n => n.id !== notificationId));
      if (!notifications.find(n => n.id === notificationId)?.is_read) {
        setUnreadCount(Math.max(0, unreadCount - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    handleMarkRead(notification.id);
    try {
      const { projectsAPI } = await import('@/lib/api');
      const proj = await projectsAPI.get(notification.project_id);
      if (proj.organization_id) {
        router.push(`/organizations/${proj.organization_id}/projects/${notification.project_id}/alerts/${notification.id}`);
      } else {
        router.push(`/dashboard/${notification.project_id}/alerts/${notification.id}`);
      }
    } catch {
      router.push(`/dashboard/${notification.project_id}/alerts/${notification.id}`);
    }
    setIsOpen(false);
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'default' => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-ag-muted hover:text-ag-text hover:bg-white/5 rounded-md transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-4 w-4 bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-ag-bg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 rounded-lg shadow-2xl border border-white/10 z-50 max-h-[600px] flex flex-col overflow-hidden animate-fade-in" style={{ backgroundColor: 'rgb(var(--ag-surface))' }}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-ag-text">Notifications</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-ag-muted hover:text-ag-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 text-center text-ag-muted">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-ag-muted">
                <Bell className="h-12 w-12 text-white/10 mx-auto mb-2" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={clsx(
                      'p-4 hover:bg-white/5 cursor-pointer transition-colors relative',
                      !notification.is_read && 'bg-ag-accent/5'
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {!notification.is_read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-ag-accent" />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getSeverityColor(notification.severity)} size="sm">
                            {notification.severity}
                          </Badge>
                        </div>
                        <div className="font-medium text-ag-text text-sm mb-1">
                          {notification.title}
                        </div>
                        <div className="text-xs text-ag-muted line-clamp-2">
                          {notification.message}
                        </div>
                        <div className="text-xs text-ag-muted/60 mt-1">
                          {new Date(notification.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.is_read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkRead(notification.id);
                            }}
                            className="p-1 text-ag-muted hover:text-ag-accent"
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                          className="p-1 text-ag-muted hover:text-red-400"
                          title="Delete"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-white/10">
              <Button
                variant="secondary"
                onClick={() => {
                  // Mark all as read
                  notifications.forEach(n => {
                    if (!n.is_read) {
                      handleMarkRead(n.id);
                    }
                  });
                }}
                className="w-full text-sm"
              >
                Mark all as read
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


import React, {useState} from 'react';
import {AlertTriangle, Bell, CheckCheck, Info, X} from 'lucide-react';
import {apiRequest} from '../lib/api';
import type {NotificationItem} from '../types';

interface NotificationsDrawerProps {
  isOpen: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onRefresh: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  notifications,
  onClose,
  onRefresh,
}) => {
  const [browserPermission, setBrowserPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [showExplain, setShowExplain] = useState(false);

  if (!isOpen) return null;

  const markAllRead = async () => {
    await apiRequest('/api/notifications/read', {method: 'POST', body: {}}).catch(() => {});
    onRefresh();
  };

  const markOneRead = async (id: number) => {
    await apiRequest('/api/notifications/read', {method: 'POST', body: {id}}).catch(() => {});
    onRefresh();
  };

  const requestBrowserPopup = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setBrowserPermission(perm);
    setShowExplain(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center">
      <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] p-5 max-h-[88dvh] flex flex-col shadow-2xl pb-safe">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#4B6F1B]" />
            <h2 className="text-lg font-bold text-[#111827]">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => n.is_read === 0) && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-[#4B6F1B] hover:underline inline-flex items-center gap-1 px-2 py-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Honest in-app notification explanation */}
        <div className="mt-3 p-3 rounded-2xl bg-[#F3F4F6] text-xs text-[#6B7280] flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#4B6F1B] shrink-0" />
            <span>Notifications appear inside the app.</span>
          </span>
          {browserPermission === 'default' && (
            <button
              type="button"
              onClick={() => setShowExplain(true)}
              className="text-[#4B6F1B] font-semibold whitespace-nowrap cursor-pointer hover:underline"
            >
              Enable popups
            </button>
          )}
        </div>

        {showExplain && (
          <div className="mt-2 p-3.5 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 space-y-2">
            <p className="text-xs text-[#111827]">
              Allow browser popups while CaterConnect is open so you do not miss 1-hour attendance checks or emergency catering alerts.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestBrowserPopup}
                className="px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
              >
                Allow Popups
              </button>
              <button
                type="button"
                onClick={() => setShowExplain(false)}
                className="px-3 py-1.5 rounded-full bg-white text-[#6B7280] text-xs cursor-pointer"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 app-scroll mt-3 space-y-2.5 pb-4">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#6B7280]">
              No notifications yet. Job updates and reminders will appear here.
            </div>
          ) : (
            notifications.map((n) => {
              const isEmergency = n.type === 'emergency_replacement';
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => n.is_read === 0 && markOneRead(n.id)}
                  className={`cc-card w-full text-left p-3.5 rounded-2xl border transition-colors cursor-pointer ${
                    isEmergency
                      ? 'bg-[#F59E0B]/12 border-[#F59E0B]/40'
                      : n.is_read === 0
                      ? 'bg-[#4B6F1B]/6 border-[#4B6F1B]/25'
                      : 'bg-white border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {isEmergency && <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />}
                      <span className="text-xs font-bold text-[#111827]">{n.title}</span>
                    </div>
                    {n.is_read === 0 && (
                      <span className="text-[10px] font-semibold text-[#4B6F1B]">New</span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">{n.body}</p>
                  <div className="text-[10px] text-[#6B7280]/80 mt-1.5 tabular-nums">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

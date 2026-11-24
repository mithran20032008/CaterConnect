import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  Bell,
  Bookmark,
  Briefcase,
  CalendarCheck,
  Camera,
  CheckCircle2,
  CreditCard,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Star,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import {AutoVerifyBanner} from './AutoVerifyBanner';
import {CameraCaptureModal} from './CameraCaptureModal';
import {FindJobsTab} from './FindJobsTab';
import {JobDetailModal} from './JobDetailModal';
import {NotificationsDrawer} from './NotificationsDrawer';
import {PWAInstallButton} from './PWAInstallButton';
import {ReviewModal} from './ReviewModal';
import {SupportTicketModal} from './SupportTicketModal';
import {apiRequest, setActiveViewingJobId} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Job, NotificationItem, NotificationPrefs, User} from '../types';

type WorkerTab = 'home' | 'groups' | 'find' | 'bookings' | 'profile';

interface WorkerBookingRow {
  id: number;
  job_id: number;
  work_name: string;
  serve_type: string;
  event_date: string;
  reporting_time: string;
  location_name: string;
  city: string;
  total_pay: number;
  agreed_pay: number;
  org_name: string;
  status: string;
  attendance_status: string | null;
  reminder_sent_at: string | null;
  arrival_verified: number | null;
  arrival_distance_m: number | null;
  payment_id: number | null;
  payment_status: string | null;
  payment_method: string | null;
  my_review_id: number | null;
}

interface WorkerAppRow {
  id: number;
  job_id: number;
  work_name: string;
  event_date: string;
  location_name: string;
  total_pay: number;
  org_name: string;
  applicant_type: string;
  group_name: string | null;
  group_leader_id?: number | null;
  is_demo?: number;
  job_is_demo?: number;
  status: string;
}

interface GroupView {
  id: number;
  name: string;
  leader_id: number;
  leader_name: string;
  city: string;
  accepted_count: number;
  my_status: string;
  members: {
    id: number;
    worker_id: number;
    role: string;
    status: string;
    full_name: string;
    phone: string;
    work_category: string;
    rating_avg: number;
  }[];
}

interface ReplacementOffer {
  id: number;
  job_id: number;
  work_name: string;
  serve_type: string;
  event_date: string;
  reporting_time: string;
  location_name: string;
  total_pay: number;
  org_name: string;
  distance_km: number;
  status: string;
}

interface SupportTicketRow {
  id: number;
  category: string;
  description: string;
  admin_response: string;
  status: string;
  created_at: string;
}

interface WorkerAppProps {
  user: User;
  autoVerifyMinutes: number;
  initialJobId?: number | null;
  onConsumedInitialJob?: () => void;
  onRefreshSession: () => void;
  onLogout: () => void;
}

function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('confirm') || s.includes('arrived') || s.includes('completed')) {
    return 'bg-[#4B6F1B]/12 text-[#3C5A15]';
  }
  if (s.includes('cancel') || s.includes('reject') || s.includes('disput')) {
    return 'bg-[#DC2626]/12 text-[#DC2626]';
  }
  return 'bg-[#F59E0B]/15 text-[#B45309]';
}

export const WorkerApp: React.FC<WorkerAppProps> = ({
  user,
  autoVerifyMinutes,
  initialJobId,
  onConsumedInitialJob,
  onRefreshSession,
  onLogout,
}) => {
  const {lang, setLang, t} = useI18n();
  const [tab, setTab] = useState<WorkerTab>('find');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportBookingId, setSupportBookingId] = useState<number | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{bookingId: number; name: string} | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({top: 0});
  }, [tab]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bookings, setBookings] = useState<WorkerBookingRow[]>([]);
  const [applications, setApplications] = useState<WorkerAppRow[]>([]);
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [offers, setOffers] = useState<ReplacementOffer[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);

  const [userCoords, setUserCoords] = useState<{lat: number | null; lng: number | null}>({
    lat: user.lat,
    lng: user.lng,
  });
  const [actionMsg, setActionMsg] = useState('');

  // Groups form state
  const [newGroupName, setNewGroupName] = useState('');
  const [invitePhoneMap, setInvitePhoneMap] = useState<Record<number, string>>({});
  const [groupErr, setGroupErr] = useState('');

  // Profile edit state
  const [editName, setEditName] = useState(user.full_name);
  const [editArea, setEditArea] = useState(user.living_location);
  const [editSkills, setEditSkills] = useState(user.skills);
  const [editAvail, setEditAvail] = useState(user.availability || 'Available');
  const [savingProfile, setSavingProfile] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    try {
      return JSON.parse(user.notif_prefs);
    } catch {
      return {emergency: true, bookings: true, attendance: true, payments: true, support: true};
    }
  });

  const loadAllData = useCallback(async () => {
    const [notifRes, bookRes, grpRes, savedRes, offerRes, tickRes] = await Promise.all([
      apiRequest<{items: NotificationItem[]; unreadCount: number}>('/api/notifications').catch(
        () => ({items: [], unreadCount: 0})
      ),
      apiRequest<{bookings: WorkerBookingRow[]; applications: WorkerAppRow[]}>(
        '/api/worker/bookings'
      ).catch(() => ({bookings: [], applications: []})),
      apiRequest<{groups: GroupView[]}>('/api/groups').catch(() => ({groups: []})),
      apiRequest<{jobs: Job[]}>('/api/jobs/saved').catch(() => ({jobs: []})),
      apiRequest<{offers: ReplacementOffer[]}>('/api/worker/replacement-offers').catch(() => ({
        offers: [],
      })),
      apiRequest<{tickets: SupportTicketRow[]}>('/api/support/tickets').catch(() => ({
        tickets: [],
      })),
    ]);
    setNotifications(notifRes.items);
    setUnreadCount(notifRes.unreadCount);
    setBookings(bookRes.bookings);
    setApplications(bookRes.applications);
    setGroups(grpRes.groups);
    setSavedJobs(savedRes.jobs);
    setOffers(offerRes.offers);
    setTickets(tickRes.tickets);
  }, []);

  useEffect(() => {
    loadAllData();
    const timer = setInterval(loadAllData, 20000);
    return () => clearInterval(timer);
  }, [loadAllData]);

  const handleToggleSave = async (jobId: number) => {
    await apiRequest(`/api/jobs/${jobId}/save`, {method: 'POST', body: {}}).catch(() => {});
    loadAllData();
  };

  const handleWithdrawApplication = async (applicationId: number) => {
    setActionMsg('');
    try {
      await apiRequest(`/api/applications/${applicationId}/withdraw`, {
        method: 'POST',
        body: {},
      });
      setActionMsg('Application withdrawn.');
      loadAllData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to withdraw application.');
    }
  };

  const handleClearDemoApplications = async () => {
    setActionMsg('');
    try {
      const res = await apiRequest<{deletedCount: number}>('/api/worker/demo-applications', {
        method: 'DELETE',
      });
      setActionMsg(
        res.deletedCount > 0
          ? `Cleared ${res.deletedCount} demo application(s).`
          : 'No demo applications to clear.'
      );
      loadAllData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to clear demo applications.');
    }
  };

  useEffect(() => {
    setActiveViewingJobId(selectedJob?.id ?? null);
  }, [selectedJob]);

  useEffect(() => {
    if (!initialJobId) return;
    handleOpenJobById(initialJobId).finally(() => {
      onConsumedInitialJob?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJobId]);

  const handleOpenJobById = async (jobId: number) => {
    try {
      const qs =
        typeof userCoords.lat === 'number' && typeof userCoords.lng === 'number'
          ? `?lat=${encodeURIComponent(userCoords.lat)}&lng=${encodeURIComponent(userCoords.lng)}`
          : '';
      const res = await apiRequest<{job: Job}>(`/api/jobs/${jobId}${qs}`);
      setSelectedJob(res.job);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Could not open job details.');
    }
  };

  const handleAttendanceRespond = async (bookingId: number, coming: boolean) => {
    setActionMsg('');
    try {
      await apiRequest(`/api/attendance/${bookingId}/respond`, {
        method: 'POST',
        body: {coming},
      });
      setActionMsg(coming ? 'Attendance confirmed!' : 'Booking cancelled.');
      loadAllData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to respond.');
    }
  };

  const handleMarkArrived = (bookingId: number) => {
    setActionMsg('');
    const sendArrival = async (lat: number | null, lng: number | null) => {
      try {
        const res = await apiRequest<{distanceMeters: number | null; verified: boolean}>(
          `/api/attendance/${bookingId}/arrived`,
          {method: 'POST', body: {lat, lng}}
        );
        if (res.distanceMeters === null) {
          setActionMsg('Marked arrived (GPS location not shared).');
        } else if (res.verified) {
          setActionMsg(`Arrival verified within ${res.distanceMeters}m of venue!`);
        } else {
          setActionMsg(`Marked arrived (${res.distanceMeters}m from venue — outside 200m area).`);
        }
        loadAllData();
      } catch (err) {
        setActionMsg(err instanceof Error ? err.message : 'Failed to mark arrived.');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendArrival(pos.coords.latitude, pos.coords.longitude),
        () => sendArrival(null, null),
        {enableHighAccuracy: true, timeout: 8000}
      );
    } else {
      sendArrival(null, null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupErr('');
    try {
      await apiRequest('/api/groups', {
        method: 'POST',
        body: {name: newGroupName, city: user.city},
      });
      setNewGroupName('');
      loadAllData();
    } catch (err) {
      setGroupErr(err instanceof Error ? err.message : 'Failed to create group.');
    }
  };

  const handleInviteMember = async (groupId: number) => {
    setGroupErr('');
    try {
      await apiRequest(`/api/groups/${groupId}/invite`, {
        method: 'POST',
        body: {phone: invitePhoneMap[groupId] || ''},
      });
      setInvitePhoneMap((p) => ({...p, [groupId]: ''}));
      loadAllData();
    } catch (err) {
      setGroupErr(err instanceof Error ? err.message : 'Failed to invite member.');
    }
  };

  const handleRespondOffer = async (offerId: number, accept: boolean) => {
    setActionMsg('');
    try {
      await apiRequest(`/api/worker/replacement-offers/${offerId}/respond`, {
        method: 'POST',
        body: {accept},
      });
      setActionMsg(
        accept
          ? 'Emergency slot accepted! Waiting for organisation approval.'
          : 'Emergency offer declined.'
      );
      loadAllData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to respond.');
    }
  };

  const handleConfirmPayment = async (paymentId: number) => {
    await apiRequest(`/api/worker/payments/${paymentId}/confirm`, {method: 'POST', body: {}});
    setActionMsg('Payment receipt confirmed!');
    loadAllData();
  };

  const handleDisputePayment = async (paymentId: number) => {
    const reason = window.prompt('Describe the payment issue:');
    if (!reason) return;
    await apiRequest(`/api/worker/payments/${paymentId}/dispute`, {
      method: 'POST',
      body: {reason},
    });
    setActionMsg('Payment dispute submitted.');
    loadAllData();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/api/profile', {
        method: 'PUT',
        body: {
          full_name: editName,
          living_location: editArea,
          skills: editSkills,
          availability: editAvail,
          language: lang,
          notif_prefs: notifPrefs,
        },
      });
      setActionMsg('Profile saved!');
      onRefreshSession();
    } finally {
      setSavingProfile(false);
    }
  };

  const confirmedBookings = bookings.filter((b) => b.status === 'Confirmed');
  const completedBookings = bookings.filter((b) => b.status === 'Completed');
  const totalEarnings = bookings
    .filter((b) => b.payment_status === 'confirmed' || b.status === 'Completed')
    .reduce((sum, b) => sum + (b.agreed_pay || b.total_pay || 0), 0);
  const pendingOffers = offers.filter((o) => o.status === 'pending');

  return (
    <div className="h-full w-full bg-[#F9FAFB] text-[#111827] flex flex-col overflow-hidden">
      {/* Fixed App Top Bar */}
      <header className="shrink-0 bg-white border-b border-gray-100 pt-safe px-4 pb-2.5 flex items-center justify-between gap-2 z-20">
        <div className="w-10 shrink-0" />
        <div className="text-center min-w-0">
          <div className="text-base font-extrabold text-[#4B6F1B] tracking-tight truncate">
            CaterConnect
          </div>
          <div className="text-[11px] font-medium text-[#6B7280] truncate">
            {user.city} · {user.work_category}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNotifDrawer(true)}
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-full bg-[#F3F4F6] text-[#111827] flex items-center justify-center cursor-pointer shrink-0"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Single Scrollable Middle Content Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 app-scroll px-3.5 pt-3 pb-10 space-y-4">
        <AutoVerifyBanner
          status={user.status}
          registeredAt={user.registered_at}
          autoVerifyMinutes={autoVerifyMinutes}
          role="worker"
          onAutoVerified={onRefreshSession}
        />

        {actionMsg && (
          <div className="p-3 rounded-2xl bg-[#4B6F1B]/12 border border-[#4B6F1B]/25 text-xs font-semibold text-[#3C5A15] flex items-center justify-between">
            <span>{actionMsg}</span>
            <button
              type="button"
              onClick={() => setActionMsg('')}
              className="text-[#4B6F1B] underline cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {/* Emergency Replacement Amber Banner */}
        {pendingOffers.length > 0 && (
          <div className="p-4 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#B45309]">
              <AlertTriangle className="w-4 h-4" />
              <span>{t('attendance.emergencyBanner')}</span>
            </div>
            {pendingOffers.map((o) => (
              <div
                key={o.id}
                className="p-3 rounded-xl bg-white border border-[#F59E0B]/30 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#111827]">{o.work_name}</span>
                  <span className="text-sm font-extrabold text-[#4B6F1B] tabular-nums">
                    Rs {o.total_pay}
                  </span>
                </div>
                <div className="text-xs text-[#6B7280]">
                  {o.org_name} · {o.location_name} ({o.distance_km} km) · {o.event_date}{' '}
                  {o.reporting_time}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespondOffer(o.id, true)}
                    className="flex-1 min-h-[40px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                  >
                    Accept Emergency Shift
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespondOffer(o.id, false)}
                    className="px-4 min-h-[40px] rounded-full bg-[#F3F4F6] text-[#6B7280] text-xs font-semibold cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: HOME */}
        {tab === 'home' && (
          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-[#111827] truncate">
                  Hello, {user.full_name.split(' ')[0]}
                </h1>
                <p className="text-xs text-[#6B7280] truncate">
                  {user.work_category} · {user.city} · Rating{' '}
                  {user.rating_avg > 0 ? user.rating_avg.toFixed(1) : 'New'}
                </p>
              </div>
            </div>

            {/* Summary KPI Grid */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Confirmed</div>
                <div className="text-2xl font-extrabold text-[#4B6F1B] tabular-nums mt-1">
                  {confirmedBookings.length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Applied</div>
                <div className="text-2xl font-extrabold text-[#111827] tabular-nums mt-1">
                  {applications.length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Completed</div>
                <div className="text-2xl font-extrabold text-[#111827] tabular-nums mt-1">
                  {completedBookings.length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Earnings (Rs 0 fee)</div>
                <div className="text-2xl font-extrabold text-[#3C5A15] tabular-nums mt-1 truncate">
                  Rs {totalEarnings}
                </div>
              </div>
            </div>

            {/* Upcoming / Reminder Needed */}
            {bookings.filter((b) => b.reminder_sent_at && b.attendance_status === 'Pending')
              .length > 0 && (
              <div className="p-4 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/35 space-y-2">
                <div className="text-xs font-bold text-[#B45309]">
                  {t('attendance.reminderTitle')}
                </div>
                {bookings
                  .filter((b) => b.reminder_sent_at && b.attendance_status === 'Pending')
                  .map((b) => (
                    <div key={b.id} className="bg-white p-3 rounded-xl space-y-2">
                      <div className="text-sm font-bold text-[#111827]">
                        {b.work_name} · {b.location_name}
                      </div>
                      <p className="text-xs text-[#6B7280]">{t('attendance.reminderPrompt')}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAttendanceRespond(b.id, true)}
                          className="flex-1 min-h-[42px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                        >
                          {t('attendance.yesComing')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttendanceRespond(b.id, false)}
                          className="flex-1 min-h-[42px] rounded-full bg-[#DC2626]/12 text-[#DC2626] text-xs font-semibold cursor-pointer"
                        >
                          {t('attendance.cannotAttend')}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Applied Jobs */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-[#4B6F1B]" />
                  <span>
                    {t('jobs.appliedJobs')} ({applications.length})
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('find')}
                  className="text-xs font-semibold text-[#4B6F1B] cursor-pointer"
                >
                  Browse all
                </button>
              </div>
              {applications.length === 0 ? (
                <p className="text-xs text-[#6B7280]">
                  Jobs you apply for (including demo jobs) appear here.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {applications.map((a) => {
                    const isDemoApp = a.is_demo === 1 || a.job_is_demo === 1;
                    const canWithdraw =
                      a.status === 'Applied' &&
                      (a.applicant_type === 'individual' || a.group_leader_id === user.id);
                    return (
                      <div
                        key={a.id}
                        className="p-3 rounded-xl bg-[#F3F4F6]/80 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenJobById(a.job_id)}
                            className="text-left min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-[#111827]">
                                {a.work_name}
                              </span>
                              {isDemoApp && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-[#6B7280] text-[10px] font-bold">
                                  {t('jobs.demoTag')}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#6B7280] mt-0.5">
                              {a.org_name} · {a.event_date}
                              {a.group_name ? ` · Group: ${a.group_name}` : ''}
                            </div>
                          </button>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-bold text-[#4B6F1B] tabular-nums">
                              Rs {a.total_pay}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChipClass(
                                a.status
                              )}`}
                            >
                              {a.status}
                            </span>
                          </div>
                        </div>
                        {canWithdraw && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleWithdrawApplication(a.id)}
                              className="px-3 py-1 rounded-full bg-white text-[#DC2626] text-[11px] font-semibold border border-gray-200 hover:bg-red-50 cursor-pointer"
                            >
                              {t('jobs.withdraw')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Saved Jobs */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <Bookmark className="w-4 h-4 text-[#4B6F1B]" />
                  <span>Saved Jobs ({savedJobs.length})</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('find')}
                  className="text-xs font-semibold text-[#4B6F1B] cursor-pointer"
                >
                  Browse all
                </button>
              </div>
              {savedJobs.length === 0 ? (
                <p className="text-xs text-[#6B7280]">Tap the bookmark icon on any job to save it.</p>
              ) : (
                <div className="space-y-2">
                  {savedJobs.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSelectedJob(j)}
                      className="w-full text-left p-3 rounded-xl bg-[#F3F4F6]/80 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#111827]">{j.work_name}</div>
                        <div className="text-[11px] text-[#6B7280]">
                          {j.org_name} · {j.event_date}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#4B6F1B] tabular-nums">
                        Rs {j.total_pay}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: MY GROUPS */}
        {tab === 'groups' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#111827]">{t('nav.myGroups')}</h1>

            <form
              onSubmit={handleCreateGroup}
              className="cc-card bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 flex gap-2 min-w-0"
            >
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New team name (2–20 workers)..."
                className="flex-1 min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
              <button
                type="submit"
                className="px-4 min-h-[44px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Create</span>
              </button>
            </form>

            {groupErr && <p className="text-xs text-[#DC2626] px-1">{groupErr}</p>}

            {groups.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-xs border border-gray-100 space-y-2">
                <Users className="w-8 h-8 text-[#4B6F1B] mx-auto" />
                <div className="text-sm font-bold text-[#111827]">No groups yet</div>
                <p className="text-xs text-[#6B7280]">
                  Create a group of 2 to 20 workers and invite friends by their registered phone number.
                </p>
              </div>
            ) : (
              groups.map((g) => {
                const isLeader = g.leader_id === user.id;
                return (
                  <div
                    key={g.id}
                    className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[#111827]">{g.name}</h3>
                        <div className="text-xs text-[#6B7280]">
                          Leader: {g.leader_name} · {g.accepted_count} accepted
                        </div>
                      </div>
                      {g.my_status === 'invited' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/groups/${g.id}/respond`, {
                                method: 'POST',
                                body: {accept: true},
                              });
                              loadAllData();
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/groups/${g.id}/respond`, {
                                method: 'POST',
                                body: {accept: false},
                              });
                              loadAllData();
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#F3F4F6] text-[#DC2626] text-xs font-semibold cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {g.members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#F3F4F6]/60 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-[#111827]">{m.full_name}</span>
                            <span className="text-[#6B7280] ml-1.5 tabular-nums">({m.phone})</span>
                            <span className="ml-2 text-[10px] font-semibold text-[#4B6F1B]">
                              {m.role === 'leader' ? 'Leader' : m.status}
                            </span>
                          </div>
                          {isLeader && m.worker_id !== user.id && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/groups/${g.id}/members/${m.worker_id}`, {
                                  method: 'DELETE',
                                });
                                loadAllData();
                              }}
                              className="p-1.5 text-[#DC2626] hover:bg-red-50 rounded-full cursor-pointer"
                              aria-label="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {isLeader && (
                      <div className="flex gap-2 pt-1 min-w-0">
                        <input
                          type="tel"
                          value={invitePhoneMap[g.id] || ''}
                          onChange={(e) =>
                            setInvitePhoneMap((p) => ({...p, [g.id]: e.target.value}))
                          }
                          placeholder="Invite by 10-digit mobile"
                          className="flex-1 min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[44px] text-base focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
                        />
                        <button
                          type="button"
                          onClick={() => handleInviteMember(g.id)}
                          className="px-4 min-h-[44px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          Invite
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB: FIND JOBS */}
        {tab === 'find' && (
          <FindJobsTab
            onSelectJob={(job) => setSelectedJob(job)}
            userLat={userCoords.lat}
            userLng={userCoords.lng}
            onLocationGranted={(c) => setUserCoords(c)}
          />
        )}

        {/* TAB: BOOKINGS */}
        {tab === 'bookings' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#111827]">{t('nav.bookings')}</h1>

            {bookings.length === 0 && applications.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-xs border border-gray-100 space-y-2">
                <CalendarCheck className="w-8 h-8 text-[#4B6F1B] mx-auto" />
                <div className="text-sm font-bold text-[#111827]">No bookings or applications yet</div>
                <p className="text-xs text-[#6B7280]">
                  Explore Find Jobs to apply directly with zero agent commission.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#111827]">{b.work_name}</div>
                        <div className="text-xs text-[#6B7280]">
                          {b.org_name} · {b.event_date} · {b.reporting_time}
                        </div>
                        <div className="text-xs text-[#6B7280] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-[#4B6F1B]" />
                          <span>{b.location_name}</span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${statusChipClass(
                          b.status
                        )}`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100">
                      <span className="font-semibold text-[#3C5A15] tabular-nums">
                        Agreed Pay: Rs {b.agreed_pay} (Rs 0 commission)
                      </span>
                      {b.attendance_status && (
                        <span className="text-[#6B7280]">
                          Attendance: <strong>{b.attendance_status}</strong>
                          {b.arrival_distance_m !== null ? ` (${b.arrival_distance_m}m)` : ''}
                        </span>
                      )}
                    </div>

                    {/* 1-hour Attendance Prompt */}
                    {b.status === 'Confirmed' &&
                      b.reminder_sent_at &&
                      b.attendance_status === 'Pending' && (
                        <div className="p-3 rounded-xl bg-[#F59E0B]/14 space-y-2">
                          <div className="text-xs font-bold text-[#B45309]">
                            {t('attendance.reminderPrompt')}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleAttendanceRespond(b.id, true)}
                              className="flex-1 min-h-[40px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                            >
                              {t('attendance.yesComing')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAttendanceRespond(b.id, false)}
                              className="flex-1 min-h-[40px] rounded-full bg-[#DC2626]/12 text-[#DC2626] text-xs font-semibold cursor-pointer"
                            >
                              {t('attendance.cannotAttend')}
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Actions for Confirmed */}
                    {b.status === 'Confirmed' && (
                      <div className="flex flex-wrap gap-2">
                        {b.attendance_status !== 'Arrived' && (
                          <button
                            type="button"
                            onClick={() => handleMarkArrived(b.id)}
                            className="px-4 min-h-[40px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                          >
                            {t('attendance.arrivedBtn')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/bookings/${b.id}/cancel`, {
                              method: 'POST',
                              body: {},
                            });
                            loadAllData();
                          }}
                          className="px-4 min-h-[40px] rounded-full bg-[#F3F4F6] text-[#DC2626] text-xs font-semibold cursor-pointer"
                        >
                          Cancel Booking
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSupportBookingId(b.id);
                            setShowSupportModal(true);
                          }}
                          className="px-4 min-h-[40px] rounded-full bg-[#F3F4F6] text-[#111827] text-xs font-semibold cursor-pointer"
                        >
                          Support
                        </button>
                      </div>
                    )}

                    {/* Payment Status + Actions */}
                    {b.payment_id && (
                      <div className="p-3 rounded-xl bg-[#F3F4F6]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-[#4B6F1B]" />
                          <span>
                            Payment: <strong>{b.payment_status}</strong>
                            {b.payment_method ? ` (${b.payment_method})` : ''}
                          </span>
                        </div>
                        {b.payment_status === 'paid_pending_confirm' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmPayment(b.payment_id!)}
                              className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                            >
                              Confirm Received
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDisputePayment(b.payment_id!)}
                              className="px-3 py-1.5 rounded-full bg-[#DC2626]/12 text-[#DC2626] text-xs font-semibold cursor-pointer"
                            >
                              Dispute
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Review after completion */}
                    {b.status === 'Completed' && !b.my_review_id && (
                      <button
                        type="button"
                        onClick={() => setReviewTarget({bookingId: b.id, name: b.org_name})}
                        className="px-4 min-h-[40px] rounded-full bg-[#F59E0B]/15 text-[#B45309] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Rate Organisation</span>
                      </button>
                    )}
                  </div>
                ))}

                {applications.length > 0 && (
                  <div className="pt-2 space-y-2.5">
                    <h2 className="text-xs font-bold text-[#6B7280] px-1">
                      {t('jobs.appliedJobs')} &amp; Recent Applications
                    </h2>
                    {applications.map((a) => {
                      const isDemoApp = a.is_demo === 1 || a.job_is_demo === 1;
                      const canWithdraw =
                        a.status === 'Applied' &&
                        (a.applicant_type === 'individual' || a.group_leader_id === user.id);
                      return (
                        <div
                          key={a.id}
                          className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenJobById(a.job_id)}
                              className="text-left min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-[#111827]">
                                  {a.work_name}
                                </span>
                                {isDemoApp && (
                                  <span className="px-2 py-0.5 rounded-full bg-gray-200 text-[#6B7280] text-[10px] font-bold">
                                    {t('jobs.demoTag')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#6B7280] mt-0.5">
                                {a.org_name} · {a.event_date} · Rs {a.total_pay}
                                {a.group_name ? ` · Group: ${a.group_name}` : ''}
                              </div>
                            </button>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${statusChipClass(
                                a.status
                              )}`}
                            >
                              {a.status}
                            </span>
                          </div>
                          {canWithdraw && (
                            <div className="flex justify-end pt-1 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={() => handleWithdrawApplication(a.id)}
                                className="px-3.5 py-1.5 rounded-full bg-[#F3F4F6] hover:bg-red-50 text-[#DC2626] text-[11px] font-semibold cursor-pointer"
                              >
                                {t('jobs.withdraw')}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: PROFILE */}
        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-[#111827]">{t('nav.profile')}</h1>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F3F4F6] text-xs font-semibold text-[#DC2626] cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#F3F4F6] overflow-hidden flex items-center justify-center shrink-0">
                {user.photo_url ? (
                  <img src={user.photo_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-7 h-7 text-[#6B7280]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-[#111827] flex items-center gap-1.5">
                  <span className="truncate">{user.full_name}</span>
                  {user.status === 'verified' && <CheckCircle2 className="w-4 h-4 text-[#4B6F1B]" />}
                </div>
                <div className="text-xs text-[#6B7280] tabular-nums">{user.phone}</div>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#4B6F1B] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Update Face Photo</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleSaveProfile}
              className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">Living Area</label>
                <input
                  type="text"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">Skills</label>
                <input
                  type="text"
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">Availability</label>
                <input
                  type="text"
                  value={editAvail}
                  onChange={(e) => setEditAvail(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>

              {/* Language */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-[#111827] mb-1.5">Language</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`flex-1 min-h-[40px] rounded-full text-xs font-semibold cursor-pointer ${
                      lang === 'en' ? 'bg-[#4B6F1B] text-white' : 'bg-[#F3F4F6] text-[#111827]'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('ta')}
                    className={`flex-1 min-h-[40px] rounded-full text-xs font-semibold cursor-pointer ${
                      lang === 'ta' ? 'bg-[#4B6F1B] text-white' : 'bg-[#F3F4F6] text-[#111827]'
                    }`}
                  >
                    தமிழ்
                  </button>
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="pt-2 space-y-2 border-t border-gray-100">
                <div className="text-xs font-semibold text-[#111827]">Notification Preferences</div>
                {(
                  [
                    ['emergency', 'Emergency replacement alerts'],
                    ['bookings', 'Booking confirmations'],
                    ['attendance', '1-hour attendance reminders'],
                    ['payments', 'Payment updates'],
                    ['support', 'Support replies'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between text-xs text-[#111827]">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={notifPrefs[k]}
                      onChange={(e) => setNotifPrefs((p) => ({...p, [k]: e.target.checked}))}
                      className="w-4 h-4 accent-[#4B6F1B]"
                    />
                  </label>
                ))}
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full min-h-[46px] rounded-full bg-[#4B6F1B] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Save Settings</span>
              </button>
            </form>

            <PWAInstallButton />

            {/* Delete demo data */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#111827]">Demo Applications</div>
                <div className="text-xs text-[#6B7280]">
                  Remove your practice applications from demo preview jobs.
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearDemoApplications}
                className="px-4 min-h-[40px] rounded-full bg-[#F3F4F6] hover:bg-gray-200 text-[#111827] text-xs font-semibold cursor-pointer"
              >
                {t('jobs.clearDemoApps')}
              </button>
            </div>

            {/* Support Tickets */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#4B6F1B]" />
                  <span>Support Tickets</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSupportBookingId(null);
                    setShowSupportModal(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                >
                  New Ticket
                </button>
              </div>
              {tickets.map((tk) => (
                <div key={tk.id} className="p-3 rounded-xl bg-[#F3F4F6]/70 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-[#111827]">
                    <span>{tk.category}</span>
                    <span className="text-[#4B6F1B]">{tk.status}</span>
                  </div>
                  <p className="text-[#6B7280]">{tk.description}</p>
                  {tk.admin_response && (
                    <div className="mt-1 p-2 rounded-lg bg-white text-[#111827]">
                      <strong>Admin:</strong> {tk.admin_response}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fixed White Bottom Navigation */}
      <nav className="shrink-0 z-20 bg-white border-t border-gray-200 pb-safe">
        <div className="grid grid-cols-5 h-16">
          {(
            [
              {id: 'home', icon: Home, label: t('nav.home')},
              {id: 'groups', icon: Users, label: t('nav.myGroups')},
              {id: 'find', icon: Search, label: t('nav.findJobs')},
              {id: 'bookings', icon: Briefcase, label: t('nav.bookings')},
              {id: 'profile', icon: UserIcon, label: t('nav.profile')},
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-w-0 px-0.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  active ? 'text-[#4B6F1B]' : 'text-[#6B7280]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-semibold truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <JobDetailModal
        job={selectedJob}
        currentUserId={user.id}
        userLat={userCoords.lat}
        userLng={userCoords.lng}
        onClose={() => setSelectedJob(null)}
        onApplied={loadAllData}
        onToggleSave={handleToggleSave}
      />

      <NotificationsDrawer
        isOpen={showNotifDrawer}
        notifications={notifications}
        onClose={() => setShowNotifDrawer(false)}
        onRefresh={loadAllData}
      />

      <SupportTicketModal
        isOpen={showSupportModal}
        bookingId={supportBookingId}
        onClose={() => setShowSupportModal(false)}
        onCreated={loadAllData}
      />

      <ReviewModal
        isOpen={Boolean(reviewTarget)}
        bookingId={reviewTarget?.bookingId || null}
        targetName={reviewTarget?.name || ''}
        onClose={() => setReviewTarget(null)}
        onSubmitted={loadAllData}
      />

      <CameraCaptureModal
        isOpen={showCamera}
        title="Update Face Photo"
        onClose={() => setShowCamera(false)}
        onUploaded={async (url) => {
          await apiRequest('/api/profile', {method: 'PUT', body: {photo_url: url}});
          onRefreshSession();
        }}
      />
    </div>
  );
};

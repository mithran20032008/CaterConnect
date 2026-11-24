import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  LayoutDashboard,
  Loader2,
  LogOut,
  PlusCircle,
  Star,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import {AutoVerifyBanner} from './AutoVerifyBanner';
import {CameraCaptureModal} from './CameraCaptureModal';
import {NotificationsDrawer} from './NotificationsDrawer';
import {PostJobTab} from './PostJobTab';
import {PWAInstallButton} from './PWAInstallButton';
import {ReviewModal} from './ReviewModal';
import {SupportTicketModal} from './SupportTicketModal';
import {apiRequest} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Job, NotificationItem, Organisation, User} from '../types';

type OrgTab = 'dashboard' | 'post' | 'applications' | 'bookings' | 'profile';

interface OrgAppRow {
  id: number;
  job_id: number;
  work_name: string;
  event_date: string;
  serve_type: string;
  total_pay: number;
  allow_partial_group: number;
  applicant_type: 'individual' | 'group';
  worker_id: number | null;
  worker_name: string | null;
  worker_phone: string | null;
  worker_photo: string | null;
  work_category: string | null;
  skills: string | null;
  experience: string | null;
  worker_rating: number | null;
  group_name: string | null;
  group_members: {
    worker_id: number;
    full_name: string;
    phone: string;
    work_category: string;
    rating_avg: number;
  }[];
  status: string;
}

interface OrgBookingRow {
  id: number;
  job_id: number;
  work_name: string;
  event_date: string;
  reporting_time: string;
  location_name: string;
  agreed_pay: number;
  worker_name: string;
  worker_phone: string;
  worker_photo: string;
  work_category: string;
  group_name: string | null;
  status: string;
  attendance_status: string | null;
  arrival_verified: number | null;
  arrival_distance_m: number | null;
  flagged: number | null;
  payment_id: number | null;
  payment_status: string | null;
  my_review_id: number | null;
}

interface ReplacementCandidate {
  id: number;
  full_name: string;
  phone: string;
  work_category: string;
  skills: string;
  experience: string;
  rating_avg: number;
  distance_km: number;
  score: number;
}

interface OrgReplacement {
  id: number;
  job_id: number;
  work_name: string;
  vacancies_needed: number;
  filled_count: number;
  status: string;
  offers: {
    id: number;
    worker_name: string;
    worker_phone: string;
    distance_km: number;
    status: string;
  }[];
}

interface OrgAppProps {
  user: User;
  organisation: Organisation;
  autoVerifyMinutes: number;
  onRefreshSession: () => void;
  onLogout: () => void;
}

export const OrgApp: React.FC<OrgAppProps> = ({
  user,
  organisation,
  autoVerifyMinutes,
  onRefreshSession,
  onLogout,
}) => {
  const {lang, setLang, t} = useI18n();
  const [tab, setTab] = useState<OrgTab>('dashboard');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({top: 0});
  }, [tab]);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<(Job & {applicant_count?: number})[]>([]);
  const [applications, setApplications] = useState<OrgAppRow[]>([]);
  const [bookings, setBookings] = useState<OrgBookingRow[]>([]);
  const [replacements, setReplacements] = useState<OrgReplacement[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [partialSelections, setPartialSelections] = useState<Record<number, number[]>>({});
  const [candidateModalJob, setCandidateModalJob] = useState<{
    jobId: number;
    workName: string;
    candidates: ReplacementCandidate[];
  } | null>(null);

  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{bookingId: number; name: string} | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [msg, setMsg] = useState('');

  // Profile edit
  const [bizName, setBizName] = useState(organisation.business_name);
  const [ownerName, setOwnerName] = useState(organisation.owner_name);
  const [address, setAddress] = useState(organisation.address);
  const [contact, setContact] = useState(organisation.contact_details);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    const [jRes, aRes, bRes, rRes, nRes] = await Promise.all([
      apiRequest<{jobs: Job[]}>('/api/org/jobs').catch(() => ({jobs: []})),
      apiRequest<{applications: OrgAppRow[]}>('/api/org/applications').catch(() => ({
        applications: [],
      })),
      apiRequest<{bookings: OrgBookingRow[]}>('/api/org/bookings').catch(() => ({bookings: []})),
      apiRequest<{replacements: OrgReplacement[]}>('/api/org/replacements').catch(() => ({
        replacements: [],
      })),
      apiRequest<{items: NotificationItem[]; unreadCount: number}>('/api/notifications').catch(
        () => ({items: [], unreadCount: 0})
      ),
    ]);
    setJobs(jRes.jobs);
    setApplications(aRes.applications);
    setBookings(bRes.bookings);
    setReplacements(rRes.replacements);
    setNotifications(nRes.items);
    setUnreadCount(nRes.unreadCount);
  }, []);

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 20000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const handleAcceptApp = async (app: OrgAppRow) => {
    setMsg('');
    try {
      const selected = partialSelections[app.id];
      const res = await apiRequest<{bookingStatus: string}>(
        `/api/org/applications/${app.id}/accept`,
        {
          method: 'POST',
          body: selected ? {selectedWorkerIds: selected} : {},
        }
      );
      setMsg(`Application accepted (${res.bookingStatus}).`);
      loadAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to accept.');
    }
  };

  const handleRejectApp = async (appId: number) => {
    await apiRequest(`/api/org/applications/${appId}/reject`, {method: 'POST', body: {}});
    loadAll();
  };

  const openReplacementModal = async (jobId: number, workName: string) => {
    const res = await apiRequest<{candidates: ReplacementCandidate[]}>(
      `/api/org/jobs/${jobId}/replacement-candidates`
    );
    setCandidateModalJob({jobId, workName, candidates: res.candidates});
  };

  const triggerReplacement = async (jobId: number) => {
    const res = await apiRequest<{vacanciesNeeded: number; offersSent: number}>(
      `/api/org/jobs/${jobId}/trigger-replacement`,
      {method: 'POST', body: {includeFlagged: true}}
    );
    setCandidateModalJob(null);
    setMsg(
      `Emergency alert sent to ${res.offersSent} nearby worker(s) for ${res.vacanciesNeeded} spot(s)!`
    );
    loadAll();
  };

  const approveReplacement = async (offerId: number) => {
    await apiRequest(`/api/org/replacement-offers/${offerId}/approve`, {
      method: 'POST',
      body: {},
    });
    setMsg('Replacement worker confirmed!');
    loadAll();
  };

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
            {organisation.business_name}
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
          role="organisation"
          onAutoVerified={onRefreshSession}
        />

        {msg && (
          <div className="p-3 rounded-2xl bg-[#4B6F1B]/12 border border-[#4B6F1B]/25 text-xs font-semibold text-[#3C5A15] flex items-center justify-between">
            <span>{msg}</span>
            <button type="button" onClick={() => setMsg('')} className="underline cursor-pointer">
              OK
            </button>
          </div>
        )}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="space-y-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#111827] truncate">
                {organisation.business_name}
              </h1>
              <p className="text-xs text-[#6B7280] truncate">
                {organisation.category} · {organisation.city}
              </p>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Active Jobs</div>
                <div className="text-2xl font-extrabold text-[#4B6F1B] tabular-nums mt-1">
                  {jobs.length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Applications</div>
                <div className="text-2xl font-extrabold text-[#111827] tabular-nums mt-1">
                  {applications.filter((a) => a.status === 'Applied').length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Bookings</div>
                <div className="text-2xl font-extrabold text-[#111827] tabular-nums mt-1">
                  {bookings.length}
                </div>
              </div>
              <div className="cc-card p-3.5 rounded-2xl bg-white shadow-xs border border-gray-100 min-w-0">
                <div className="text-xs text-[#6B7280] truncate">Arrived</div>
                <div className="text-2xl font-extrabold text-[#3C5A15] tabular-nums mt-1">
                  {bookings.filter((b) => b.attendance_status === 'Arrived').length}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <h2 className="text-sm font-bold text-[#111827]">Your Posted Jobs</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingJob(null);
                  setTab('post');
                }}
                className="px-4 py-2 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
              >
                + Post New Job
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-xs border border-gray-100 space-y-2">
                <PlusCircle className="w-8 h-8 text-[#4B6F1B] mx-auto" />
                <div className="text-sm font-bold text-[#111827]">No jobs posted yet</div>
                <p className="text-xs text-[#6B7280]">
                  Post your first event requirement to hire verified catering staff directly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#111827]">{j.work_name}</div>
                        <div className="text-xs text-[#6B7280]">
                          {j.event_date} · {j.reporting_time} · {j.location_name}
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-[#4B6F1B] tabular-nums">
                        Rs {j.total_pay}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-gray-100">
                      <span className="font-semibold text-[#111827] tabular-nums">
                        {j.booked_count} / {j.workers_required} booked · {j.applicant_count || 0}{' '}
                        applications
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openReplacementModal(j.id, j.work_name)}
                          className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#B45309] font-semibold cursor-pointer"
                        >
                          Emergency Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingJob(j);
                            setTab('post');
                          }}
                          className="p-1.5 rounded-full bg-[#F3F4F6] text-[#111827] cursor-pointer"
                          aria-label="Edit job"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiRequest(`/api/jobs/${j.id}`, {method: 'DELETE'});
                              loadAll();
                            } catch (err) {
                              setMsg(err instanceof Error ? err.message : 'Cannot delete job.');
                            }
                          }}
                          className="p-1.5 rounded-full bg-[#F3F4F6] text-[#DC2626] cursor-pointer"
                          aria-label="Delete job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POST JOB */}
        {tab === 'post' && (
          <PostJobTab
            user={user}
            organisation={organisation}
            autoVerifyMinutes={autoVerifyMinutes}
            editingJob={editingJob}
            onAutoVerified={onRefreshSession}
            onJobSaved={() => {
              setEditingJob(null);
              loadAll();
              setTab('dashboard');
            }}
            onCancelEdit={() => {
              setEditingJob(null);
              setTab('dashboard');
            }}
          />
        )}

        {/* APPLICATIONS */}
        {tab === 'applications' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#111827]">{t('nav.applications')}</h1>
            {applications.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-xs border border-gray-100 text-xs text-[#6B7280]">
                No worker applications yet.
              </div>
            ) : (
              applications.map((a) => (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#F3F4F6] overflow-hidden flex items-center justify-center shrink-0">
                        {a.worker_photo ? (
                          <img
                            src={a.worker_photo}
                            alt={a.worker_name || ''}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Users className="w-5 h-5 text-[#4B6F1B]" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#111827]">
                          {a.applicant_type === 'group'
                            ? `Group: ${a.group_name} (${a.group_members.length} members)`
                            : a.worker_name}
                        </div>
                        <div className="text-xs text-[#6B7280]">
                          For: {a.work_name} ({a.event_date})
                        </div>
                        {a.applicant_type === 'individual' && (
                          <div className="text-[11px] text-[#6B7280]">
                            {a.work_category} · {a.skills || 'Catering crew'} ·{' '}
                            {a.experience || 'Experienced'} · ★{' '}
                            {a.worker_rating ? a.worker_rating.toFixed(1) : 'New'}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-[#F3F4F6] text-[11px] font-bold">
                      {a.status}
                    </span>
                  </div>

                  {a.applicant_type === 'group' && a.group_members.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#F3F4F6]/70 space-y-1.5 text-xs">
                      <div className="font-semibold text-[#111827]">
                        Members {a.allow_partial_group ? '(you can uncheck for partial acceptance)' : '(full group required)'}:
                      </div>
                      {a.group_members.map((m) => {
                        const sel =
                          partialSelections[a.id] ?? a.group_members.map((x) => x.worker_id);
                        const checked = sel.includes(m.worker_id);
                        return (
                          <label key={m.worker_id} className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              {a.allow_partial_group === 1 && a.status === 'Applied' && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...sel, m.worker_id]
                                      : sel.filter((id) => id !== m.worker_id);
                                    setPartialSelections((p) => ({...p, [a.id]: next}));
                                  }}
                                  className="accent-[#4B6F1B]"
                                />
                              )}
                              <span>{m.full_name}</span>
                            </span>
                            <span className="text-[#6B7280]">{m.work_category}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {a.status === 'Applied' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptApp(a)}
                        className="flex-1 min-h-[42px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
                      >
                        Accept &amp; Request Slot
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectApp(a.id)}
                        className="px-4 min-h-[42px] rounded-full bg-[#F3F4F6] text-[#DC2626] text-xs font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* BOOKINGS & ATTENDANCE & REPLACEMENTS */}
        {tab === 'bookings' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-[#111827]">{t('nav.bookings')} &amp; Attendance</h1>

            {/* Active Replacement Offers accepted by workers */}
            {replacements.some((r) => r.offers.some((o) => o.status === 'accepted')) && (
              <div className="p-4 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 space-y-2">
                <div className="text-xs font-bold text-[#B45309]">
                  Replacement Workers Ready for Approval
                </div>
                {replacements.map((r) =>
                  r.offers
                    .filter((o) => o.status === 'accepted')
                    .map((o) => (
                      <div
                        key={o.id}
                        className="bg-white p-3 rounded-xl flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <strong>{o.worker_name}</strong> ({o.distance_km} km) for {r.work_name}
                        </div>
                        <button
                          type="button"
                          onClick={() => approveReplacement(o.id)}
                          className="px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer"
                        >
                          Approve &amp; Confirm
                        </button>
                      </div>
                    ))
                )}
              </div>
            )}

            {bookings.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-xs border border-gray-100 text-xs text-[#6B7280]">
                No bookings yet. Accept applications to lock in your team.
              </div>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#111827]">
                        {b.worker_name}{' '}
                        {b.group_name ? (
                          <span className="text-xs font-normal text-[#6B7280]">
                            ({b.group_name})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[#6B7280]">
                        {b.work_name} · {b.event_date} · {b.reporting_time}
                      </div>
                      <div className="text-xs text-[#6B7280] tabular-nums">
                        Phone: {b.worker_phone} · Pay: Rs {b.agreed_pay}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-[#F3F4F6] text-[11px] font-bold">
                      {b.status}
                    </span>
                  </div>

                  {/* Attendance summary */}
                  {b.status === 'Confirmed' && (
                    <div className="p-3 rounded-xl bg-[#F3F4F6]/70 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Attendance: <strong>{b.attendance_status || 'Pending'}</strong>
                        </span>
                        {b.attendance_status === 'Arrived' && (
                          <span
                            className={`font-semibold ${
                              b.arrival_verified ? 'text-[#4B6F1B]' : 'text-[#F59E0B]'
                            }`}
                          >
                            {b.arrival_verified
                              ? `GPS Verified (${b.arrival_distance_m}m)`
                              : b.arrival_distance_m !== null
                              ? `Outside geofence (${b.arrival_distance_m}m)`
                              : 'GPS not shared'}
                          </span>
                        )}
                      </div>

                      {/* Dev trigger buttons (Section 14) */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/dev/bookings/${b.id}/trigger-reminder`, {
                              method: 'POST',
                              body: {},
                            });
                            setMsg('1-hour reminder sent to worker!');
                            loadAll();
                          }}
                          className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[11px] font-semibold cursor-pointer"
                        >
                          Trigger reminder now
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/dev/jobs/${b.job_id}/start-in-one-hour`, {
                              method: 'POST',
                              body: {},
                            });
                            setMsg('Event start time set to 1 hour from now!');
                            loadAll();
                          }}
                          className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-[11px] font-semibold cursor-pointer"
                        >
                          Set event to start in 1 hour
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/org/bookings/${b.id}/flag-no-response`, {
                              method: 'POST',
                              body: {},
                            });
                            loadAll();
                          }}
                          className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#B45309] text-[11px] font-semibold cursor-pointer"
                        >
                          Flag No Response
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/org/bookings/${b.id}/complete`, {
                              method: 'POST',
                              body: {},
                            });
                            loadAll();
                          }}
                          className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Mark Completed
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Payment & Rating */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {b.payment_id && (
                      <div className="flex items-center gap-2">
                        <span>
                          Payment: <strong>{b.payment_status}</strong>
                        </span>
                        {b.payment_status === 'unpaid' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/org/payments/${b.payment_id}/mark-paid`, {
                                method: 'POST',
                                body: {method: 'Cash / Direct UPI'},
                              });
                              setMsg('Marked paid (manual direct transfer).');
                              loadAll();
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer"
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    )}

                    {b.status === 'Completed' && !b.my_review_id && (
                      <button
                        type="button"
                        onClick={() => setReviewTarget({bookingId: b.id, name: b.worker_name})}
                        className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#B45309] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Rate Worker</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* PROFILE */}
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
                {organisation.logo_url ? (
                  <img
                    src={organisation.logo_url}
                    alt={organisation.business_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-7 h-7 text-[#6B7280]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-[#111827] flex items-center gap-1.5">
                  <span className="truncate">{organisation.business_name}</span>
                  {organisation.status === 'verified' && (
                    <CheckCircle2 className="w-4 h-4 text-[#4B6F1B]" />
                  )}
                </div>
                <div className="text-xs text-[#6B7280] tabular-nums">{organisation.phone}</div>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#4B6F1B] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Update Business Logo</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                await apiRequest('/api/profile', {
                  method: 'PUT',
                  body: {
                    business_name: bizName,
                    owner_name: ownerName,
                    address,
                    contact_details: contact,
                    language: lang,
                  },
                });
                setSaving(false);
                setMsg('Organisation profile updated!');
                onRefreshSession();
              }}
              className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold mb-1">Business Name</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Owner Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`flex-1 min-h-[40px] rounded-full text-xs font-semibold cursor-pointer ${
                    lang === 'en' ? 'bg-[#4B6F1B] text-white' : 'bg-[#F3F4F6]'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ta')}
                  className={`flex-1 min-h-[40px] rounded-full text-xs font-semibold cursor-pointer ${
                    lang === 'ta' ? 'bg-[#4B6F1B] text-white' : 'bg-[#F3F4F6]'
                  }`}
                >
                  தமிழ்
                </button>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[46px] rounded-full bg-[#4B6F1B] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Save Settings</span>
              </button>
            </form>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setShowSupportModal(true)}
              className="w-full min-h-[46px] rounded-full bg-white border border-gray-200 text-xs font-semibold text-[#111827] cursor-pointer"
            >
              Contact CaterConnect Support
            </button>
          </div>
        )}
      </div>

      {/* Emergency Replacement Ranked Candidates Modal */}
      {candidateModalJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] p-5 max-h-[88dvh] flex flex-col space-y-4 pb-safe shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[#111827] truncate">
                  Emergency Replacement: {candidateModalJob.workName}
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Ranked nearby eligible workers (no overlapping bookings)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCandidateModalJob(null)}
                className="text-xs font-semibold text-[#6B7280] shrink-0 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 app-scroll space-y-2">
              {candidateModalJob.candidates.length === 0 ? (
                <p className="text-xs text-[#6B7280] py-6 text-center">
                  No verified available workers found right now.
                </p>
              ) : (
                candidateModalJob.candidates.map((c) => (
                  <div
                    key={c.id}
                    className="cc-card p-3 rounded-xl bg-[#F3F4F6]/80 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#111827] truncate">{c.full_name}</div>
                      <div className="text-[#6B7280] truncate">
                        {c.work_category} · {c.distance_km} km · ★{' '}
                        {c.rating_avg > 0 ? c.rating_avg.toFixed(1) : 'New'}
                      </div>
                    </div>
                    <span className="font-bold text-[#4B6F1B] tabular-nums shrink-0">
                      Score {c.score}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => triggerReplacement(candidateModalJob.jobId)}
              className="w-full min-h-[48px] rounded-full bg-[#F59E0B] hover:bg-amber-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">Send Emergency Job Alert</span>
            </button>
          </div>
        </div>
      )}

      {/* Fixed Bottom Nav */}
      <nav className="shrink-0 z-20 bg-white border-t border-gray-200 pb-safe">
        <div className="grid grid-cols-5 h-16">
          {(
            [
              {id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard')},
              {id: 'post', icon: PlusCircle, label: t('nav.postJob')},
              {id: 'applications', icon: ClipboardList, label: t('nav.applications')},
              {id: 'bookings', icon: CalendarCheck, label: t('nav.bookings')},
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

      <NotificationsDrawer
        isOpen={showNotifDrawer}
        notifications={notifications}
        onClose={() => setShowNotifDrawer(false)}
        onRefresh={loadAll}
      />

      <SupportTicketModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        onCreated={loadAll}
      />

      <ReviewModal
        isOpen={Boolean(reviewTarget)}
        bookingId={reviewTarget?.bookingId || null}
        targetName={reviewTarget?.name || ''}
        onClose={() => setReviewTarget(null)}
        onSubmitted={loadAll}
      />

      <CameraCaptureModal
        isOpen={showCamera}
        title="Business Logo"
        onClose={() => setShowCamera(false)}
        onUploaded={async (url) => {
          await apiRequest('/api/profile', {method: 'PUT', body: {logo_url: url}});
          onRefreshSession();
        }}
      />
    </div>
  );
};

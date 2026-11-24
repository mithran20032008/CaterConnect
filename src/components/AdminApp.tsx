import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  LogOut,
  MessageSquare,
  Shield,
  Sliders,
  Users,
} from 'lucide-react';
import {apiRequest} from '../lib/api';

interface AdminDashboardData {
  workers: {
    id: number;
    full_name: string;
    phone: string;
    city: string;
    work_category: string;
    verified_by: string;
    status: string;
  }[];
  organisations: {
    id: number;
    user_id: number;
    business_name: string;
    owner_name: string;
    phone: string;
    city: string;
    verified_by: string;
    status: string;
  }[];
  jobs: {
    id: number;
    work_name: string;
    org_name: string;
    event_date: string;
    workers_required: number;
    booked_count: number;
    is_demo: number;
    status: string;
  }[];
  bookings: {
    id: number;
    job_id: number;
    work_name: string;
    org_name: string;
    worker_name: string;
    worker_phone: string;
    group_name: string | null;
    event_date: string;
    reporting_time: string;
    status: string;
    attendance_status: string | null;
    arrival_verified: number | null;
    arrival_distance_m: number | null;
  }[];
  replacements: {
    id: number;
    work_name: string;
    org_name: string;
    vacancies_needed: number;
    filled_count: number;
    status: string;
  }[];
  tickets: {
    id: number;
    user_name: string;
    user_phone: string;
    user_role: string;
    category: string;
    description: string;
    admin_response: string;
    status: string;
  }[];
  payments: {
    id: number;
    work_name: string;
    org_name: string;
    worker_name: string;
    agreed_amount: number;
    dispute_reason: string;
    status: string;
  }[];
  config: {
    autoVerifyMinutes: number;
    maxGroupSize: number;
    geofenceRadiusMeters: number;
    seedDemoJobs: boolean;
    autoConfirmBookings: boolean;
    brandColor: string;
    isDefaultAdminPhone: boolean;
    adminPhone: string;
  };
}

export const AdminApp: React.FC<{onLogout: () => void}> = ({onLogout}) => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [tab, setTab] = useState<'slots' | 'accounts' | 'support' | 'config'>('slots');
  const [replyMap, setReplyMap] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({top: 0});
  }, [tab]);

  const load = useCallback(async () => {
    const res = await apiRequest<AdminDashboardData>('/api/admin/dashboard');
    setData(res);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const setAccountStatus = async (userId: number, status: 'verified' | 'rejected' | 'suspended') => {
    await apiRequest(`/api/admin/users/${userId}/status`, {method: 'POST', body: {status}});
    setMsg(`Account updated to ${status}.`);
    load();
  };

  const confirmSlot = async (bookingId: number) => {
    try {
      await apiRequest(`/api/admin/bookings/${bookingId}/confirm`, {method: 'POST', body: {}});
      setMsg(`Booking #${bookingId} confirmed! Worker and organisation notified.`);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to confirm booking.');
    }
  };

  const replyTicket = async (ticketId: number, status: 'in_progress' | 'resolved') => {
    const text = replyMap[ticketId] || 'Reviewed by CaterConnect support.';
    await apiRequest(`/api/admin/tickets/${ticketId}/reply`, {
      method: 'POST',
      body: {response: text, status},
    });
    setMsg('Reply sent to user.');
    load();
  };

  if (!data) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-3 border-[#4B6F1B]/30 border-t-[#4B6F1B] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#F9FAFB] text-[#111827] flex flex-col overflow-hidden">
      {/* Fixed Green Top Bar */}
      <header className="shrink-0 bg-gradient-to-r from-[#4B6F1B] to-[#5D8722] text-white pt-safe px-4 pb-3 z-20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-5 h-5 shrink-0" />
            <h1 className="text-base font-bold truncate">CaterConnect Admin</h1>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-xs font-semibold cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Single Scrollable Middle Content Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 app-scroll px-3.5 py-4 pb-10 space-y-4">
        {data.config.isDefaultAdminPhone && (
          <div className="p-3.5 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 flex items-start gap-2.5 text-xs text-[#111827]">
            <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
            <span>
              <strong>Security reminder:</strong> Default admin number ({data.config.adminPhone}) is active. Change the admin phone number before real users join!
            </span>
          </div>
        )}

        {msg && (
          <div className="p-3 rounded-2xl bg-[#4B6F1B]/12 text-xs font-semibold text-[#3C5A15] flex justify-between gap-2">
            <span>{msg}</span>
            <button type="button" onClick={() => setMsg('')} className="underline cursor-pointer shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* SLOTS & ATTENDANCE */}
        {tab === 'slots' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold">Bookings &amp; Slot Confirmation ({data.bookings.length})</h2>
            {data.bookings.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-gray-100 text-xs text-[#6B7280]">
                No real bookings yet.
              </div>
            ) : (
              data.bookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-sm text-[#111827]">
                      #{b.id} · {b.work_name} ({b.org_name})
                    </div>
                    <div className="text-[#6B7280]">
                      Worker: {b.worker_name} ({b.worker_phone})
                      {b.group_name ? ` · Group: ${b.group_name}` : ''} · {b.event_date}{' '}
                      {b.reporting_time}
                    </div>
                    <div className="text-[#6B7280] mt-0.5">
                      Status: <strong>{b.status}</strong> · Attendance:{' '}
                      <strong>{b.attendance_status || '—'}</strong>
                      {b.arrival_distance_m !== null ? ` (${b.arrival_distance_m}m)` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {b.status === 'Pending admin review' && (
                      <button
                        type="button"
                        onClick={() => confirmSlot(b.id)}
                        className="px-4 py-2 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer"
                      >
                        Confirm Slot
                      </button>
                    )}
                    {b.status !== 'Confirmed' && b.status !== 'Pending admin review' && (
                      <span className="px-3 py-1.5 rounded-full bg-[#F3F4F6] font-semibold">
                        {b.status}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}

            <h2 className="text-base font-bold pt-2">Jobs Overview ({data.jobs.length})</h2>
            <div className="grid grid-cols-1 gap-3">
              {data.jobs.map((j) => (
                <div key={j.id} className="bg-white p-3.5 rounded-2xl border border-gray-100 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>{j.work_name}</span>
                    <span>{j.is_demo ? 'DEMO' : 'REAL'}</span>
                  </div>
                  <div className="text-[#6B7280]">
                    {j.org_name} · {j.event_date} · {j.booked_count}/{j.workers_required} booked
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WORKERS & ORGS */}
        {tab === 'accounts' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold">Organisations ({data.organisations.length})</h2>
            {data.organisations.map((o) => (
              <div
                key={o.id}
                className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-sm">{o.business_name}</div>
                  <div className="text-[#6B7280]">
                    Owner: {o.owner_name} · {o.phone} · {o.city}
                  </div>
                  <div className="mt-1">
                    Status: <strong>{o.status}</strong>{' '}
                    {o.verified_by === 'auto' && (
                      <span className="px-2 py-0.5 rounded-full bg-[#4B6F1B]/12 text-[#3C5A15] font-semibold ml-1">
                        Auto-verified
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAccountStatus(o.user_id, 'verified')}
                    className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer"
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountStatus(o.user_id, 'rejected')}
                    className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#B45309] font-semibold cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountStatus(o.user_id, 'suspended')}
                    className="px-3 py-1.5 rounded-full bg-[#DC2626]/12 text-[#DC2626] font-semibold cursor-pointer"
                  >
                    Suspend
                  </button>
                </div>
              </div>
            ))}

            <h2 className="text-base font-bold pt-2">Workers ({data.workers.length})</h2>
            {data.workers.map((w) => (
              <div
                key={w.id}
                className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-sm">{w.full_name}</div>
                  <div className="text-[#6B7280]">
                    {w.phone} · {w.city} · {w.work_category}
                  </div>
                  <div className="mt-1">
                    Status: <strong>{w.status}</strong>{' '}
                    {w.verified_by === 'auto' && (
                      <span className="px-2 py-0.5 rounded-full bg-[#4B6F1B]/12 text-[#3C5A15] font-semibold ml-1">
                        Auto-verified
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAccountStatus(w.id, 'verified')}
                    className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer"
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountStatus(w.id, 'rejected')}
                    className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#B45309] font-semibold cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountStatus(w.id, 'suspended')}
                    className="px-3 py-1.5 rounded-full bg-[#DC2626]/12 text-[#DC2626] font-semibold cursor-pointer"
                  >
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAYMENTS & SUPPORT TICKETS */}
        {tab === 'support' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-[#4B6F1B]" />
              <span>Payment Records ({data.payments.length})</span>
            </h2>
            {data.payments.map((p) => (
              <div key={p.id} className="bg-white p-4 rounded-2xl border border-gray-100 text-xs">
                <div className="font-bold">
                  {p.work_name} · {p.worker_name} ← {p.org_name}
                </div>
                <div className="text-[#6B7280]">
                  Amount: Rs {p.agreed_amount} · Status: <strong>{p.status}</strong>
                  {p.dispute_reason ? ` · Dispute: ${p.dispute_reason}` : ''}
                </div>
              </div>
            ))}

            <h2 className="text-base font-bold pt-2">Support Tickets ({data.tickets.length})</h2>
            {data.tickets.map((tk) => (
              <div key={tk.id} className="bg-white p-4 rounded-2xl border border-gray-100 text-xs space-y-2">
                <div className="flex justify-between font-bold">
                  <span>
                    #{tk.id} · {tk.category} ({tk.user_name}, {tk.user_role})
                  </span>
                  <span className="text-[#4B6F1B]">{tk.status}</span>
                </div>
                <p className="text-[#6B7280]">{tk.description}</p>
                <div className="flex gap-2 min-w-0">
                  <input
                    type="text"
                    value={replyMap[tk.id] ?? tk.admin_response ?? ''}
                    onChange={(e) => setReplyMap((m) => ({...m, [tk.id]: e.target.value}))}
                    placeholder="Write admin response..."
                    className="flex-1 min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[42px] text-base"
                  />
                  <button
                    type="button"
                    onClick={() => replyTicket(tk.id, 'resolved')}
                    className="px-4 py-1.5 rounded-full bg-[#4B6F1B] text-white font-semibold cursor-pointer shrink-0"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONFIG & PRODUCTION CHECKLIST */}
        {tab === 'config' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 text-xs">
              <h2 className="text-base font-bold text-[#111827]">Active Defaults</h2>
              <div className="p-3 rounded-xl bg-[#F59E0B]/12 text-[#B45309] font-medium">
                Note: 2-minute auto-verification is enabled for demo/testing convenience only. Set{' '}
                <code>AUTO_VERIFY_MINUTES=0</code> in production.
              </div>
              <ul className="space-y-1 text-[#111827] tabular-nums pt-1">
                <li>AUTO_VERIFY_MINUTES: <strong>{data.config.autoVerifyMinutes}</strong></li>
                <li>MAX_GROUP_SIZE: <strong>{data.config.maxGroupSize}</strong></li>
                <li>GEOFENCE_RADIUS_METERS: <strong>{data.config.geofenceRadiusMeters}</strong></li>
                <li>SEED_DEMO_JOBS: <strong>{String(data.config.seedDemoJobs)}</strong></li>
                <li>AUTO_CONFIRM_BOOKINGS: <strong>{String(data.config.autoConfirmBookings)}</strong></li>
                <li>BRAND_COLOR: <strong>{data.config.brandColor}</strong></li>
              </ul>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 text-xs">
              <h2 className="text-base font-bold text-[#111827]">Production Launch Checklist</h2>
              <ul className="list-disc pl-5 space-y-1.5 text-[#6B7280]">
                <li>Replace TestModeSmsProvider with a real SMS OTP provider (MSG91 / Twilio / Kaleyra).</li>
                <li>Set <code>AUTO_VERIFY_MINUTES=0</code> so admin manually verifies businesses &amp; workers.</li>
                <li>Set <code>SEED_DEMO_JOBS=false</code> to hide the 12 demo preview jobs.</li>
                <li>Change the default admin phone number (<code>9000000000</code>) to a real admin mobile.</li>
                <li>Schedule daily backups of <code>./data/caterconnect.db</code> and <code>./uploads</code>.</li>
                <li>Host behind HTTPS on a provider with a persistent disk (Railway Volume, Render Disk, or VPS).</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Fixed White Bottom Navigation */}
      <nav className="shrink-0 z-20 bg-white border-t border-gray-200 pb-safe">
        <div className="grid grid-cols-4 h-16">
          {(
            [
              {id: 'slots', label: 'Slots', icon: CheckCircle2},
              {id: 'accounts', label: 'Accounts', icon: Users},
              {id: 'support', label: 'Support', icon: MessageSquare},
              {id: 'config', label: 'Config', icon: Sliders},
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
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
    </div>
  );
};

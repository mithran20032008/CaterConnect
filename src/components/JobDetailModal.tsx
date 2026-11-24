import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShieldAlert,
  Star,
  Users,
} from 'lucide-react';
import {apiRequest, ApiError} from '../lib/api';
import {buildGoogleMapsDirectionsUrl, buildGoogleMapsSearchUrl} from '../lib/location';
import {useI18n} from '../i18n/I18nContext';
import type {Job} from '../types';

interface GroupOption {
  id: number;
  name: string;
  accepted_count: number;
  leader_id: number;
}

interface JobDetailModalProps {
  job: Job | null;
  currentUserId: number;
  userLat?: number | null;
  userLng?: number | null;
  onClose: () => void;
  onApplied: () => void;
  onToggleSave: (jobId: number) => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  currentUserId,
  userLat = null,
  userLng = null,
  onClose,
  onApplied,
  onToggleSave,
}) => {
  const {t} = useI18n();
  const [liveJob, setLiveJob] = useState<Job | null>(job);
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [feedback, setFeedback] = useState<{type: 'info' | 'error' | 'success'; text: string} | null>(
    null
  );
  const inFlightRef = useRef(false);

  useEffect(() => {
    setLiveJob(job);
    setFeedback(null);
    setShowGroupPicker(false);
    if (job) {
      const qs =
        typeof userLat === 'number' && typeof userLng === 'number'
          ? `?lat=${encodeURIComponent(userLat)}&lng=${encodeURIComponent(userLng)}`
          : '';
      apiRequest<{job: Job}>(`/api/jobs/${job.id}${qs}`)
        .then((res) => setLiveJob(res.job))
        .catch(() => {});
    }
  }, [job, userLat, userLng]);

  if (!liveJob) return null;

  const isFull = liveJob.remaining_spots <= 0;
  const pct = Math.min(
    100,
    Math.round((liveJob.booked_count / Math.max(1, liveJob.workers_required)) * 100)
  );
  const mapsUrl = buildGoogleMapsSearchUrl(liveJob.lat, liveJob.lng, liveJob.location_name);
  const directionsUrl = buildGoogleMapsDirectionsUrl(liveJob.lat, liveJob.lng, liveJob.location_name);

  const handleApplyIndividual = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setApplying(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/jobs/${liveJob.id}/apply`, {method: 'POST', body: {}});
      setFeedback({
        type: 'success',
        text:
          liveJob.is_demo === 1
            ? 'Demo application saved under your Applied jobs!'
            : 'Application sent to organisation!',
      });
      setLiveJob({
        ...liveJob,
        my_application_status: 'Applied',
        my_application_can_withdraw: true,
      });
      onApplied();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to apply.',
      });
    } finally {
      inFlightRef.current = false;
      setApplying(false);
    }
  };

  const openGroupPicker = async () => {
    try {
      const res = await apiRequest<{groups: GroupOption[]}>('/api/groups');
      setGroups((res.groups || []).filter((g) => g.leader_id === currentUserId));
      setShowGroupPicker(true);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load your groups.',
      });
    }
  };

  const handleApplyGroup = async (groupId: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setApplying(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/jobs/${liveJob.id}/apply`, {
        method: 'POST',
        body: {groupId},
      });
      setShowGroupPicker(false);
      setFeedback({
        type: 'success',
        text:
          liveJob.is_demo === 1
            ? 'Demo group application saved under your Applied jobs!'
            : 'Group application submitted!',
      });
      setLiveJob({
        ...liveJob,
        my_application_status: 'Applied',
        my_application_can_withdraw: true,
      });
      onApplied();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Group apply failed.',
      });
    } finally {
      inFlightRef.current = false;
      setApplying(false);
    }
  };

  const handleWithdraw = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setWithdrawing(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/jobs/${liveJob.id}/withdraw`, {method: 'POST', body: {}});
      setFeedback({type: 'info', text: 'Application withdrawn.'});
      setLiveJob({
        ...liveJob,
        my_application_status: null,
        my_application_can_withdraw: false,
      });
      onApplied();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to withdraw application.',
      });
    } finally {
      inFlightRef.current = false;
      setWithdrawing(false);
    }
  };

  const statusBadge = liveJob.my_booking_status
    ? liveJob.my_booking_status
    : liveJob.my_application_status && liveJob.my_application_status !== 'Applied'
    ? liveJob.my_application_status
    : isFull
    ? 'Full'
    : liveJob.time_conflict
    ? 'Already booked at this time'
    : null;

  const isAppliedPending = !liveJob.my_booking_status && liveJob.my_application_status === 'Applied';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-[100dvh] bg-white flex flex-col overflow-hidden shadow-2xl">
        {/* Fixed Top Header */}
        <div className="shrink-0 bg-white border-b border-gray-100 pt-safe px-4 py-2.5 flex items-center justify-between z-20">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 min-h-[40px] pr-3 text-sm font-semibold text-[#111827] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('common.back')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSave(liveJob.id);
              setLiveJob({...liveJob, is_saved: !liveJob.is_saved});
            }}
            aria-label="Save job"
            className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#111827] cursor-pointer"
          >
            <Bookmark
              className={`w-5 h-5 ${liveJob.is_saved ? 'fill-[#4B6F1B] text-[#4B6F1B]' : ''}`}
            />
          </button>
        </div>

        {/* ONE Scrollable Content Area */}
        <div className="flex-1 min-h-0 app-scroll px-4 py-5 pb-10 space-y-5">
        {/* Company Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-full bg-[#4B6F1B]/12 text-[#4B6F1B] font-bold text-base flex items-center justify-center overflow-hidden shrink-0">
            {liveJob.org_logo ? (
              <img src={liveJob.org_logo} alt={liveJob.org_name} className="w-full h-full object-cover" />
            ) : (
              liveJob.org_name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-[#111827] truncate">
                {liveJob.org_name}
              </span>
              {liveJob.org_verified && <CheckCircle2 className="w-4 h-4 text-[#4B6F1B] shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6B7280] mt-0.5">
              <span className="inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                <span className="tabular-nums">
                  {liveJob.org_rating > 0 ? liveJob.org_rating.toFixed(1) : 'New'}
                </span>
              </span>
              <span>·</span>
              <span>{liveJob.city}</span>
            </div>
          </div>
        </div>

        {/* Title + Chips */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#F3F4F6] text-xs font-semibold text-[#111827]">
              {liveJob.serve_type}
            </span>
            {liveJob.is_urgent === 1 && (
              <span className="px-3 py-1 rounded-full bg-[#DC2626] text-white text-xs font-bold">
                {t('jobs.urgentTag')}
              </span>
            )}
            {liveJob.is_demo === 1 && (
              <span className="px-3 py-1 rounded-full bg-gray-200 text-[#6B7280] text-xs font-bold">
                {t('jobs.demoTag')}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-[#111827]">{liveJob.work_name}</h1>
        </div>

        {/* Pay Block */}
        <div className="p-4 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 space-y-1">
          <div className="text-sm font-bold text-[#3C5A15] tabular-nums">
            Base Rs {liveJob.base_pay}
            {liveJob.bus_fare > 0 ? ` + Bus Rs ${liveJob.bus_fare}` : ''} = Total Rs {liveJob.total_pay}
          </div>
          <div className="text-xs font-semibold text-[#4B6F1B]">{t('jobs.agentZero')}</div>
        </div>

        {/* Availability Progress Bar */}
        <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-[#111827]">
              {isFull
                ? t('jobs.fullBooked')
                : t('jobs.spotsRemaining', {count: liveJob.remaining_spots})}
            </span>
            <span className="text-[#6B7280] tabular-nums">
              {t('jobs.bookedOf', {booked: liveJob.booked_count, total: liveJob.workers_required})}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-[#F3F4F6] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isFull ? 'bg-[#6B7280]' : 'bg-[#4B6F1B]'
              }`}
              style={{width: `${pct}%`}}
            />
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 bg-[#F3F4F6]/70 p-4 rounded-2xl text-xs">
          <div>
            <div className="text-[#6B7280]">Date</div>
            <div className="font-semibold text-[#111827] mt-0.5 tabular-nums">
              {liveJob.event_date}
            </div>
          </div>
          <div>
            <div className="text-[#6B7280]">Reporting Time</div>
            <div className="font-semibold text-[#111827] mt-0.5">{liveJob.reporting_time}</div>
          </div>
          <div>
            <div className="text-[#6B7280]">Service Time</div>
            <div className="font-semibold text-[#111827] mt-0.5">
              {liveJob.service_start
                ? `${liveJob.service_start}${liveJob.service_end ? ` – ${liveJob.service_end}` : ''}`
                : 'As instructed'}
            </div>
          </div>
          <div>
            <div className="text-[#6B7280]">Workers Required</div>
            <div className="font-semibold text-[#111827] mt-0.5 tabular-nums">
              {liveJob.workers_required}
            </div>
          </div>
          <div>
            <div className="text-[#6B7280]">Dress Code</div>
            <div className="font-semibold text-[#111827] mt-0.5">
              {liveJob.dress_code || 'Neat formal'}
            </div>
          </div>
          <div>
            <div className="text-[#6B7280]">Food &amp; Transport</div>
            <div className="font-semibold text-[#111827] mt-0.5">
              Food: {liveJob.food_provided ? 'Yes' : 'No'} · Transport:{' '}
              {liveJob.transport_provided ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {liveJob.special_instructions && (
          <div className="p-4 rounded-2xl bg-[#F59E0B]/12 border border-[#F59E0B]/30 space-y-1">
            <div className="text-xs font-bold text-[#B45309] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>Special Instructions</span>
            </div>
            <p className="text-xs text-[#111827] leading-relaxed">{liveJob.special_instructions}</p>
          </div>
        )}

        {/* Simple Location Card (no tile map) */}
        <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#4B6F1B]/12 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[#4B6F1B]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#111827] leading-snug">
                  {liveJob.location_name}
                </div>
                {liveJob.city &&
                  !liveJob.location_name.toLowerCase().includes(liveJob.city.toLowerCase()) && (
                    <div className="text-xs text-[#6B7280] mt-0.5">{liveJob.city}</div>
                  )}
              </div>
            </div>
            {liveJob.distance_km !== null && liveJob.distance_km !== undefined && (
              <span className="text-xs font-semibold text-[#4B6F1B] whitespace-nowrap tabular-nums pt-0.5">
                {liveJob.distance_km} km away
              </span>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 min-h-[44px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white text-xs font-semibold flex items-center justify-center gap-1.5 px-3 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('jobs.openMaps')}</span>
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 min-h-[44px] rounded-full bg-[#F3F4F6] hover:bg-gray-200 text-[#111827] text-xs font-semibold flex items-center justify-center gap-1.5 px-3 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5 text-[#4B6F1B] shrink-0" />
              <span className="truncate">{t('jobs.getDirections')}</span>
            </a>
          </div>
        </div>

        {/* Contact (only if enabled by organisation) */}
        {liveJob.show_contact === 1 && liveJob.contact_phone && (
          <div className="p-4 rounded-2xl bg-white border border-gray-200 space-y-3">
            <div className="text-xs font-bold text-[#111827]">
              Direct Organiser Contact: <span className="tabular-nums">{liveJob.contact_phone}</span>
            </div>
            <div className="flex gap-2.5">
              <a
                href={`tel:${liveJob.contact_phone}`}
                className="flex-1 min-h-[44px] rounded-full bg-[#4B6F1B] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call</span>
              </a>
              <a
                href={`https://wa.me/91${liveJob.contact_phone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] rounded-full bg-[#25D366]/15 text-[#128C7E] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-semibold ${
              feedback.type === 'error'
                ? 'bg-[#DC2626]/10 text-[#DC2626]'
                : feedback.type === 'success'
                ? 'bg-[#4B6F1B]/12 text-[#3C5A15]'
                : 'bg-[#F59E0B]/15 text-[#B45309]'
            }`}
          >
            {feedback.text}
          </div>
        )}
      </div>

      {/* Group Picker Modal */}
      {showGroupPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-[430px] bg-white rounded-t-[28px] sm:rounded-3xl p-6 space-y-4 max-h-[85dvh] app-scroll">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111827]">Choose Group to Apply</h3>
              <button
                type="button"
                onClick={() => setShowGroupPicker(false)}
                className="text-xs font-semibold text-[#6B7280] cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-[#6B7280]">
                You do not lead any groups yet. Go to My Groups to create a group and invite at least 1 other worker.
              </p>
            ) : (
              <div className="space-y-2.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleApplyGroup(g.id)}
                    className="w-full p-3.5 rounded-2xl bg-[#F3F4F6] hover:bg-[#4B6F1B]/10 text-left flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#111827]">{g.name}</div>
                      <div className="text-xs text-[#6B7280] tabular-nums">
                        {g.accepted_count} accepted members
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#4B6F1B]">Apply</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed Bottom Apply Bar */}
      <div className="shrink-0 z-20 bg-white border-t border-gray-100 p-3.5 pb-safe">
        <div className="flex items-center gap-2.5 min-w-0">
          {isAppliedPending ? (
            <>
              <button
                type="button"
                disabled
                className="flex-1 min-w-0 min-h-[48px] rounded-full bg-[#4B6F1B] text-white text-sm font-semibold flex items-center justify-center gap-1.5 opacity-95 cursor-default px-3"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('jobs.applied')}</span>
              </button>
              {liveJob.my_application_can_withdraw !== false && (
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={handleWithdraw}
                  className="flex-1 min-w-0 min-h-[48px] rounded-full bg-[#F3F4F6] hover:bg-red-50 text-[#DC2626] text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 px-3"
                >
                  {withdrawing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                  <span className="truncate">{t('jobs.withdraw')}</span>
                </button>
              )}
            </>
          ) : statusBadge ? (
            <div className="flex-1 min-w-0 min-h-[48px] rounded-full bg-[#F3F4F6] text-[#111827] text-xs font-bold flex items-center justify-center px-4">
              <span className="truncate">{statusBadge}</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={applying}
                onClick={handleApplyIndividual}
                className="flex-1 min-w-0 min-h-[48px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 px-3"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                <span className="truncate">{t('jobs.apply')}</span>
              </button>

              <button
                type="button"
                disabled={applying}
                onClick={openGroupPicker}
                className="flex-1 min-w-0 min-h-[48px] rounded-full bg-[#A3C957]/30 hover:bg-[#A3C957]/45 text-[#3C5A15] text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 px-3"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('jobs.applyGroup')}</span>
              </button>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

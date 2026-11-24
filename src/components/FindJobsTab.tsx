import React, {useCallback, useEffect, useState} from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {apiRequest} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Job} from '../types';

interface FindJobsTabProps {
  onSelectJob: (job: Job) => void;
  userLat: number | null;
  userLng: number | null;
  onLocationGranted: (coords: {lat: number; lng: number}) => void;
}

const CITIES = ['All', 'Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Pollachi', 'Chennai'];
const ROLES = ['All', 'Buffet', 'Breakfast', 'Dinner', 'Lunch', 'Wedding', 'Reception'];
const SERVE_TYPES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Night service'];

function timeAgo(iso: string): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export const FindJobsTab: React.FC<FindJobsTabProps> = ({
  onSelectJob,
  userLat,
  userLng,
  onLocationGranted,
}) => {
  const {t} = useI18n();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('All');
  const [role, setRole] = useState('All');
  const [serveType, setServeType] = useState('All');
  const [minPay, setMinPay] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [date, setDate] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState<'newest' | 'nearest'>('newest');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLocationExplain, setShowLocationExplain] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const [showFiltersExpanded, setShowFiltersExpanded] = useState(true);

  const loadJobs = useCallback(
    async (override?: Partial<{sort: 'newest' | 'nearest'; lat: number | null; lng: number | null}>) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (city !== 'All') params.set('city', city);
        if (role !== 'All') params.set('role', role);
        if (serveType !== 'All') params.set('serveType', serveType);
        if (minPay.trim()) params.set('minPay', minPay.trim());
        if (maxDistanceKm.trim()) params.set('maxDistanceKm', maxDistanceKm.trim());
        if (date.trim()) params.set('date', date.trim());
        if (onlyOpen) params.set('onlyOpen', 'true');
        const activeSort = override?.sort ?? sort;
        params.set('sort', activeSort);
        const lat = override?.lat !== undefined ? override.lat : userLat;
        const lng = override?.lng !== undefined ? override.lng : userLng;
        if (lat !== null && lng !== null) {
          params.set('lat', String(lat));
          params.set('lng', String(lng));
        }
        const res = await apiRequest<{jobs: Job[]; total: number}>(`/api/jobs?${params.toString()}`);
        setJobs(res.jobs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs.');
      } finally {
        setLoading(false);
      }
    },
    [search, city, role, serveType, minPay, maxDistanceKm, date, onlyOpen, sort, userLat, userLng]
  );

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSortNearest = () => {
    if (userLat !== null && userLng !== null) {
      setSort('nearest');
      loadJobs({sort: 'nearest', lat: userLat, lng: userLng});
    } else {
      setShowLocationExplain(true);
    }
  };

  const allowLocationOnce = () => {
    setShowLocationExplain(false);
    setLocationNotice('');
    if (!navigator.geolocation) {
      setLocationNotice('Location is unavailable in this browser. Showing available jobs.');
      setSort('nearest');
      loadJobs({sort: 'nearest'});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        onLocationGranted(coords);
        setSort('nearest');
        loadJobs({sort: 'nearest', lat: coords.lat, lng: coords.lng});
      },
      () => {
        setLocationNotice('Location permission was denied. Distances will appear once location is allowed.');
        setSort('nearest');
        loadJobs({sort: 'nearest'});
      },
      {enableHighAccuracy: true, timeout: 9000}
    );
  };

  const clearAllFilters = () => {
    setSearch('');
    setCity('All');
    setRole('All');
    setServeType('All');
    setMinPay('');
    setMaxDistanceKm('');
    setDate('');
    setOnlyOpen(false);
    setSort('newest');
    setTimeout(() => {
      apiRequest<{jobs: Job[]}>('/api/jobs')
        .then((res) => setJobs(res.jobs || []))
        .catch(() => {});
    }, 0);
  };

  const handleQuickSave = async (e: React.MouseEvent, jobId: number) => {
    e.stopPropagation();
    try {
      const res = await apiRequest<{saved: boolean}>(`/api/jobs/${jobId}/save`, {
        method: 'POST',
        body: {},
      });
      setJobs((prev) => prev.map((j) => (j.id === jobId ? {...j, is_saved: res.saved} : j)));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4 min-w-0 w-full">
      {/* White Rounded Filter Card */}
      <div className="bg-white rounded-[20px] shadow-[0_6px_24px_rgba(17,24,39,0.06)] border border-gray-100 p-3.5 space-y-2.5 w-full min-w-0 max-w-full overflow-hidden">
        {/* Search box */}
        <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[46px] min-w-0 w-full focus-within:ring-2 focus-within:ring-[#4B6F1B]">
          <Search className="w-4 h-4 text-[#6B7280] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadJobs()}
            placeholder="Search catering work or area..."
            className="flex-1 min-w-0 w-full bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowFiltersExpanded((v) => !v)}
            aria-label="Toggle extra filters"
            className="p-1.5 rounded-full text-[#6B7280] hover:text-[#111827] shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* [Sort by Nearest] light-green pill and [Search] dark-green pill */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
          <button
            type="button"
            onClick={handleSortNearest}
            className={`min-h-[44px] min-w-0 w-full rounded-full px-3 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              sort === 'nearest'
                ? 'bg-[#A3C957] text-[#111827]'
                : 'bg-[#A3C957]/30 text-[#3C5A15] hover:bg-[#A3C957]/45'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('jobs.sortNearest')}</span>
          </button>

          <button
            type="button"
            onClick={() => loadJobs()}
            className="min-h-[44px] min-w-0 w-full rounded-full px-3 bg-[#4B6F1B] hover:bg-[#3C5A15] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('jobs.searchBtn')}</span>
          </button>
        </div>

        {showLocationExplain && (
          <div className="p-3 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 space-y-2 min-w-0">
            <p className="text-xs text-[#111827]">
              Allow one-time location access to sort catering jobs nearest to you and show distances.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={allowLocationOnce}
                className="px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
              >
                Allow Location
              </button>
              <button
                type="button"
                onClick={() => setShowLocationExplain(false)}
                className="px-3 py-1.5 rounded-full bg-white text-[#6B7280] text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {locationNotice && (
          <p className="text-xs text-[#B45309] px-1">{locationNotice}</p>
        )}

        {showFiltersExpanded && (
          <div className="space-y-2 pt-0.5 min-w-0 w-full">
            {/* All Cities & All Roles */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="City filter"
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] truncate focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c === 'All' ? t('jobs.allCities') : c}
                  </option>
                ))}
              </select>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Role filter"
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] truncate focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'All' ? t('jobs.allRoles') : r}
                  </option>
                ))}
              </select>
            </div>

            {/* All Serve Types & Date Picker */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
              <select
                value={serveType}
                onChange={(e) => setServeType(e.target.value)}
                aria-label="Serve type filter"
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] truncate focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              >
                {SERVE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'All' ? t('jobs.allServeTypes') : s}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date filter"
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>

            {/* Min Pay & Max Distance */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 w-full min-w-0">
              <input
                type="number"
                min={0}
                value={minPay}
                onChange={(e) => setMinPay(e.target.value)}
                placeholder={t('jobs.minPay')}
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] placeholder:text-xs placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />

              <input
                type="number"
                min={1}
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                placeholder={t('jobs.maxDistance')}
                className="w-full min-w-0 max-w-full bg-[#F3F4F6] rounded-full px-3 min-h-[42px] text-base text-[#111827] placeholder:text-xs placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 min-w-0">
              <label className="inline-flex items-center gap-2 text-xs text-[#111827] cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => setOnlyOpen(e.target.checked)}
                  className="w-4 h-4 accent-[#4B6F1B] rounded shrink-0"
                />
                <span className="truncate">{t('jobs.onlyOpen')}</span>
              </label>

              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-[#4B6F1B] hover:underline cursor-pointer shrink-0"
              >
                {t('common.clearFilters')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Count Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 min-w-0">
        <span className="text-xs font-semibold text-[#6B7280] tabular-nums">
          {t('jobs.showingCount', {count: jobs.length})}
        </span>
        {sort === 'nearest' && (
          <span className="text-[11px] font-medium text-[#4B6F1B]">Sorted by nearest</span>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-[#DC2626]/10 text-xs text-[#DC2626] flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">{error}</span>
          <button type="button" onClick={() => loadJobs()} className="font-semibold underline shrink-0 cursor-pointer">
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-36 rounded-[20px] bg-white border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        /* Green illustrated empty state */
        <div className="bg-white rounded-[20px] p-8 text-center shadow-xs border border-gray-100 space-y-3 cc-card">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#4B6F1B]/10 flex items-center justify-center">
            <Search className="w-7 h-7 text-[#4B6F1B]" />
          </div>
          <h3 className="text-base font-bold text-[#111827]">No matching catering jobs</h3>
          <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
            Try clearing some filters or expanding your distance to see all available shifts.
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-5 py-2.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
          >
            {t('common.clearFilters')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 min-w-0 w-full">
          {jobs.map((job) => {
            const isFull = job.remaining_spots <= 0;
            const availTone = isFull
              ? 'bg-gray-200 text-[#6B7280]'
              : job.remaining_spots <= 2
              ? 'bg-[#F59E0B]/15 text-[#B45309]'
              : 'bg-[#4B6F1B]/12 text-[#3C5A15]';

            const availLabel = isFull
              ? t('jobs.fullBooked')
              : job.remaining_spots === 1
              ? t('jobs.onlySpotLeft', {count: 1})
              : job.remaining_spots === 2
              ? t('jobs.onlySpotsLeft', {count: 2})
              : t('jobs.spotsRemaining', {count: job.remaining_spots});

            return (
              <div
                key={job.id}
                onClick={() => onSelectJob(job)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectJob(job)}
                className={`cc-card pressable w-full min-w-0 max-w-full rounded-[20px] bg-white p-4 shadow-[0_4px_18px_rgba(17,24,39,0.05)] border border-gray-100 cursor-pointer hover:border-[#4B6F1B]/40 flex flex-col justify-between gap-3 ${
                  isFull ? 'opacity-70 bg-gray-50/70' : ''
                }`}
              >
                {/* 1. COMPANY STRIP */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#4B6F1B]/12 text-[#4B6F1B] font-bold text-xs flex items-center justify-center overflow-hidden shrink-0">
                      {job.org_logo ? (
                        <img
                          src={job.org_logo}
                          alt={job.org_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        job.org_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-bold text-[#111827] truncate">
                          {job.org_name}
                        </span>
                        {job.org_verified && (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[#4B6F1B] shrink-0"
                            aria-label={t('jobs.verified')}
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B7280]">Posted {timeAgo(job.created_at)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.is_urgent === 1 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold tracking-wide">
                        {t('jobs.urgentTag')}
                      </span>
                    )}
                    {job.is_demo === 1 && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-200 text-[#6B7280] text-[10px] font-bold">
                        {t('jobs.demoTag')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleQuickSave(e, job.id)}
                      aria-label="Save job"
                      className="p-1.5 rounded-full hover:bg-[#F3F4F6] text-[#6B7280] cursor-pointer"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${
                          job.is_saved ? 'fill-[#4B6F1B] text-[#4B6F1B]' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Main body + Right-hand Pay Circle */}
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    {/* 2. Job title + serve-type chip */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-bold text-[#111827] leading-snug">
                        {job.work_name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#111827] text-[10px] font-semibold">
                        {job.serve_type}
                      </span>
                    </div>

                    {/* 3. Pin + location + distance */}
                    <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                      <MapPin className="w-3.5 h-3.5 text-[#4B6F1B] shrink-0" />
                      <span className="truncate">{job.location_name}</span>
                      {job.distance_km !== null && job.distance_km !== undefined && (
                        <span className="text-[11px] font-semibold text-[#4B6F1B] whitespace-nowrap">
                          · {job.distance_km} km
                        </span>
                      )}
                    </div>

                    {/* 4. Clock + reporting/service time & date */}
                    <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                      <Clock className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                      <span className="tabular-nums truncate">
                        {job.event_date} · {job.reporting_time}
                        {job.service_start ? ` (${job.service_start}${job.service_end ? `–${job.service_end}` : ''})` : ''}
                      </span>
                    </div>
                  </div>

                  {/* 6. Right-hand circle with TOTAL pay + Bus */}
                  <div className="w-16 h-16 rounded-full bg-[#4B6F1B]/10 border border-[#4B6F1B]/25 flex flex-col items-center justify-center shrink-0 text-center">
                    <span className="text-sm font-extrabold text-[#3C5A15] tabular-nums leading-none">
                      Rs {job.total_pay}
                    </span>
                    {job.bus_fare > 0 && (
                      <span className="text-[10px] font-semibold text-[#4B6F1B] mt-0.5">
                        + Bus
                      </span>
                    )}
                  </div>
                </div>

                {/* 5. Live availability pill + booked count */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${availTone}`}>
                    {availLabel}
                  </span>
                  <span className="text-[11px] font-medium text-[#6B7280] tabular-nums">
                    {t('jobs.bookedOf', {booked: job.booked_count, total: job.workers_required})}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, {useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Loader2} from 'lucide-react';
import {AutoVerifyBanner} from './AutoVerifyBanner';
import {SimpleLocationInput} from './SimpleLocationInput';
import {apiRequest} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Job, Organisation, User} from '../types';

interface PostJobTabProps {
  user: User;
  organisation: Organisation;
  autoVerifyMinutes: number;
  editingJob: Job | null;
  onAutoVerified: () => void;
  onJobSaved: () => void;
  onCancelEdit: () => void;
}

const SERVE_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Night service'];
const CITIES = ['Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Pollachi', 'Chennai'];

function defaultTomorrowIst(): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export const PostJobTab: React.FC<PostJobTabProps> = ({
  user,
  organisation,
  autoVerifyMinutes,
  editingJob,
  onAutoVerified,
  onJobSaved,
  onCancelEdit,
}) => {
  const {t} = useI18n();
  const [workName, setWorkName] = useState(editingJob?.work_name || '');
  const [serveType, setServeType] = useState(editingJob?.serve_type || 'Dinner');
  const [eventDate, setEventDate] = useState(editingJob?.event_date || defaultTomorrowIst());
  const [reportingTime, setReportingTime] = useState(editingJob?.reporting_time || '4:30 PM sharp');
  const [serviceStart, setServiceStart] = useState(editingJob?.service_start || '');
  const [serviceEnd, setServiceEnd] = useState(editingJob?.service_end || '');
  const [locationName, setLocationName] = useState(editingJob?.location_name || '');
  const [city, setCity] = useState(editingJob?.city || organisation.city || 'Coimbatore');
  const [coords, setCoords] = useState<{lat: number | null; lng: number | null}>({
    lat: editingJob?.lat ?? organisation.lat ?? null,
    lng: editingJob?.lng ?? organisation.lng ?? null,
  });
  const [workersRequired, setWorkersRequired] = useState(String(editingJob?.workers_required ?? 5));
  const [dressCode, setDressCode] = useState(
    editingJob?.dress_code || 'White shirt, black pant, shoes'
  );
  const [basePay, setBasePay] = useState(String(editingJob?.base_pay ?? 350));
  const [busFare, setBusFare] = useState(String(editingJob?.bus_fare ?? 50));
  const [foodProvided, setFoodProvided] = useState(
    editingJob ? editingJob.food_provided === 1 : true
  );
  const [transportProvided, setTransportProvided] = useState(
    editingJob ? editingJob.transport_provided === 1 : true
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    editingJob?.special_instructions || ''
  );
  const [showContact, setShowContact] = useState(
    editingJob ? editingJob.show_contact === 1 : false
  );
  const [contactPhone, setContactPhone] = useState(
    editingJob?.contact_phone || organisation.contact_details || organisation.phone
  );
  const [allowPartialGroup, setAllowPartialGroup] = useState(
    editingJob ? editingJob.allow_partial_group === 1 : true
  );
  const [isUrgent, setIsUrgent] = useState(editingJob ? editingJob.is_urgent === 1 : false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const inFlightRef = useRef(false);

  const totalPay = (Number(basePay) || 0) + (Number(busFare) || 0);
  const isVerified = user.status === 'verified' && organisation.status === 'verified';

  if (!isVerified) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-[#111827]">Post a Catering Job</h2>
        <AutoVerifyBanner
          status={user.status}
          registeredAt={user.registered_at}
          autoVerifyMinutes={autoVerifyMinutes}
          role="organisation"
          onAutoVerified={onAutoVerified}
        />
        <div className="p-6 rounded-3xl bg-white border border-gray-100 text-center space-y-2 shadow-xs">
          <p className="text-sm font-semibold text-[#111827]">{t('verification.pendingWait')}</p>
          <p className="text-xs text-[#6B7280]">
            As soon as the timer reaches 0:00 (or admin verifies you), the job posting form unlocks automatically.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setError('');
    setSuccessMsg('');

    if (!workName.trim() || !locationName.trim() || !reportingTime.trim()) {
      setError('Work name, location name, and reporting time are required.');
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const payload = {
        work_name: workName.trim(),
        serve_type: serveType,
        event_date: eventDate,
        reporting_time: reportingTime.trim(),
        service_start: serviceStart.trim(),
        service_end: serviceEnd.trim(),
        location_name: locationName.trim(),
        city,
        lat: coords.lat,
        lng: coords.lng,
        workers_required: Number(workersRequired) || 1,
        dress_code: dressCode.trim(),
        base_pay: Number(basePay) || 0,
        bus_fare: Number(busFare) || 0,
        food_provided: foodProvided,
        transport_provided: transportProvided,
        special_instructions: specialInstructions.trim(),
        show_contact: showContact,
        contact_phone: showContact ? contactPhone.trim() : '',
        allow_partial_group: allowPartialGroup,
        is_urgent: isUrgent,
      };

      if (editingJob) {
        await apiRequest(`/api/jobs/${editingJob.id}`, {method: 'PUT', body: payload});
        setSuccessMsg('Job updated!');
      } else {
        await apiRequest('/api/jobs', {method: 'POST', body: payload});
        setSuccessMsg('Job posted! Workers can now see it in Find Jobs.');
      }
      onJobSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job.');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#111827]">
          {editingJob ? 'Edit Job Posting' : 'Post a Catering Job'}
        </h2>
        {editingJob && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] cursor-pointer"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-[24px] p-4 shadow-xs border border-gray-100 space-y-4 min-w-0 max-w-full overflow-hidden"
      >
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">Work Name *</label>
          <input
            type="text"
            value={workName}
            onChange={(e) => setWorkName(e.target.value)}
            placeholder="e.g. Wedding Dinner Buffet Servers"
            className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Serve Type *</label>
            <select
              value={serveType}
              onChange={(e) => setServeType(e.target.value)}
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            >
              {SERVE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Event Date *</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Reporting Time *
            </label>
            <input
              type="text"
              value={reportingTime}
              onChange={(e) => setReportingTime(e.target.value)}
              placeholder='e.g. "4:30 PM sharp"'
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-[#111827] mb-1.5">
                Service Start (opt.)
              </label>
              <input
                type="text"
                value={serviceStart}
                onChange={(e) => setServiceStart(e.target.value)}
                placeholder="e.g. 6:30 PM"
                className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-[#111827] mb-1.5">
                Service End (opt.)
              </label>
              <input
                type="text"
                value={serviceEnd}
                onChange={(e) => setServiceEnd(e.target.value)}
                placeholder="e.g. 10:30 PM"
                className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Location / Venue Name *
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Codissia Trade Fair Complex, Peelamedu"
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">City *</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 min-w-0">
          <label className="block text-xs font-semibold text-[#111827]">
            Venue Location Coordinates (for distance &amp; directions)
          </label>
          <SimpleLocationInput
            lat={coords.lat}
            lng={coords.lng}
            onChange={(c) => setCoords(c)}
            explanationText="CaterConnect uses your current GPS location once to save the venue coordinates so nearby workers can find this job. We never track you in the background."
          />
        </div>

        <div className="space-y-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Workers Required *
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={workersRequired}
              onChange={(e) => setWorkersRequired(e.target.value)}
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-[#111827] mb-1.5">
                Base Pay (Rs) *
              </label>
              <input
                type="number"
                min={50}
                value={basePay}
                onChange={(e) => setBasePay(e.target.value)}
                className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[46px] text-base text-[#111827] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-[#111827] mb-1.5">
                Bus Fare (Rs, opt.)
              </label>
              <input
                type="number"
                min={0}
                value={busFare}
                onChange={(e) => setBusFare(e.target.value)}
                className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-3.5 min-h-[46px] text-base text-[#111827] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
              />
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 text-xs font-semibold text-[#3C5A15] tabular-nums">
          Total Worker Pay: Rs {Number(basePay) || 0} + Rs {Number(busFare) || 0} bus ={' '}
          <span className="text-sm font-extrabold">Rs {totalPay}</span> (Agent commission: Rs 0)
        </div>

        <div className="min-w-0">
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">Dress Code</label>
          <input
            type="text"
            value={dressCode}
            onChange={(e) => setDressCode(e.target.value)}
            className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[46px] text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
          />
        </div>

        <div className="min-w-0">
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Special Instructions
          </label>
          <textarea
            rows={2}
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder='e.g. "No back-out. No last-minute cancellation."'
            className="w-full min-w-0 bg-[#F3F4F6] rounded-2xl p-3.5 text-base text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
          />
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs font-medium text-[#111827] cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={foodProvided}
              onChange={(e) => setFoodProvided(e.target.checked)}
              className="w-4 h-4 accent-[#4B6F1B] rounded shrink-0"
            />
            <span className="leading-snug">Food Provided</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-[#111827] cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={transportProvided}
              onChange={(e) => setTransportProvided(e.target.checked)}
              className="w-4 h-4 accent-[#4B6F1B] rounded shrink-0"
            />
            <span className="leading-snug">Transport Provided</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-[#111827] cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={allowPartialGroup}
              onChange={(e) => setAllowPartialGroup(e.target.checked)}
              className="w-4 h-4 accent-[#4B6F1B] rounded shrink-0"
            />
            <span className="leading-snug">Allow partial group</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#DC2626] cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="w-4 h-4 accent-[#DC2626] rounded shrink-0"
            />
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-snug">Mark URGENT</span>
          </label>
        </div>

        <div className="space-y-2 pt-1 border-t border-gray-100">
          <label className="flex items-center gap-2.5 text-xs font-semibold text-[#111827] cursor-pointer">
            <input
              type="checkbox"
              checked={showContact}
              onChange={(e) => setShowContact(e.target.checked)}
              className="w-4 h-4 accent-[#4B6F1B] rounded shrink-0"
            />
            <span>Show my contact details on this job</span>
          </label>

          {showContact && (
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Contact phone number"
              className="w-full min-w-0 bg-[#F3F4F6] rounded-full px-4 min-h-[44px] text-base text-[#111827] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4B6F1B]"
            />
          )}
        </div>

        {error && <p className="text-xs text-[#DC2626]">{error}</p>}
        {successMsg && (
          <div className="p-3 rounded-2xl bg-[#4B6F1B]/10 text-xs font-semibold text-[#3C5A15] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[50px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>{editingJob ? 'Update Job' : 'Publish Job'}</span>
        </button>
      </form>
    </div>
  );
};

import React, {useRef, useState} from 'react';
import {
  Briefcase,
  Camera,
  Clock,
  Loader2,
  MapPin,
  Sparkles,
  User as UserIcon,
  Wrench,
} from 'lucide-react';
import {AuthShell} from './AuthShell';
import {CameraCaptureModal} from './CameraCaptureModal';
import {SimpleLocationInput} from './SimpleLocationInput';
import {normalizeClientPhone, OtpCodeBlock} from './OtpCodeBlock';
import {apiRequest, ApiError} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Organisation, User} from '../types';

interface RegisterWorkerScreenProps {
  onBack: () => void;
  onLogIn: () => void;
  onSuccess: (payload: {user: User; organisation: Organisation | null; autoVerifyMinutes: number}) => void;
}

const CITIES = ['Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Pollachi', 'Chennai', 'Madurai', 'Trichy'];
const WORK_CATEGORIES = [
  'Server / Waiter',
  'Buffet Server',
  'Kitchen Helper',
  'Cleaner / Wash Crew',
  'Event Service Lead',
  'Supervisor / Captain',
];
const AVAILABILITY_OPTS = ['Available', 'Weekends only', 'Evenings only', 'Full week'];

export const RegisterWorkerScreen: React.FC<RegisterWorkerScreenProps> = ({
  onBack,
  onLogIn,
  onSuccess,
}) => {
  const {lang, t} = useI18n();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [livingLocation, setLivingLocation] = useState('');
  const [city, setCity] = useState('Coimbatore');
  const [coords, setCoords] = useState<{lat: number | null; lng: number | null}>({
    lat: null,
    lng: null,
  });
  const [photoUrl, setPhotoUrl] = useState('');
  const [workCategory, setWorkCategory] = useState('Server / Waiter');
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState('');
  const [preferredAreas, setPreferredAreas] = useState('');
  const [availability, setAvailability] = useState('Available');
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const [showCamera, setShowCamera] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    const nextErr: Record<string, string> = {};
    const normalized = normalizeClientPhone(phone);
    if (!fullName.trim()) nextErr.fullName = 'Full name is required.';
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      nextErr.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!/^\d{6}$/.test(code.trim())) {
      nextErr.code = 'Enter the 6-digit verification code.';
    }
    if (!livingLocation.trim()) {
      nextErr.livingLocation = 'Living area or location is required.';
    }
    if (!city.trim()) {
      nextErr.city = 'City is required.';
    }
    if (!workCategory.trim()) {
      nextErr.workCategory = 'Select your work category.';
    }

    setErrors(nextErr);
    setFormError('');
    setAlreadyRegistered(false);
    if (Object.keys(nextErr).length > 0) return;

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        user: User;
        organisation: Organisation | null;
        autoVerifyMinutes: number;
      }>('/api/auth/register-worker', {
        method: 'POST',
        body: {
          phone: normalized,
          code: code.trim(),
          full_name: fullName.trim(),
          address: address.trim(),
          living_location: livingLocation.trim(),
          lat: coords.lat,
          lng: coords.lng,
          city: city.trim(),
          photo_url: photoUrl,
          work_category: workCategory,
          skills: skills.trim(),
          experience: experience.trim(),
          preferred_areas: preferredAreas.trim(),
          availability,
          language: lang,
          keepSignedIn,
        },
      });
      onSuccess(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ALREADY_REGISTERED') {
          setAlreadyRegistered(true);
        } else if (err.message.toLowerCase().includes('code')) {
          setErrors((prev) => ({...prev, code: err.message}));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Network error. Please try again.');
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthShell onBack={onBack}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1 mb-2">
          <h1 className="text-2xl font-bold text-[#111827]">{t('role.workerTitle')}</h1>
          <p className="text-xs text-[#6B7280]">{t('role.workerDesc')}</p>
        </div>

        {/* Face Photo */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#F3F4F6]/80">
          <div className="w-16 h-16 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt="Worker face" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-7 h-7 text-[#6B7280]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#111827]">Face Photo (Recommended)</div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              Helps organisers identify you on event day.
            </div>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{photoUrl ? 'Change Photo' : 'Take / Upload Photo'}</span>
            </button>
          </div>
        </div>

        {/* Full Name */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">Full Name *</label>
          <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <UserIcon className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Karthik Raja"
              className="w-full bg-transparent text-sm text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
          {errors.fullName && <p className="text-xs text-[#DC2626] mt-1 pl-2">{errors.fullName}</p>}
        </div>

        {/* Mobile + OTP */}
        <OtpCodeBlock
          mode="register"
          phone={phone}
          onPhoneChange={setPhone}
          code={code}
          onCodeChange={setCode}
          phoneError={errors.phone}
          codeError={errors.code}
          onAlreadyRegistered={onLogIn}
        />

        {/* City & Living Location */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">City *</label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-w-0 bg-transparent text-base text-[#111827] focus:outline-none truncate"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Living Area *
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                value={livingLocation}
                onChange={(e) => setLivingLocation(e.target.value)}
                placeholder="e.g. Gandhipuram"
                className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
              />
            </div>
            {errors.livingLocation && (
              <p className="text-xs text-[#DC2626] mt-1 pl-2">{errors.livingLocation}</p>
            )}
          </div>
        </div>

        {/* Simple location coordinates (optional) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#111827]">
            Current Location (optional — for nearest jobs)
          </label>
          <SimpleLocationInput
            lat={coords.lat}
            lng={coords.lng}
            onChange={(c) => setCoords(c)}
            explanationText="CaterConnect uses your location once to find catering jobs near you and show accurate distances. You can also just type your Living Area above."
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">Address</label>
          <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street / landmark"
              className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        {/* Work Category & Availability */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Work Category *
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Briefcase className="w-4 h-4 text-[#6B7280] shrink-0" />
              <select
                value={workCategory}
                onChange={(e) => setWorkCategory(e.target.value)}
                className="w-full min-w-0 bg-transparent text-base text-[#111827] focus:outline-none truncate"
              >
                {WORK_CATEGORIES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Availability
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Clock className="w-4 h-4 text-[#6B7280] shrink-0" />
              <select
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                className="w-full min-w-0 bg-transparent text-base text-[#111827] focus:outline-none truncate"
              >
                {AVAILABILITY_OPTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Skills & Experience */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Skills</label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Wrench className="w-4 h-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Buffet, Leaf"
                className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
              />
            </div>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">Experience</label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Sparkles className="w-4 h-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="2 years"
                className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Preferred working areas */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Preferred Working Areas
          </label>
          <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={preferredAreas}
              onChange={(e) => setPreferredAreas(e.target.value)}
              placeholder="e.g. RS Puram, Peelamedu"
              className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="w-4 h-4 accent-[#4B6F1B] rounded"
          />
          <span className="text-sm text-[#111827]">{t('auth.keepSignedIn')}</span>
        </label>

        {alreadyRegistered && (
          <div className="p-3.5 rounded-2xl bg-[#F59E0B]/12 border border-[#F59E0B]/30 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#111827]">
              {t('auth.alreadyRegisteredMsg')}
            </span>
            <button
              type="button"
              onClick={onLogIn}
              className="px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
            >
              {t('auth.logInBtn')}
            </button>
          </div>
        )}

        {formError && <p className="text-xs text-[#DC2626] pl-1">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[50px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-base shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          <span>{t('auth.registerBtn')}</span>
        </button>
      </form>

      <CameraCaptureModal
        isOpen={showCamera}
        title="Worker Profile Photo"
        onClose={() => setShowCamera(false)}
        onUploaded={(url) => setPhotoUrl(url)}
      />
    </AuthShell>
  );
};

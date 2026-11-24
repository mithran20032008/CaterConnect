import React, {useRef, useState} from 'react';
import {Building2, Camera, Loader2, MapPin, Phone, User as UserIcon} from 'lucide-react';
import {AuthShell} from './AuthShell';
import {CameraCaptureModal} from './CameraCaptureModal';
import {SimpleLocationInput} from './SimpleLocationInput';
import {normalizeClientPhone, OtpCodeBlock} from './OtpCodeBlock';
import {apiRequest, ApiError} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Organisation, User} from '../types';

interface RegisterOrgScreenProps {
  onBack: () => void;
  onLogIn: () => void;
  onSuccess: (payload: {user: User; organisation: Organisation | null; autoVerifyMinutes: number}) => void;
}

const ORG_CATEGORIES = [
  'Catering company',
  'Wedding hall',
  'Event coordinator',
  'Event organiser',
];
const CITIES = ['Coimbatore', 'Tiruppur', 'Erode', 'Salem', 'Pollachi', 'Chennai', 'Madurai', 'Trichy'];

export const RegisterOrgScreen: React.FC<RegisterOrgScreenProps> = ({
  onBack,
  onLogIn,
  onSuccess,
}) => {
  const {lang, t} = useI18n();
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState(ORG_CATEGORIES[0]);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Coimbatore');
  const [coords, setCoords] = useState<{lat: number | null; lng: number | null}>({
    lat: null,
    lng: null,
  });
  const [logoUrl, setLogoUrl] = useState('');
  const [contactDetails, setContactDetails] = useState('');
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
    if (!ownerName.trim()) nextErr.ownerName = 'Owner name is required.';
    if (!businessName.trim()) nextErr.businessName = 'Business name is required.';
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      nextErr.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!/^\d{6}$/.test(code.trim())) {
      nextErr.code = 'Enter the 6-digit verification code.';
    }
    if (!address.trim()) nextErr.address = 'Address is required.';
    if (!city.trim()) nextErr.city = 'City is required.';

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
      }>('/api/auth/register-organisation', {
        method: 'POST',
        body: {
          phone: normalized,
          code: code.trim(),
          owner_name: ownerName.trim(),
          business_name: businessName.trim(),
          category,
          address: address.trim(),
          city: city.trim(),
          lat: coords.lat,
          lng: coords.lng,
          logo_url: logoUrl,
          contact_details: contactDetails.trim() || normalized,
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
          <h1 className="text-2xl font-bold text-[#111827]">{t('role.orgTitle')}</h1>
          <p className="text-xs text-[#6B7280]">{t('role.orgDesc')}</p>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#F3F4F6]/80">
          <div className="w-16 h-16 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Organisation logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-7 h-7 text-[#6B7280]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#111827]">Business Logo (Optional)</div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              Displayed on your job postings.
            </div>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{logoUrl ? 'Change Logo' : 'Upload / Take Logo'}</span>
            </button>
          </div>
        </div>

        {/* Owner Name & Business Name */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Owner Name *
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <UserIcon className="w-4 h-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Suresh Kumar"
                className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
              />
            </div>
            {errors.ownerName && (
              <p className="text-xs text-[#DC2626] mt-1 pl-2">{errors.ownerName}</p>
            )}
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Business Name *
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Building2 className="w-4 h-4 text-[#6B7280] shrink-0" />
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Kongu Caterers"
                className="w-full min-w-0 bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
              />
            </div>
            {errors.businessName && (
              <p className="text-xs text-[#DC2626] mt-1 pl-2">{errors.businessName}</p>
            )}
          </div>
        </div>

        {/* Category & City */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Category *
            </label>
            <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] min-w-0 focus-within:ring-2 focus-within:ring-[#4B6F1B]">
              <Building2 className="w-4 h-4 text-[#6B7280] shrink-0" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-w-0 bg-transparent text-base text-[#111827] focus:outline-none truncate"
              >
                {ORG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

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

        {/* Address */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Business Address *
          </label>
          <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <MapPin className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 42 DB Road, RS Puram"
              className="w-full bg-transparent text-sm text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
          {errors.address && <p className="text-xs text-[#DC2626] mt-1 pl-2">{errors.address}</p>}
        </div>

        {/* Contact Details */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Contact Details (for bookings)
          </label>
          <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] focus-within:ring-2 focus-within:ring-[#4B6F1B]">
            <Phone className="w-4 h-4 text-[#6B7280] shrink-0" />
            <input
              type="text"
              value={contactDetails}
              onChange={(e) => setContactDetails(e.target.value)}
              placeholder="Alternate phone or WhatsApp (optional)"
              className="w-full bg-transparent text-sm text-[#111827] placeholder:text-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        {/* Simple location */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#111827]">
            Office / Hall Location (optional)
          </label>
          <SimpleLocationInput
            lat={coords.lat}
            lng={coords.lng}
            onChange={(c) => setCoords(c)}
            explanationText="CaterConnect uses your location once to save your venue coordinates so nearby workers see accurate distances."
          />
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
        title="Business Logo"
        explanation="CaterConnect needs your camera if you want to snap your business logo, or you can choose an image from your gallery."
        onClose={() => setShowCamera(false)}
        onUploaded={(url) => setLogoUrl(url)}
      />
    </AuthShell>
  );
};

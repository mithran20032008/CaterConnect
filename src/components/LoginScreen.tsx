import React, {useRef, useState} from 'react';
import {Loader2, Shield} from 'lucide-react';
import {AuthShell} from './AuthShell';
import {normalizeClientPhone, OtpCodeBlock} from './OtpCodeBlock';
import {apiRequest, ApiError} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';
import type {Organisation, User} from '../types';

interface LoginScreenProps {
  onBack: () => void;
  onRegister: () => void;
  onSuccess: (payload: {
    user: User;
    organisation: Organisation | null;
    autoVerifyMinutes: number;
    token?: string;
  }) => void;
  notice?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onBack,
  onRegister,
  onSuccess,
  notice,
}) => {
  const {t} = useI18n();
  const isAdminRoute = window.location.pathname === '/admin';
  const [phone, setPhone] = useState(isAdminRoute ? '9000000000' : '');
  const [code, setCode] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [phoneError, setPhoneError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    setPhoneError('');
    setCodeError('');
    setFormError('');

    const normalized = normalizeClientPhone(phone);
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      setPhoneError('Enter a valid 10-digit mobile number');
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setCodeError('Enter the 6-digit verification code.');
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        user: User;
        organisation: Organisation | null;
        autoVerifyMinutes: number;
      }>('/api/auth/login', {
        method: 'POST',
        body: {phone: normalized, code: code.trim(), keepSignedIn},
      });
      onSuccess(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.toLowerCase().includes('code')) {
          setCodeError(err.message);
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
          <h1 className="text-2xl font-bold text-[#111827]">
            {isAdminRoute ? 'Admin Log In' : t('auth.loginTitle')}
          </h1>
          <p className="text-sm text-[#6B7280]">{t('auth.loginSubtitle')}</p>
        </div>

        {notice && (
          <div className="p-3.5 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/35 text-xs font-semibold text-[#B45309]">
            {notice}
          </div>
        )}

        {isAdminRoute && (
          <div className="p-3.5 rounded-2xl bg-[#4B6F1B]/8 border border-[#4B6F1B]/25 flex items-start gap-2.5 text-xs text-[#111827]">
            <Shield className="w-4 h-4 text-[#4B6F1B] shrink-0 mt-0.5" />
            <span>
              Default admin mobile: <strong className="tabular-nums">9000000000</strong>. Tap Send Code and log in with the test code.
            </span>
          </div>
        )}

        <OtpCodeBlock
          mode="login"
          phone={phone}
          onPhoneChange={setPhone}
          code={code}
          onCodeChange={setCode}
          phoneError={phoneError}
          codeError={codeError}
        />

        <label className="flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="w-4 h-4 accent-[#4B6F1B] rounded"
          />
          <span className="text-sm text-[#111827]">{t('auth.keepSignedIn')}</span>
        </label>

        {formError && <p className="text-xs text-[#DC2626] pl-1">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[50px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-base shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          <span>{t('auth.logInBtn')}</span>
        </button>

        {!isAdminRoute && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onRegister}
              className="text-sm text-[#6B7280] hover:text-[#111827] min-h-[44px] px-3 cursor-pointer"
            >
              {t('auth.noAccount')}{' '}
              <span className="font-semibold text-[#4B6F1B] underline underline-offset-2">
                {t('auth.registerNow')}
              </span>
            </button>
          </div>
        )}
      </form>
    </AuthShell>
  );
};

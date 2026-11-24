import React, {useEffect, useRef, useState} from 'react';
import {KeyRound, Loader2, Phone, ShieldAlert, Sparkles} from 'lucide-react';
import {apiRequest, ApiError} from '../lib/api';
import {useI18n} from '../i18n/I18nContext';

interface OtpCodeBlockProps {
  mode: 'login' | 'register';
  phone: string;
  onPhoneChange: (val: string) => void;
  code: string;
  onCodeChange: (val: string) => void;
  phoneError?: string;
  codeError?: string;
  onAlreadyRegistered?: () => void;
  onNotRegistered?: () => void;
}

export function normalizeClientPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
  while (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export const OtpCodeBlock: React.FC<OtpCodeBlockProps> = ({
  mode,
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  phoneError,
  codeError,
  onAlreadyRegistered,
  onNotRegistered,
}) => {
  const {t} = useI18n();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [alreadyReg, setAlreadyReg] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = async () => {
    if (inFlightRef.current || cooldown > 0) return;
    const normalized = normalizeClientPhone(phone);
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      setSendError('Enter a valid 10-digit mobile number');
      return;
    }
    onPhoneChange(normalized);
    setSendError('');
    setAlreadyReg(false);
    inFlightRef.current = true;
    setSending(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        testCode?: string;
        expiresInSeconds?: number;
      }>('/api/auth/send-code', {
        method: 'POST',
        body: {phone: normalized, mode},
      });
      if (res.testCode) {
        setTestCode(res.testCode);
      }
      setCooldown(30);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ALREADY_REGISTERED') {
          setAlreadyReg(true);
        }
        if (err.code === 'NOT_REGISTERED') {
          onNotRegistered?.();
        }
        setSendError(err.message);
      } else {
        setSendError('Network error. Please try again.');
      }
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Phone field */}
      <div>
        <label className="block text-xs font-semibold text-[#111827] mb-1.5">
          {t('auth.phoneLabel')}
        </label>
        <div className="flex gap-2 items-center min-w-0 w-full">
          <div className="flex-1 min-w-0 flex items-center gap-2 bg-[#F3F4F6] rounded-full px-3.5 min-h-[48px] focus-within:ring-2 focus-within:ring-[#4B6F1B] transition-shadow">
            <Phone className="w-4 h-4 text-[#6B7280] shrink-0" />
            <span className="text-xs font-semibold text-[#6B7280] select-none shrink-0">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => {
                setSendError('');
                setAlreadyReg(false);
                onPhoneChange(e.target.value);
              }}
              placeholder={t('auth.phonePlaceholder')}
              className="flex-1 min-w-0 w-full bg-transparent text-base text-[#111827] placeholder:text-[#6B7280] focus:outline-none tabular-nums"
            />
          </div>

          <button
            type="button"
            onClick={handleSendCode}
            disabled={sending || cooldown > 0}
            className="min-h-[48px] px-3.5 max-w-[46%] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : null}
            <span className="truncate">
              {cooldown > 0
                ? t('auth.resendIn', {sec: cooldown})
                : testCode
                ? t('auth.resendCode')
                : t('auth.sendCode')}
            </span>
          </button>
        </div>

        {(phoneError || sendError) && !alreadyReg && (
          <p className="text-xs text-[#DC2626] mt-1.5 pl-2">{phoneError || sendError}</p>
        )}

        {alreadyReg && (
          <div className="mt-2 p-3 rounded-2xl bg-[#F59E0B]/12 border border-[#F59E0B]/30 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#111827] min-w-0">
              {t('auth.alreadyRegisteredMsg')}
            </span>
            {onAlreadyRegistered && (
              <button
                type="button"
                onClick={onAlreadyRegistered}
                className="px-3 py-1.5 rounded-full bg-[#4B6F1B] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t('auth.logInBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Amber Test Mode Banner */}
      {testCode && (
        <div className="p-3.5 rounded-2xl bg-[#F59E0B]/14 border border-[#F59E0B]/40 flex items-center justify-between gap-2.5 min-w-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#B45309]">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{t('auth.testModeBadge')}</span>
            </div>
            <p className="text-xs font-medium text-[#111827] break-words">
              {t('auth.testBanner', {code: testCode})}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCodeChange(testCode)}
            className="px-3 py-2 rounded-full bg-white border border-[#F59E0B]/50 text-[#111827] text-xs font-semibold hover:bg-amber-50 whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>{t('auth.autofill')}</span>
          </button>
        </div>
      )}

      {/* 6-digit Code field */}
      <div>
        <label className="block text-xs font-semibold text-[#111827] mb-1.5">
          {t('auth.codeLabel')}
        </label>
        <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-full px-4 min-h-[48px] focus-within:ring-2 focus-within:ring-[#4B6F1B] transition-shadow">
          <KeyRound className="w-4 h-4 text-[#6B7280] shrink-0" />
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('auth.codePlaceholder')}
            className="w-full bg-transparent text-sm text-[#111827] placeholder:text-[#6B7280] focus:outline-none tracking-widest tabular-nums"
          />
        </div>
        {codeError && <p className="text-xs text-[#DC2626] mt-1.5 pl-2">{codeError}</p>}
      </div>
    </div>
  );
};

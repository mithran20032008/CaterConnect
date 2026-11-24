import React, {useEffect, useRef, useState} from 'react';
import {CheckCircle2, Clock} from 'lucide-react';
import {useI18n} from '../i18n/I18nContext';

interface AutoVerifyBannerProps {
  status: string;
  registeredAt: string;
  autoVerifyMinutes: number;
  role: 'worker' | 'organisation' | 'admin';
  onAutoVerified: () => void;
}

export const AutoVerifyBanner: React.FC<AutoVerifyBannerProps> = ({
  status,
  registeredAt,
  autoVerifyMinutes,
  role,
  onAutoVerified,
}) => {
  const {t} = useI18n();
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (autoVerifyMinutes <= 0) return 0;
    const targetMs = new Date(registeredAt).getTime() + autoVerifyMinutes * 60 * 1000;
    return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
  });
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (status !== 'pending' || autoVerifyMinutes <= 0) return;

    const update = () => {
      const targetMs = new Date(registeredAt).getTime() + autoVerifyMinutes * 60 * 1000;
      const rem = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem === 0 && !triggeredRef.current) {
        triggeredRef.current = true;
        onAutoVerified();
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [status, registeredAt, autoVerifyMinutes, onAutoVerified]);

  if (status === 'rejected' || status === 'suspended') {
    return (
      <div className="p-4 rounded-2xl bg-[#DC2626]/10 border border-[#DC2626]/25 text-sm text-[#DC2626] font-medium">
        Your account status is currently <strong>{status}</strong>. Please contact CaterConnect support.
      </div>
    );
  }

  if (status === 'verified') {
    if (role === 'organisation') {
      return (
        <div className="p-3.5 rounded-2xl bg-[#4B6F1B]/10 border border-[#4B6F1B]/25 flex items-center gap-2.5 text-sm text-[#3C5A15] font-medium">
          <CheckCircle2 className="w-5 h-5 text-[#4B6F1B] shrink-0" />
          <span>{t('verification.verifiedBanner')}</span>
        </div>
      );
    }
    return null;
  }

  if (autoVerifyMinutes <= 0) {
    return (
      <div className="p-4 rounded-2xl bg-[#F59E0B]/12 border border-[#F59E0B]/30 flex items-center gap-3 text-sm text-[#111827]">
        <Clock className="w-5 h-5 text-[#F59E0B] shrink-0" />
        <span>{t('verification.pendingWait')}</span>
      </div>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formatted = `${mins}:${String(secs).padStart(2, '0')}`;

  if (secondsLeft === 0) {
    return (
      <div className="p-3.5 rounded-2xl bg-[#4B6F1B]/10 border border-[#4B6F1B]/25 flex items-center gap-2.5 text-sm text-[#3C5A15] font-medium">
        <CheckCircle2 className="w-5 h-5 text-[#4B6F1B] shrink-0" />
        <span>
          {role === 'organisation'
            ? t('verification.verifiedBanner')
            : 'Verified! Your worker profile is active.'}
        </span>
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded-2xl bg-[#F59E0B]/12 border border-[#F59E0B]/30 flex items-center gap-3 text-sm text-[#111827]">
      <Clock className="w-5 h-5 text-[#F59E0B] shrink-0" />
      <span className="font-medium tabular-nums">
        {t('verification.countdownBanner', {time: formatted})}
      </span>
    </div>
  );
};

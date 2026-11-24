import React from 'react';
import {ArrowLeft} from 'lucide-react';
import {useI18n} from '../i18n/I18nContext';

interface AuthShellProps {
  onBack?: () => void;
  children: React.ReactNode;
}

export const AuthShell: React.FC<AuthShellProps> = ({onBack, children}) => {
  const {t} = useI18n();

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {/* Fixed Green Header */}
      <header className="relative w-full min-h-[152px] max-h-[184px] h-[21dvh] bg-gradient-to-br from-[#4B6F1B] to-[#5D8722] text-white px-5 pt-safe pb-8 overflow-hidden shrink-0">
        {/* Subtle lighter circle (8% opacity) in corner */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/8"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -left-8 w-36 h-36 rounded-full bg-white/6"
        />

        <div className="h-full flex flex-col justify-between relative z-10 min-w-0">
          {/* Top row: Back on left, small CaterConnect once on right */}
          <div className="flex items-center justify-between pt-1 min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 min-h-[40px] pr-3 text-sm font-medium text-white/95 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>{t('common.back')}</span>
              </button>
            ) : (
              <span />
            )}
            <span className="text-sm font-semibold tracking-tight text-white/95 whitespace-nowrap">
              {t('brand')}
            </span>
          </div>

          {/* Tagline + non-overlapping ~56px server SVG illustration */}
          <div className="flex items-end justify-between gap-3 pb-1 min-w-0">
            <div className="text-sm font-light leading-snug text-white/95 min-w-0 flex-1">
              <div className="truncate">{t('common.tagline1')}</div>
              <div className="truncate">{t('common.tagline2')}</div>
            </div>

            {/* Small 56px inline server cloche illustration */}
            <svg
              width="52"
              height="52"
              viewBox="0 0 56 56"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="shrink-0 opacity-95"
            >
              <circle cx="28" cy="28" r="26" fill="white" fillOpacity="0.12" />
              <path
                d="M14 34C14 26.268 20.268 20 28 20C35.732 20 42 26.268 42 34H14Z"
                fill="white"
              />
              <circle cx="28" cy="17.5" r="2.5" fill="#A3C957" />
              <rect x="10" y="36" width="36" height="3.5" rx="1.75" fill="white" />
              <path
                d="M18 42.5H38"
                stroke="#A3C957"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </header>

      {/* Scrollable overlapping white form sheet */}
      <main className="flex-1 min-h-0 w-full -mt-5 bg-white rounded-t-[28px] shadow-[0_-8px_30px_rgba(17,24,39,0.08)] px-5 pt-7 pb-safe z-20 app-scroll">
        <div className="pb-8 min-w-0">{children}</div>
      </main>
    </div>
  );
};

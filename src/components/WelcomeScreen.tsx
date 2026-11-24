import React, {useState} from 'react';
import {motion, useReducedMotion} from 'motion/react';
import {Loader2} from 'lucide-react';
import {useI18n} from '../i18n/I18nContext';

// Optional configurable brand button color (default CaterConnect green #4B6F1B; reference blue #3B82F6)
export const BRAND_BUTTON_COLOR = '#4B6F1B';
export const BRAND_BUTTON_HOVER = '#3C5A15';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogIn: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({onGetStarted, onLogIn}) => {
  const {lang, setLang, t} = useI18n();
  const prefersReduced = useReducedMotion();
  const [navigating, setNavigating] = useState(false);

  const handleStart = () => {
    if (navigating) return;
    setNavigating(true);
    setTimeout(() => {
      onGetStarted();
      setNavigating(false);
    }, 120);
  };

  return (
    <div className="h-full w-full bg-white text-[#111827] flex flex-col justify-between pt-safe pb-safe relative app-scroll">
      {/* Top-right language toggle */}
      <div className="w-full px-5 pt-2 flex justify-end z-20 shrink-0">
        <div
          className="inline-flex items-center rounded-full bg-[#F3F4F6] p-1 border border-gray-200/80"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer min-h-[32px] whitespace-nowrap ${
              lang === 'en'
                ? 'bg-[#4B6F1B] text-white shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('ta')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer min-h-[32px] whitespace-nowrap ${
              lang === 'ta'
                ? 'bg-[#4B6F1B] text-white shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            தமிழ்
          </button>
        </div>
      </div>

      {/* Main vertical welcome stack */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-between px-6 pb-4">
        {/* Hero section (~60% of viewport height) */}
        <motion.div
          initial={prefersReduced ? false : {opacity: 0, y: 24}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: prefersReduced ? 0 : 0.4, ease: [0.16, 1, 0.3, 1]}}
          className="relative w-full flex-1 min-h-[300px] max-h-[56dvh] flex items-end justify-center overflow-hidden mt-1"
        >
          <picture className="flex justify-center items-end h-full w-full">
            <source
              type="image/webp"
              srcSet="/images/welcome-server.webp 1x, /images/welcome-server@2x.webp 2x, /images/welcome-server@3x.webp 3x"
            />
            <img
              src="/images/welcome-server.png"
              srcSet="/images/welcome-server.png 1x, /images/welcome-server@2x.png 2x, /images/welcome-server@3x.png 3x"
              alt="CaterConnect catering server holding silver cloche tray"
              width={273}
              height={322}
              loading="eager"
              decoding="sync"
              className="h-full max-h-[54dvh] w-auto object-contain object-bottom select-none pointer-events-none"
            />
          </picture>
          {/* Soft white bottom gradient mask so legs blend into headline */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/85 to-transparent"
          />
        </motion.div>

        {/* Headline + CTA anchored cleanly below */}
        <div className="w-full flex flex-col items-center text-center -mt-4 z-10">
          <h1
            className={`font-extrabold tracking-tight text-[#111827] leading-[1.15] mb-6 ${
              lang === 'ta' ? 'text-[24px] sm:text-[26px]' : 'text-[30px] sm:text-[32px]'
            }`}
          >
            <motion.span
              className="block"
              initial={prefersReduced ? false : {opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: prefersReduced ? 0 : 0.3, delay: prefersReduced ? 0 : 0.18}}
            >
              {t('welcome.line1')}
            </motion.span>
            <motion.span
              className="block"
              initial={prefersReduced ? false : {opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: prefersReduced ? 0 : 0.3, delay: prefersReduced ? 0 : 0.28}}
            >
              {t('welcome.line2')}
            </motion.span>
            <motion.span
              className="block"
              initial={prefersReduced ? false : {opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: prefersReduced ? 0 : 0.3, delay: prefersReduced ? 0 : 0.38}}
            >
              {t('welcome.line3')}
            </motion.span>
          </h1>

          <motion.div
            className="w-full flex flex-col items-center gap-3.5"
            initial={prefersReduced ? false : {opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: prefersReduced ? 0 : 0.32, delay: prefersReduced ? 0 : 0.48}}
          >
            <button
              type="button"
              onClick={handleStart}
              disabled={navigating}
              style={{backgroundColor: BRAND_BUTTON_COLOR}}
              className="w-full min-h-[52px] rounded-full text-white font-semibold text-base shadow-[0_8px_22px_-4px_rgba(75,111,27,0.42)] hover:brightness-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            >
              {navigating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <span>{t('welcome.getStarted')}</span>
              )}
            </button>

            <button
              type="button"
              onClick={onLogIn}
              className="min-h-[44px] px-4 text-sm text-[#6B7280] hover:text-[#111827] transition-colors cursor-pointer"
            >
              {t('welcome.alreadyHaveAccount')}{' '}
              <span className="font-semibold text-[#4B6F1B] underline underline-offset-2">
                {t('welcome.logIn')}
              </span>
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

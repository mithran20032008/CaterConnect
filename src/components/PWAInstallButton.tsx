import React, {useEffect, useState} from 'react';
import {Download, Share} from 'lucide-react';
import {useI18n} from '../i18n/I18nContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {isInstallable: Boolean(deferredPrompt), isInstalled, isIOS, install};
}

export const PWAInstallButton: React.FC = () => {
  const {t} = useI18n();
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full min-h-[46px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>{t('pwa.installApp')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full min-h-[46px] rounded-full bg-[#4B6F1B]/10 text-[#4B6F1B] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <Share className="w-4 h-4" />
          <span>{t('pwa.installIOS')}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-bold text-[#111827]">Install CaterConnect on iPhone</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s bottom toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-full bg-[#4B6F1B] text-white text-sm font-semibold cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

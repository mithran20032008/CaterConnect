import React from 'react';
import {Check, Globe} from 'lucide-react';
import {AuthShell} from './AuthShell';
import {useI18n, type Language} from '../i18n/I18nContext';

interface LanguageSelectorScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

export const LanguageSelectorScreen: React.FC<LanguageSelectorScreenProps> = ({
  onBack,
  onContinue,
}) => {
  const {lang, setLang, markLangChosen, t} = useI18n();

  const handleSelect = (choice: Language) => {
    setLang(choice);
  };

  const handleContinue = () => {
    markLangChosen();
    onContinue();
  };

  return (
    <AuthShell onBack={onBack}>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="w-11 h-11 rounded-2xl bg-[#4B6F1B]/10 text-[#4B6F1B] flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">{t('lang.chooseTitle')}</h1>
          <p className="text-sm text-[#6B7280]">{t('lang.chooseSubtitle')}</p>
        </div>

        <div className="space-y-3">
          {[
            {id: 'en' as Language, title: 'English', sub: 'Use CaterConnect in English'},
            {id: 'ta' as Language, title: 'தமிழ் (Tamil)', sub: 'CaterConnect-ஐ தமிழில் பயன்படுத்தவும்'},
          ].map((opt) => {
            const active = lang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={`cc-card w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-2 cursor-pointer min-h-[68px] min-w-0 ${
                  active
                    ? 'border-[#4B6F1B] bg-[#4B6F1B]/5 shadow-xs'
                    : 'border-gray-200 bg-[#F3F4F6]/60 hover:bg-[#F3F4F6]'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#111827] text-base">{opt.title}</div>
                  <div className="text-xs text-[#6B7280] mt-0.5">{opt.sub}</div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 ${
                    active
                      ? 'bg-[#4B6F1B] border-[#4B6F1B] text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="w-full min-h-[50px] rounded-full bg-[#4B6F1B] hover:bg-[#3C5A15] text-white font-semibold text-base shadow-md transition-colors cursor-pointer"
        >
          {t('lang.continue')}
        </button>
      </div>
    </AuthShell>
  );
};

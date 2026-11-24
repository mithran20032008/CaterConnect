import React from 'react';
import {Building2, ChevronRight, Users} from 'lucide-react';
import {AuthShell} from './AuthShell';
import {useI18n} from '../i18n/I18nContext';

interface RoleChooserScreenProps {
  onBack: () => void;
  onChooseWorker: () => void;
  onChooseOrg: () => void;
  onLogIn: () => void;
}

export const RoleChooserScreen: React.FC<RoleChooserScreenProps> = ({
  onBack,
  onChooseWorker,
  onChooseOrg,
  onLogIn,
}) => {
  const {t} = useI18n();

  return (
    <AuthShell onBack={onBack}>
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-[#111827]">{t('role.title')}</h1>
          <p className="text-sm text-[#6B7280]">{t('role.subtitle')}</p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={onChooseWorker}
            className="cc-card w-full text-left p-5 rounded-2xl bg-white border border-gray-200 hover:border-[#4B6F1B] shadow-[0_4px_16px_rgba(17,24,39,0.05)] transition-all flex items-center gap-4 cursor-pointer group min-w-0"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#4B6F1B]/10 text-[#4B6F1B] flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base text-[#111827] group-hover:text-[#4B6F1B] transition-colors">
                {t('role.workerTitle')}
              </div>
              <div className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                {t('role.workerDesc')}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#6B7280] group-hover:text-[#4B6F1B] shrink-0" />
          </button>

          <button
            type="button"
            onClick={onChooseOrg}
            className="cc-card w-full text-left p-5 rounded-2xl bg-white border border-gray-200 hover:border-[#4B6F1B] shadow-[0_4px_16px_rgba(17,24,39,0.05)] transition-all flex items-center gap-4 cursor-pointer group min-w-0"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#A3C957]/25 text-[#4B6F1B] flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base text-[#111827] group-hover:text-[#4B6F1B] transition-colors">
                {t('role.orgTitle')}
              </div>
              <div className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                {t('role.orgDesc')}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#6B7280] group-hover:text-[#4B6F1B] shrink-0" />
          </button>
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onLogIn}
            className="text-sm text-[#6B7280] hover:text-[#111827] min-h-[44px] px-3 cursor-pointer"
          >
            {t('role.alreadyMember')}{' '}
            <span className="font-semibold text-[#4B6F1B] underline underline-offset-2">
              {t('role.logIn')}
            </span>
          </button>
        </div>
      </div>
    </AuthShell>
  );
};

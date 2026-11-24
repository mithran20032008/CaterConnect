import React, {useCallback, useEffect, useState} from 'react';
import {I18nProvider, useI18n} from './i18n/I18nContext';
import {
  apiRequest,
  clearAuthToken,
  consumePendingReturnJobId,
  registerAuthExpiredHandler,
  setActiveViewingJobId,
  setAuthToken,
} from './lib/api';
import {WelcomeScreen} from './components/WelcomeScreen';
import {LanguageSelectorScreen} from './components/LanguageSelectorScreen';
import {RoleChooserScreen} from './components/RoleChooserScreen';
import {LoginScreen} from './components/LoginScreen';
import {RegisterWorkerScreen} from './components/RegisterWorkerScreen';
import {RegisterOrgScreen} from './components/RegisterOrgScreen';
import {WorkerApp} from './components/WorkerApp';
import {OrgApp} from './components/OrgApp';
import {AdminApp} from './components/AdminApp';
import type {Organisation, User} from './types';

type Screen =
  | 'loading'
  | 'welcome'
  | 'language'
  | 'role'
  | 'login'
  | 'register_worker'
  | 'register_org'
  | 'app';

interface SessionState {
  user: User | null;
  organisation: Organisation | null;
  autoVerifyMinutes: number;
  token?: string;
}

const AppRouter: React.FC = () => {
  const {hasChosenLang, setLang} = useI18n();
  const [screen, setScreen] = useState<Screen>('loading');
  const [loginNotice, setLoginNotice] = useState('');
  const [returnJobId, setReturnJobId] = useState<number | null>(null);
  const [session, setSession] = useState<SessionState>({
    user: null,
    organisation: null,
    autoVerifyMinutes: 2,
  });

  useEffect(() => {
    registerAuthExpiredHandler((jobIdToReturn) => {
      setSession((prev) => ({...prev, user: null, organisation: null}));
      setLoginNotice(
        jobIdToReturn
          ? 'Your session expired. Log in to return to the job you were viewing.'
          : 'Your session expired. Please log in to continue.'
      );
      setScreen('login');
    });
    return () => registerAuthExpiredHandler(null);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest<SessionState>('/api/auth/me');
      setSession({
        user: data.user || null,
        organisation: data.organisation || null,
        autoVerifyMinutes: data.autoVerifyMinutes ?? 2,
      });
      if (data.user) {
        if (data.token) setAuthToken(data.token);
        if (data.user.language === 'ta' || data.user.language === 'en') {
          setLang(data.user.language);
        }
        setScreen('app');
      } else {
        clearAuthToken();
        if (window.location.pathname === '/admin') {
          setScreen('login');
        } else {
          setScreen((prev) => (prev === 'loading' ? 'welcome' : prev));
        }
      }
    } catch {
      setScreen((prev) => (prev === 'loading' ? 'welcome' : prev));
    }
  }, [setLang]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleAuthSuccess = (payload: {
    user: User;
    organisation: Organisation | null;
    autoVerifyMinutes: number;
    token?: string;
  }) => {
    if (payload.token) {
      setAuthToken(payload.token);
    }
    setLoginNotice('');
    const pendingJob = consumePendingReturnJobId();
    setReturnJobId(pendingJob);
    setSession({
      user: payload.user,
      organisation: payload.organisation,
      autoVerifyMinutes: payload.autoVerifyMinutes ?? 2,
    });
    setScreen('app');
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', {method: 'POST'}).catch(() => {});
    clearAuthToken();
    setActiveViewingJobId(null);
    setReturnJobId(null);
    setLoginNotice('');
    setSession({user: null, organisation: null, autoVerifyMinutes: 2});
    setScreen(window.location.pathname === '/admin' ? 'login' : 'welcome');
  };

  if (screen === 'loading') {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <div className="w-9 h-9 rounded-full border-3 border-[#4B6F1B]/25 border-t-[#4B6F1B] animate-spin" />
      </div>
    );
  }

  if (screen === 'welcome') {
    return (
      <WelcomeScreen
        onGetStarted={() => setScreen(hasChosenLang ? 'role' : 'language')}
        onLogIn={() => {
          setLoginNotice('');
          setScreen('login');
        }}
      />
    );
  }

  if (screen === 'language') {
    return (
      <LanguageSelectorScreen
        onBack={() => setScreen('welcome')}
        onContinue={() => setScreen('role')}
      />
    );
  }

  if (screen === 'role') {
    return (
      <RoleChooserScreen
        onBack={() => setScreen(hasChosenLang ? 'welcome' : 'language')}
        onChooseWorker={() => setScreen('register_worker')}
        onChooseOrg={() => setScreen('register_org')}
        onLogIn={() => {
          setLoginNotice('');
          setScreen('login');
        }}
      />
    );
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onBack={() => {
          setLoginNotice('');
          setScreen('welcome');
        }}
        onRegister={() => {
          setLoginNotice('');
          setScreen(hasChosenLang ? 'role' : 'language');
        }}
        onSuccess={handleAuthSuccess}
        notice={loginNotice}
      />
    );
  }

  if (screen === 'register_worker') {
    return (
      <RegisterWorkerScreen
        onBack={() => setScreen('role')}
        onLogIn={() => setScreen('login')}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (screen === 'register_org') {
    return (
      <RegisterOrgScreen
        onBack={() => setScreen('role')}
        onLogIn={() => setScreen('login')}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (screen === 'app' && session.user) {
    if (session.user.role === 'admin') {
      return <AdminApp onLogout={handleLogout} />;
    }
    if (session.user.role === 'organisation' && session.organisation) {
      return (
        <OrgApp
          user={session.user}
          organisation={session.organisation}
          autoVerifyMinutes={session.autoVerifyMinutes}
          onRefreshSession={refreshSession}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <WorkerApp
        user={session.user}
        autoVerifyMinutes={session.autoVerifyMinutes}
        initialJobId={returnJobId}
        onConsumedInitialJob={() => setReturnJobId(null)}
        onRefreshSession={refreshSession}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <WelcomeScreen
      onGetStarted={() => setScreen(hasChosenLang ? 'role' : 'language')}
      onLogIn={() => setScreen('login')}
    />
  );
};

export default function App() {
  return (
    <I18nProvider>
      <div className="h-[100dvh] w-full bg-[#ECEFF3] flex justify-center overflow-hidden">
        <div className="w-full max-w-[430px] h-[100dvh] bg-white sm:shadow-[0_0_40px_rgba(17,24,39,0.10)] sm:border-x sm:border-gray-200/80 relative flex flex-col overflow-hidden">
          <AppRouter />
        </div>
      </div>
    </I18nProvider>
  );
}

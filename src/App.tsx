import './i18n';
import './styles/globals.css';

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import Onboard from './pages/Onboard';
import Doctor from './pages/Doctor';
import Backup from './pages/Backup';
import Config from './pages/Config';
import Settings from './pages/Settings';
import VpsManager from './pages/VpsManager';
import ImapWizard from './pages/ImapWizard';
import Channels from './pages/Channels';
import Automations from './pages/Automations';
import Sources from './pages/Sources';
import Bootstrap from './pages/Bootstrap';
import Welcome from './pages/Welcome';
import ApiKeySetup from './pages/ApiKeySetup';
import { useWindowTitle } from './lib/useWindowTitle';
import { ActiveTargetProvider } from './context/ActiveTargetContext';
import { OperationProvider } from './context/OperationContext';

const LOCALE_KEY = 'clawsquire.locale';
const API_KEY_KEY = 'clawsquire.apiKeyConfigured';

function AppShell() {
  useWindowTitle();

  return (
    <ActiveTargetProvider>
    <OperationProvider>
    <BrowserRouter>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6 text-gray-900 dark:text-gray-100">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/onboard" element={<Onboard />} />
              <Route path="/onboard/:templateId" element={<Onboard />} />
              <Route path="/doctor" element={<Doctor />} />
              <Route path="/backup" element={<Backup />} />
              <Route path="/config" element={<Config />} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/automations" element={<Automations />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/bootstrap" element={<Bootstrap />} />
              <Route path="/vps" element={<VpsManager />} />
              <Route path="/imap" element={<ImapWizard />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
    </OperationProvider>
    </ActiveTargetProvider>
  );
}

export default function App() {
  const [hasChosenLocale, setHasChosenLocale] = useState(
    () => localStorage.getItem(LOCALE_KEY) !== null,
  );
  const [hasApiKey, setHasApiKey] = useState(
    () => localStorage.getItem(API_KEY_KEY) !== null,
  );

  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      getCurrentWindow().show().catch(() => {});
    }
  }, []);

  if (!hasChosenLocale) {
    return (
      <ErrorBoundary>
        <Welcome onLanguageSelected={() => setHasChosenLocale(true)} />
      </ErrorBoundary>
    );
  }

  if (!hasApiKey) {
    return (
      <ErrorBoundary>
        <ApiKeySetup onComplete={() => setHasApiKey(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

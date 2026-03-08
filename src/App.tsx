import './i18n';
import './styles/globals.css';

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import Onboard from './pages/Onboard';
import Doctor from './pages/Doctor';
import Backup from './pages/Backup';
import Config from './pages/Config';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Welcome from './pages/Welcome';
import { useWindowTitle } from './lib/useWindowTitle';

const LOCALE_KEY = 'clawsquire.locale';

function AppShell() {
  useWindowTitle();

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/onboard" element={<Onboard />} />
              <Route path="/onboard/:templateId" element={<Onboard />} />
              <Route path="/doctor" element={<Doctor />} />
              <Route path="/backup" element={<Backup />} />
              <Route path="/config" element={<Config />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  const [hasChosenLocale, setHasChosenLocale] = useState(
    () => localStorage.getItem(LOCALE_KEY) !== null,
  );

  if (!hasChosenLocale) {
    return (
      <ErrorBoundary>
        <Welcome onLanguageSelected={() => setHasChosenLocale(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

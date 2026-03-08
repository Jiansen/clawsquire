import './i18n';
import './styles/globals.css';

import { BrowserRouter, Routes, Route } from 'react-router';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import Onboard from './pages/Onboard';
import Doctor from './pages/Doctor';
import Backup from './pages/Backup';
import Settings from './pages/Settings';

export default function App() {
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
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

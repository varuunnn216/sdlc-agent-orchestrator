import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Noise } from './components/reactbits/Noise';
import type { DemoStatus } from './types';

const FloatingLines = lazy(
  () => import('./components/reactbits/FloatingLines')
);
const LandingPage = lazy(() => import('./pages/LandingPage'));
const FixBugPage = lazy(() => import('./pages/FixBugPage'));
const BacklogPage = lazy(() => import('./pages/BacklogPage'));

export function App() {
  const location = useLocation();
  const [bgStatus, setBgStatus] = useState<string>('idle');
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);

  const refreshDemoStatus = useCallback(() => {
    fetch('/api/demo-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DemoStatus | null) => {
        if (data) setDemoStatus(data);
      })
      .catch(() => {
        // Ignore when demo-status endpoint is unavailable
      });
  }, []);

  useEffect(() => {
    refreshDemoStatus();
  }, [refreshDemoStatus]);

  useEffect(() => {
    if (location.pathname === '/') {
      setBgStatus('idle');
    }
  }, [location.pathname]);

  return (
    <>
      <Suspense fallback={null}>
        <FloatingLines status={bgStatus} />
      </Suspense>
      <Noise />
      <Header demoStatus={demoStatus} />
      <div key={location.pathname} className="page-transition">
        <Suspense fallback={<div className="route-loading" aria-live="polite" />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/fix"
              element={
                <FixBugPage
                  demoStatus={demoStatus}
                  onStatusChange={setBgStatus}
                  onRunStarted={refreshDemoStatus}
                />
              }
            />
            <Route
              path="/backlog"
              element={
                <BacklogPage
                  onStatusChange={setBgStatus}
                  onRunStarted={refreshDemoStatus}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}

export default App;

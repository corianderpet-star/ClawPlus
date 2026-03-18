/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MainLayout } from './components/layout/MainLayout';
import i18n from './i18n';
import { applyGatewayTransportPreference } from './lib/api-client';
import { applyThemeColor } from './lib/theme-colors';
import { Agents } from './pages/Agents';
import { Approvals } from './pages/Approvals';
import { Channels } from './pages/Channels';
import { Chat } from './pages/Chat';
import { Cron } from './pages/Cron';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { Models } from './pages/Models';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { Skills } from './pages/Skills';
import { Workflows } from './pages/Workflows';
import { useGatewayStore } from './stores/gateway';
import { useSettingsStore } from './stores/settings';

const PUBLIC_ROUTES = ['/landing'];

/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '40px',
            color: '#f87171',
            background: '#0f172a',
            minHeight: '100vh',
            fontFamily: 'monospace',
          }}
        >
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#1e293b',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const initSettings = useSettingsStore((state) => state.init);
  const theme = useSettingsStore((state) => state.theme);
  const themeColor = useSettingsStore((state) => state.themeColor);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const initGateway = useGatewayStore((state) => state.init);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    initGateway();
  }, [initGateway]);

  useEffect(() => {
    const isPublicRoute = PUBLIC_ROUTES.some(
      (route) => location.pathname === route || location.pathname.startsWith(`${route}/`),
    );

    if (!setupComplete && !location.pathname.startsWith('/setup') && !isPublicRoute) {
      navigate('/setup');
    }
  }, [setupComplete, location.pathname, navigate]);

  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === 'string') {
        navigate(path);
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on('navigate', handleNavigate);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    applyThemeColor(themeColor, theme);

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyThemeColor(themeColor, theme);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [theme, themeColor]);

  useEffect(() => {
    applyGatewayTransportPreference();
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/setup/*" element={<Setup />} />

          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/models" element={<Models />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
        </Routes>

        <Toaster position="bottom-right" richColors closeButton style={{ zIndex: 99999 }} />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;

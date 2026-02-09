import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/Layout/index';
import { FullPageLoader, ErrorBoundary } from './components/feedback';
import './styles/globals.css';

// Lazy load pages for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Assets = lazy(() => import('./pages/Assets').then((module) => ({ default: module.Assets })));
const AssetDetail = lazy(() => import('./pages/AssetDetail').then((module) => ({ default: module.AssetDetail })));
const AssetForm = lazy(() => import('./pages/AssetForm').then((module) => ({ default: module.AssetForm })));
const Lighting = lazy(() => import('./pages/Lighting').then((module) => ({ default: module.Lighting })));
const Renders = lazy(() => import('./pages/Renders').then((module) => ({ default: module.Renders })));
const Uploads = lazy(() => import('./pages/Uploads').then((module) => ({ default: module.Uploads })));

// Configure React Query with optimal settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    },
  },
});

// Page loader component
function PageLoader(): JSX.Element {
  return (
    <div className="flex items-center justify-center h-64">
      <FullPageLoader message="Carregando página..." />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center min-h-screen p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Ops! Algo deu errado
              </h1>
              <p className="text-gray-600 mb-6">
                Ocorreu um erro inesperado. Por favor, recarregue a página.
              </p>
            </div>
          }
        >
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="assets" element={<Assets />} />
                <Route path="assets/new" element={<AssetForm />} />
                <Route path="assets/:id" element={<AssetDetail />} />
                <Route path="lighting" element={<Lighting />} />
                <Route path="renders" element={<Renders />} />
                <Route path="uploads" element={<Uploads />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

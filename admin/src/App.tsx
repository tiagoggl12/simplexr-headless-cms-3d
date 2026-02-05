import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/Layout/index.js';
import { Dashboard } from './pages/Dashboard.js';
import { Assets } from './pages/Assets.js';
import { AssetDetail } from './pages/AssetDetail.js';
import { AssetForm } from './pages/AssetForm.js';
import { Lighting } from './pages/Lighting.js';
import { Renders } from './pages/Renders.js';
import { Uploads } from './pages/Uploads.js';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

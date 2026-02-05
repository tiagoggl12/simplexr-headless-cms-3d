import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { ToastContainer } from '../ui/Toast.js';

interface MainLayoutProps {
  title?: string;
  actions?: React.ReactNode;
}

export function MainLayout({ title, actions }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-page">
      <Sidebar />
      <div className="lg:ml-64">
        <Header title={title} actions={actions} />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

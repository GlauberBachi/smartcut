import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import DeploymentMessage from './components/DeploymentMessage';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import CutOptimizer from './pages/CutOptimizer';
import Pricing from './pages/Pricing';
import Notifications from './pages/Notifications';
import PersonalInfo from './pages/PersonalInfo';
import Avatar from './pages/Avatar';
import ChangePassword from './pages/ChangePassword';
import DeleteAccount from './pages/DeleteAccount';
import Admin from './pages/Admin';
import Success from './pages/Success';
import Footer from './components/Footer';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/" />;
};

const AppContent = () => {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-50 to-tech-50">
      <DeploymentMessage />
      <div className="print:hidden">
        <Navbar />
      </div>
      <div className="flex flex-1">
        {user && <Sidebar />}
        <div className="flex-1">
          <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Home />} />
            <Route path="/dashboard" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="/cut-optimizer" element={
              <PrivateRoute>
                <CutOptimizer />
              </PrivateRoute>
            } />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/notifications" element={
              <PrivateRoute>
                <Notifications />
              </PrivateRoute>
            } />
            <Route path="/personal-info" element={
              <PrivateRoute>
                <PersonalInfo />
              </PrivateRoute>
            } />
            <Route path="/avatar" element={
              <PrivateRoute>
                <Avatar />
              </PrivateRoute>
            } />
            <Route path="/change-password" element={
              <PrivateRoute>
                <ChangePassword />
              </PrivateRoute>
            } />
            <Route path="/delete-account" element={
              <PrivateRoute>
                <DeleteAccount />
              </PrivateRoute>
            } />
            <Route path="/success" element={<Success />} />
            <Route path="/admin" element={
              <PrivateRoute>
                <Admin />
              </PrivateRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
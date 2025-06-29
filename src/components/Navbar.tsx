import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard, Scissors } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';
import LanguageSwitcher from './LanguageSwitcher';
import ProfileDropdown from './ProfileDropdown';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';

const Navbar = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.id) {
        setIsAdmin(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        setIsAdmin(data?.role === 'admin');
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user?.id]);

  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url);
    } else {
      setAvatarUrl(null);
    }
  }, [user]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [user]);

  return (
    <>
      <nav className="bg-white shadow-lg bg-opacity-80 backdrop-blur-sm relative z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex-1 flex items-center">
              <div className="lg:hidden mr-2">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="text-gray-500 hover:text-gray-600 focus:outline-none"
                >
                  {isMobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>
              </div>
              <Link to={user ? "/dashboard" : "/"} className="flex items-center">
                <img src="/logo.png" alt="SmartCut" className="h-12" />
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {isAdmin && (
                  <Link to="/admin" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-primary-600">
                    {t('nav.admin')}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <LanguageSwitcher />
              {user ? (
                <ProfileDropdown user={user} avatarUrl={avatarUrl} />
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 rounded-md hover:from-primary-700 hover:to-tech-600 transition-all duration-200"
                >
                  {t('nav.login')}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Mobile Sidebar */}
      {isMobileMenuOpen && user && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-lg">
            <div className="flex flex-col h-full">
              <div className="flex-1 px-4 pt-5 pb-4 overflow-y-auto">
                <nav className="space-y-1">
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                      location.pathname === '/dashboard'
                        ? 'bg-gradient-to-r from-primary-50 to-tech-50 text-primary-700'
                        : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-tech-50 hover:text-primary-600'
                    }`}
                  >
                    <LayoutDashboard className="mr-3 h-5 w-5" />
                    {t('sidebar.dashboard')}
                  </Link>
                  <Link
                    to="/cut-optimizer"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                      location.pathname === '/cut-optimizer'
                        ? 'bg-gradient-to-r from-primary-50 to-tech-50 text-primary-700'
                        : 'text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-tech-50 hover:text-primary-600'
                    }`}
                  >
                    <Scissors className="mr-3 h-5 w-5" />
                    {t('sidebar.cutOptimizer')}
                  </Link>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};

export default Navbar;
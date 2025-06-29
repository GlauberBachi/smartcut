import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Camera, Key, CreditCard, ChevronDown, Bell, Menu, X, LayoutDashboard, Scissors, Trash2, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';
import LanguageSwitcher from './LanguageSwitcher';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';

const Navbar = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

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
    const loadUserProfile = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        
        if (data?.full_name) {
          const firstName = data.full_name.split(' ')[0];
          setFirstName(firstName);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };

    loadUserProfile();
  }, [user?.id]);

  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url);
    } else {
      setAvatarUrl(null);
    }
  }, [user]);

  useEffect(() => {
    setShowProfileMenu(false);
    setIsMobileMenuOpen(false);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProfileMenu]);

  const getInitials = (email: string) => {
    return email?.charAt(0).toUpperCase() || 'U';
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      navigate('/');
    }
  };

  const handleProfileNavigation = (tab: string) => {
    setShowProfileMenu(false);
    // Use setTimeout to ensure state update happens first
    setTimeout(() => {
      navigate('/profile', { state: { activeTab: tab } });
    }, 0);
  };

  const handleNotificationsNavigation = () => {
    setShowProfileMenu(false);
    setTimeout(() => {
      navigate('/notifications');
    }, 0);
  };

  const handlePricingNavigation = () => {
    setShowProfileMenu(false);
    setTimeout(() => {
      navigate('/pricing');
    }, 0);
  };

  const handleSignOutClick = async () => {
    setShowProfileMenu(false);
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      navigate('/');
    }
  };



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
                <div className="relative" ref={profileMenuRef}>
                  <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700">
                    {user.email}
                  </span>
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center space-x-2"
                  >
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={`Avatar de ${user.email}`}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement!.innerHTML = `<span class="text-sm font-medium text-primary-600">${getInitials(user.email || '')}</span>`;
                          }}
                        />
                      ) : (
                        <span className="text-sm font-medium text-primary-600">
                          {getInitials(user.email || '')}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </button>
                  </div>
                  {/* Profile dropdown menu */}
                  {showProfileMenu && (
                    <div 
                      className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50"
                    >
                      <div className="py-1">
                        <button
                          onClick={() => handleProfileNavigation('personal')}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <User className="h-4 w-4 mr-2" />
                          <span>{t('nav.profile.personalInfo')}</span>
                        </button>
                        <button
                          onClick={() => handleProfileNavigation('avatar')}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          <span>{t('nav.profile.avatar')}</span>
                        </button>
                        <button
                          onClick={handleNotificationsNavigation}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <Bell className="h-4 w-4 mr-2" />
                          <span>{t('nav.profile.notifications')}</span>
                        </button>
                        <button
                          onClick={() => handleProfileNavigation('password')}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <Key className="h-4 w-4 mr-2" />
                          <span>{t('nav.profile.password')}</span>
                        </button>
                        <button
                          onClick={handlePricingNavigation}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          <span>Assinaturas</span>
                        </button>
                        <button 
                          onClick={() => handleProfileNavigation('danger')}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          <span>Excluir conta</span>
                        </button>
                        <hr className="my-1" />
                        <button
                          onClick={handleSignOutClick}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                        >
                          {t('nav.profile.logout')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
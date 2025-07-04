import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Camera, Key, CreditCard, Bell, Trash2, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface ProfileDropdownProps {
  user: any;
  avatarUrl: string | null;
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ user, avatarUrl }) => {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getInitials = (email: string) => {
    return email?.charAt(0).toUpperCase() || 'U';
  };

  // Calcular posição do dropdown
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    
    const rect = buttonRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    setDropdownPosition({
      top: rect.bottom + scrollY + 8,
      left: rect.right + scrollX - 192 // 192px = w-48
    });
  }, []);

  // Toggle dropdown
  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isOpen) {
      calculatePosition();
    }
    setIsOpen(prev => !prev);
  }, [isOpen, calculatePosition]);

  // Fechar dropdown
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Event listener para fechar quando clicar fora
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: Event) => {
      const target = event.target as Element;
      
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      
      closeDropdown();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    // Usar capture para garantir que seja executado primeiro
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeDropdown]);

  // Recalcular posição quando a janela redimensionar
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      calculatePosition();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [isOpen, calculatePosition]);

  // Funções de navegação
  const handleProfileNavigation = useCallback((tab: string) => {
    console.log('ProfileDropdown: Navigating to profile tab:', tab);
    closeDropdown();
    // Navegar diretamente com query parameter
    navigate(`/profile?tab=${tab}`);
  }, [navigate, closeDropdown]);

  const handleNotificationsNavigation = useCallback(() => {
    console.log('ProfileDropdown: Navigating to notifications');
    closeDropdown();
    setTimeout(() => {
      navigate('/notifications');
    }, 50);
  }, [navigate, closeDropdown]);

  const handlePricingNavigation = useCallback(() => {
    console.log('ProfileDropdown: Navigating to pricing');
    closeDropdown();
    setTimeout(() => {
      navigate('/pricing');
    }, 50);
  }, [navigate, closeDropdown]);

  const handleSignOutClick = useCallback(async () => {
    closeDropdown();
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      navigate('/');
    }
  }, [signOut, navigate, closeDropdown]);

  // Dropdown content
  const dropdownContent = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-[99999]"
      style={{
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        animation: 'dropdownFadeIn 0.15s ease-out'
      }}
    >
      <div className="py-1">
        <button
          onClick={() => handleProfileNavigation('personal')}
          className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <User className="h-4 w-4 mr-2" />
          <span>{t('nav.profile.personalInfo')}</span>
        </button>
        <button
          onClick={() => handleProfileNavigation('avatar')}
          className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Camera className="h-4 w-4 mr-2" />
          <span>{t('nav.profile.avatar')}</span>
        </button>
        <button
          onClick={handleNotificationsNavigation}
          className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Bell className="h-4 w-4 mr-2" />
          <span>{t('nav.profile.notifications')}</span>
        </button>
        <button
          onClick={handlePricingNavigation}
          className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <CreditCard className="h-4 w-4 mr-2" />
          <span>Assinaturas</span>
        </button>
        <hr className="my-1" />
        <button
          onClick={handleSignOutClick}
          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 transition-colors"
        >
          {t('nav.profile.logout')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-700">
          {user.email}
        </span>
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleDropdown}
          className="flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md p-1"
          aria-expanded={isOpen}
          aria-haspopup="true"
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
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Render dropdown usando portal */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {dropdownContent}
          <style jsx global>{`
            @keyframes dropdownFadeIn {
              from {
                opacity: 0;
                transform: scale(0.95) translateY(-10px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
          `}</style>
        </>,
        document.body
      )}
    </>
  );
};

export default ProfileDropdown;
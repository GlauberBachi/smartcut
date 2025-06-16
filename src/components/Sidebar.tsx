import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scissors, LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Sidebar = () => {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="hidden lg:block w-64 bg-[#0099ff] text-white">
      <div className="flex-1 flex flex-col pb-4 overflow-y-auto">
        <nav className="flex-1 px-2 pt-5 space-y-1">
          <Link
            to="/dashboard"
            className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
              location.pathname === '/dashboard'
                ? 'bg-white/20 text-white'
                : 'text-white/90 hover:bg-white/10'
            }`}
          >
            <LayoutDashboard
              className={`mr-3 h-5 w-5 ${
                location.pathname === '/dashboard'
                  ? 'text-white'
                  : 'text-white/90'
              }`}
            />
            {t('sidebar.dashboard')}
          </Link>

          <Link
            to="/cut-optimizer"
            className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
              location.pathname === '/cut-optimizer'
                ? 'bg-white/20 text-white'
                : 'text-white/90 hover:bg-white/10'
            }`}
          >
            <Scissors
              className={`mr-3 h-5 w-5 ${
                location.pathname === '/cut-optimizer'
                  ? 'text-white'
                  : 'text-white/90'
              }`}
            />
            {t('sidebar.cutOptimizer')}
          </Link>

        </nav>
      </div>
    </div>
  );
};

export default Sidebar;
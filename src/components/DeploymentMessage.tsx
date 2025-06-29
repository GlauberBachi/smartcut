import React, { useState } from 'react';
import { X, ExternalLink, Globe } from 'lucide-react';

const DeploymentMessage = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <Globe className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              Your project has been previously deployed to{' '}
              <a 
                href="https://smartcut.app" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center text-green-700 hover:text-green-900 underline font-semibold transition-colors duration-200"
              >
                https://smartcut.app
                <ExternalLink className="ml-1 h-3 w-3" />
              </a>
              {' '}and is owned by your personal Netlify account.
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={() => setIsVisible(false)}
            className="inline-flex rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50 transition-colors duration-200"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeploymentMessage;
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setIsOpen(false);
  };

  const flags = {
    en: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/us.svg",
    pt: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/pt.svg",
    es: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/es.svg",
    it: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/it.svg",
    fr: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/fr.svg",
    de: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/de.svg",
    zh: "https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/cn.svg"
  };

  const languageNames = {
    en: "English",
    pt: "Português",
    es: "Español",
    it: "Italiano",
    fr: "Français",
    de: "Deutsch",
    zh: "中文"
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2 py-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors duration-200"
      >
        <img
          src={flags[i18n.language as keyof typeof flags] || flags.en}
          alt={`${i18n.language} flag`}
          className="w-5 h-5 rounded-sm object-cover"
        />
        <span>{languageNames[i18n.language as keyof typeof languageNames] || languageNames.en}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1">
            {Object.entries(languageNames).map(([code, name]) => (
              <button
                key={code}
                onClick={() => changeLanguage(code)}
                className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
              >
                <img
                  src={flags[code as keyof typeof flags]}
                  alt={`${name} flag`}
                  className="w-5 h-5 rounded-sm object-cover"
                />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
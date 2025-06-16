import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Github, Twitter, Linkedin, Mail, MapPin, Phone } from 'lucide-react';

const Footer = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300 relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.company.title')}</h3>
            <p className="text-sm mb-4">{t('footer.company.description')}</p>
            <div className="flex space-x-4">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.quickLinks.title')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/pricing" className="text-sm hover:text-white transition-colors">
                  {t('footer.quickLinks.pricing')}
                </Link>
              </li>
              <li>
                <Link to="/calculator" className="text-sm hover:text-white transition-colors">
                  {t('footer.quickLinks.calculator')}
                </Link>
              </li>
              <li>
                <Link to="/cut-optimizer" className="text-sm hover:text-white transition-colors">
                  {t('footer.quickLinks.optimizer')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.legal.title')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/privacy" className="text-sm hover:text-white transition-colors">
                  {t('footer.legal.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-sm hover:text-white transition-colors">
                  {t('footer.legal.terms')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">{t('footer.contact.title')}</h3>
            <ul className="space-y-2">
              <li className="flex items-center text-sm">
                <MapPin className="h-4 w-4 mr-2" />
                {t('footer.contact.address')}
              </li>
              <li className="flex items-center text-sm">
                <Phone className="h-4 w-4 mr-2" />
                {t('footer.contact.phone')}
              </li>
              <li className="flex items-center text-sm">
                <Mail className="h-4 w-4 mr-2" />
                {t('footer.contact.email')}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <div className="text-center text-sm">
            <p>© {currentYear} SmartCut. {t('footer.rights')}</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
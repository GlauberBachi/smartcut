import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  const renderWithProviders = () => {
    return render(
      <BrowserRouter>
        <I18nextProvider i18n={i18n}>
          <Sidebar />
        </I18nextProvider>
      </BrowserRouter>
    );
  };

  it('renders sidebar items with correct translations', () => {
    renderWithProviders();

    // Check if items are rendered with translations
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Cut Optimizer')).toBeInTheDocument();
    expect(screen.getByText('BMI Calculator')).toBeInTheDocument();
  });

  it('updates translations when language changes', async () => {
    renderWithProviders();
    
    // Change language to Portuguese
    await i18n.changeLanguage('pt');
    
    // Check if items are rendered with Portuguese translations
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Otimização de Corte')).toBeInTheDocument();
    expect(screen.getByText('Calculadora IMC')).toBeInTheDocument();
  });
});
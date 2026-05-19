import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DontSeeYourComputerSheet from '../DontSeeYourComputerSheet';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

// Provide a minimal t() that resolves dot-separated keys against the en.json
// translations so the component renders real strings rather than key paths.
jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const en = require('../../i18n/en.json') as Record<string, unknown>;
  function resolve(obj: Record<string, unknown>, key: string, fallback?: string): string {
    const parts = key.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return fallback ?? key;
      cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === 'string' ? cur : (fallback ?? key);
  }
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => resolve(en, key, fallback),
      i18n: { language: 'en', changeLanguage: jest.fn() },
    }),
  };
});

describe('DontSeeYourComputerSheet', () => {
  beforeEach(() => mockGoBack.mockClear());

  it('renders all three guidance cards', () => {
    const { getByText } = render(<DontSeeYourComputerSheet />);
    expect(getByText(/Petrel 1/)).toBeTruthy();
    expect(getByText(/Another Shearwater/)).toBeTruthy();
    expect(getByText(/non-Shearwater/i)).toBeTruthy();
  });

  it('dismisses on close button press', () => {
    const { getByTestId } = render(<DontSeeYourComputerSheet />);
    fireEvent.press(getByTestId('close-button'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});

import React from 'react';
import { render } from '@testing-library/react-native';
import { Badge, VerificationBadge } from '../Badge';

describe('Badge', () => {
  it('renders the provided label', () => {
    const { getByText } = render(<Badge label="New" />);
    expect(getByText('New')).toBeTruthy();
  });

  it('supports tone and outline variants', () => {
    const { getByText } = render(<Badge label="Warn" tone="warning" outline />);
    expect(getByText('Warn')).toBeTruthy();
  });
});

describe('VerificationBadge', () => {
  it('renders Verified for verified tier', () => {
    const { getByText } = render(<VerificationBadge tier="verified" />);
    expect(getByText('Verified')).toBeTruthy();
  });

  it('renders Experimental for experimental tier', () => {
    const { getByText } = render(<VerificationBadge tier="experimental" />);
    expect(getByText('Experimental')).toBeTruthy();
  });

  it('renders Compatible for compatible tier', () => {
    const { getByText } = render(<VerificationBadge tier="compatible" />);
    expect(getByText('Compatible')).toBeTruthy();
  });
});

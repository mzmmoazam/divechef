import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders icon and title', () => {
    const { getByText } = render(
      <EmptyState icon="🌊" title="No dives yet" />
    );
    expect(getByText('🌊')).toBeTruthy();
    expect(getByText('No dives yet')).toBeTruthy();
  });

  it('renders the optional body and CTA, and fires onCtaPress', () => {
    const onCta = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="🌊"
        title="No dives"
        body="Sync your dive computer to get started"
        ctaLabel="Sync now"
        onCtaPress={onCta}
      />
    );
    expect(getByText('Sync your dive computer to get started')).toBeTruthy();
    fireEvent.press(getByText('Sync now'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });
});

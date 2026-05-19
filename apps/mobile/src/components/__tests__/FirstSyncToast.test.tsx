import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FirstSyncToast } from '../FirstSyncToast';

describe('FirstSyncToast', () => {
  it('returns null for verified tier', () => {
    const { queryByTestId } = render(
      <FirstSyncToast tier="verified" onDismiss={jest.fn()} />,
    );
    expect(queryByTestId('first-sync-toast')).toBeNull();
  });

  it('shows success message for compatible tier with no failedStage', () => {
    const { getByTestId, getByText } = render(
      <FirstSyncToast tier="compatible" onDismiss={jest.fn()} />,
    );
    expect(getByTestId('first-sync-toast')).toBeTruthy();
    expect(getByText('First sync looks good — let us know how it went.')).toBeTruthy();
  });

  it('shows failure message for compatible tier when failedStage is set', () => {
    const { getByText } = render(
      <FirstSyncToast tier="compatible" failedStage="parsing" onDismiss={jest.fn()} />,
    );
    expect(
      getByText(
        'First sync hit a snag at "parsing". Could you share the details so we can improve support?',
      ),
    ).toBeTruthy();
  });

  it('calls onDismiss when OK is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <FirstSyncToast tier="compatible" onDismiss={onDismiss} />,
    );
    fireEvent.press(getByText('OK'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows success message for experimental tier with no failedStage', () => {
    const { getByTestId, getByText } = render(
      <FirstSyncToast tier="experimental" onDismiss={jest.fn()} />,
    );
    expect(getByTestId('first-sync-toast')).toBeTruthy();
    expect(getByText('First sync looks good — let us know how it went.')).toBeTruthy();
  });

  it('shows failure message for experimental tier when failedStage is set', () => {
    const { getByText } = render(
      <FirstSyncToast
        tier="experimental"
        failedStage="upload"
        onDismiss={jest.fn()}
      />,
    );
    expect(
      getByText(
        'First sync hit a snag at "upload". Could you share the details so we can improve support?',
      ),
    ).toBeTruthy();
  });
});

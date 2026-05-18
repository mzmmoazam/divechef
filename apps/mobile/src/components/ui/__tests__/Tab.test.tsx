import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Tab } from '../Tab';

describe('Tab', () => {
  it('renders icon and label', () => {
    const { getByText } = render(
      <Tab icon="🏠" label="Home" active onPress={() => {}} />
    );
    expect(getByText('🏠')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Tab icon="📈" label="Trends" active={false} onPress={onPress} />
    );
    fireEvent.press(getByText('Trends'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

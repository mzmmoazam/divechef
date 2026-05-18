import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ListItem } from '../ListItem';

describe('ListItem', () => {
  it('renders title and subtitle', () => {
    const { getByText } = render(
      <ListItem title="Peregrine" subtitle="SN 1234" />
    );
    expect(getByText('Peregrine')).toBeTruthy();
    expect(getByText('SN 1234')).toBeTruthy();
  });

  it('renders rightValue', () => {
    const { getByText } = render(<ListItem title="Score" rightValue="84" />);
    expect(getByText('84')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<ListItem title="Tap me" onPress={onPress} />);
    fireEvent.press(getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

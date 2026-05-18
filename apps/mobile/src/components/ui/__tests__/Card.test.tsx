import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Card } from '../Card';

describe('Card', () => {
  it('renders the flat variant with children', () => {
    const { getByText } = render(
      <Card>
        <Text>Inside</Text>
      </Card>
    );
    expect(getByText('Inside')).toBeTruthy();
  });

  it('renders the hero variant with children', () => {
    const { getByText } = render(
      <Card hero>
        <Text>Hero</Text>
      </Card>
    );
    expect(getByText('Hero')).toBeTruthy();
  });
});

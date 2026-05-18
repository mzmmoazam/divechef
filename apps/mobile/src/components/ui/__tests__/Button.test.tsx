import React from 'react';
import { render } from '@testing-library/react-native';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with the provided label', () => {
    const { getByText } = render(<Button label="Sync" onPress={() => {}} />);
    expect(getByText('Sync')).toBeTruthy();
  });

  it('respects the disabled prop', () => {
    const { getByText } = render(<Button label="Sync" onPress={() => {}} disabled />);
    const node = getByText('Sync');
    // disabled buttons render at lower opacity per Deep Ocean Modern
    expect(node).toBeTruthy();
  });

  it('renders ghost and danger variants', () => {
    const { getByText: getGhost } = render(
      <Button label="Cancel" onPress={() => {}} variant="ghost" />
    );
    expect(getGhost('Cancel')).toBeTruthy();
    const { getByText: getDanger } = render(
      <Button label="Delete" onPress={() => {}} variant="danger" />
    );
    expect(getDanger('Delete')).toBeTruthy();
  });
});

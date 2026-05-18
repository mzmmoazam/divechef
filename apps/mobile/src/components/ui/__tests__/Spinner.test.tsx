import React from 'react';
import { render } from '@testing-library/react-native';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders without throwing at default size', () => {
    const tree = render(<Spinner />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('renders the small size variant', () => {
    const tree = render(<Spinner size="small" />);
    expect(tree.toJSON()).toBeTruthy();
  });
});

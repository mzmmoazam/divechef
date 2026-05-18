import React from 'react';
import { render } from '@testing-library/react-native';
import { Input } from '../Input';

describe('Input', () => {
  it('renders without label', () => {
    const { getByPlaceholderText } = render(
      <Input placeholder="email@example.com" />
    );
    expect(getByPlaceholderText('email@example.com')).toBeTruthy();
  });

  it('renders the optional label', () => {
    const { getByText } = render(<Input label="EMAIL" />);
    expect(getByText('EMAIL')).toBeTruthy();
  });

  it('renders an error message when provided', () => {
    const { getByText } = render(<Input label="Email" error="Required" />);
    expect(getByText('Required')).toBeTruthy();
  });
});

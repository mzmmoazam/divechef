import React from 'react';
import { render } from '@testing-library/react-native';
import { ScoreNumber } from '../ScoreNumber';

describe('ScoreNumber', () => {
  it('renders the numeric value as text', () => {
    const { getByText } = render(<ScoreNumber value={84} />);
    expect(getByText('84')).toBeTruthy();
  });

  it('renders all three color bands without throwing', () => {
    const { getByText: high } = render(<ScoreNumber value={90} />);
    expect(high('90')).toBeTruthy();
    const { getByText: mid } = render(<ScoreNumber value={50} />);
    expect(mid('50')).toBeTruthy();
    const { getByText: low } = render(<ScoreNumber value={10} />);
    expect(low('10')).toBeTruthy();
  });
});

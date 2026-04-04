import { render, screen } from '@testing-library/react';

import Progress from '@/components/Progress';

describe('Progress', () => {
  it('renders percentage and stage label', () => {
    render(<Progress progress={45} />);

    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('Tracing light paths')).toBeTruthy();
  });

  it('shows complete state at 100%', () => {
    render(<Progress progress={100} />);

    expect(screen.getByText('Complete!')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});

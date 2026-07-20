import { render, screen } from '@testing-library/react';
import Home from '../../app/page';

describe('Home Page', () => {
  it('renders without crashing', () => {
    render(<Home />);
    expect(screen.getByText(/Black Owned/i)).toBeInTheDocument();
  });

  it('displays the main heading', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });
});

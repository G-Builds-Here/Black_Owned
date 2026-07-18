import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBanner } from './NotificationBanner';

describe('NotificationBanner', () => {
  it('renders message', () => {
    render(<NotificationBanner message="Test notification" />);

    expect(screen.getByText('Test notification')).toBeInTheDocument();
  });

  it('defaults to info type', () => {
    const { container } = render(<NotificationBanner message="Test" />);

    expect(container.querySelector('.info')).toBeInTheDocument();
  });

  it('applies correct type class', () => {
    const { container } = render(<NotificationBanner message="Test" type="success" />);

    expect(container.querySelector('.success')).toBeInTheDocument();
  });

  it('has role alert', () => {
    render(<NotificationBanner message="Test" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders close button when dismissible and onClose provided', () => {
    const handleClose = vi.fn();
    render(<NotificationBanner message="Test" dismissible={true} onClose={handleClose} />);

    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('does not render close button when not dismissible', () => {
    render(<NotificationBanner message="Test" dismissible={false} onClose={() => {}} />);

    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('does not render close button when no onClose provided', () => {
    render(<NotificationBanner message="Test" dismissible={true} />);

    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<NotificationBanner message="Test" dismissible={true} onClose={handleClose} />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(handleClose).toHaveBeenCalled();
  });
});

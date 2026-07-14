import { render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('renders message content', () => {
    render(<ChatBubble message="Hello" direction="sent" />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies correct direction class', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector('.sent')).toBeInTheDocument();
  });

  it('applies received class for received direction', () => {
    const { container } = render(<ChatBubble message="Hello" direction="received" />);

    expect(container.querySelector('.received')).toBeInTheDocument();
  });

  it('renders sender name when provided', () => {
    render(<ChatBubble message="Hello" direction="sent" senderName="John" />);

    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('does not render sender name when not provided', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector('.sender-name')).not.toBeInTheDocument();
  });

  it('renders timestamp when provided', () => {
    render(<ChatBubble message="Hello" direction="sent" timestamp="10:30 AM" />);

    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  it('does not render timestamp when not provided', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector('.timestamp')).not.toBeInTheDocument();
  });

  it('has correct CSS classes', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector('.chat-bubble')).toBeInTheDocument();
    expect(container.querySelector('.bubble-content')).toBeInTheDocument();
  });
});

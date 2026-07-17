import { render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';
import styles from './ChatBubble.module.css';

describe('ChatBubble', () => {
  it('renders message content', () => {
    render(<ChatBubble message="Hello" direction="sent" />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies correct direction class', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector(`.${styles.chatBubble}.${styles.sent}`)).toBeInTheDocument();
  });

  it('applies received class for received direction', () => {
    const { container } = render(<ChatBubble message="Hello" direction="received" />);

    expect(container.querySelector(`.${styles.chatBubble}.${styles.received}`)).toBeInTheDocument();
  });

  it('renders sender name when provided', () => {
    render(<ChatBubble message="Hello" direction="sent" senderName="John" />);

    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('does not render sender name when not provided', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector(`.${styles.senderName}`)).not.toBeInTheDocument();
  });

  it('renders timestamp when provided', () => {
    render(<ChatBubble message="Hello" direction="sent" timestamp="10:30 AM" />);

    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  it('does not render timestamp when not provided', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector(`.${styles.timestamp}`)).not.toBeInTheDocument();
  });

  it('has correct CSS classes', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);

    expect(container.querySelector(`.${styles.chatBubble}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.bubbleContent}`)).toBeInTheDocument();
  });

  it('applies cultural indigo styling for sent messages', () => {
    const { container } = render(<ChatBubble message="Hello" direction="sent" />);
    const bubble = container.querySelector(`.${styles.sent}`);

    expect(bubble).toBeInTheDocument();
  });

  it('applies cultural earth tone styling for received messages', () => {
    const { container } = render(<ChatBubble message="Hello" direction="received" />);
    const bubble = container.querySelector(`.${styles.received}`);

    expect(bubble).toBeInTheDocument();
  });
});

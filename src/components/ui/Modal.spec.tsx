'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

// Modal renders through createPortal(document.body), so structural queries
// target document.body rather than the render container.
const getDialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
const getBackdrop = () => getDialog().querySelector('.absolute.inset-0') as HTMLElement;
const getPanel = () => getDialog().querySelector('.bg-white.rounded-2xl') as HTMLElement;

describe('Modal', () => {
  it('does not render when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={jest.fn()} title="Test Modal">Content</Modal>);
    expect(screen.queryByText(/test modal/i)).not.toBeInTheDocument();
    expect(getDialog()).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test Modal">Content</Modal>);
    expect(screen.getByText(/test modal/i)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test Modal">Modal Content</Modal>);
    expect(screen.getByText(/modal content/i)).toBeInTheDocument();
  });

  it('renders title as an accessible heading', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Modal Title">Content</Modal>);
    const heading = screen.getByRole('heading', { name: 'Modal Title' });
    expect(heading).toHaveAttribute('id', 'modal-title');
    expect(getDialog()).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = jest.fn();
    render(<Modal isOpen={true} onClose={handleClose} title="Test">Content</Modal>);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking backdrop', () => {
    const handleClose = jest.fn();
    render(<Modal isOpen={true} onClose={handleClose} title="Test">Content</Modal>);
    fireEvent.click(getBackdrop());
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking backdrop with closeOnBackdrop false', () => {
    const handleClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test" closeOnBackdrop={false}>
        Content
      </Modal>
    );
    fireEvent.click(getBackdrop());
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('has overlay with correct styles', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const backdrop = getBackdrop();
    expect(backdrop).toHaveClass('absolute');
    expect(backdrop).toHaveClass('inset-0');
    expect(backdrop).toHaveClass('bg-black/50');
    expect(backdrop).toHaveClass('backdrop-blur-sm');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });

  it('has modal container with correct styles', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const dialog = getDialog();
    expect(dialog).toHaveClass('fixed');
    expect(dialog).toHaveClass('inset-0');
    expect(dialog).toHaveClass('flex');
    expect(dialog).toHaveClass('items-center');
    expect(dialog).toHaveClass('justify-center');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has modal content with correct styles', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const panel = getPanel();
    expect(panel).toHaveClass('bg-white');
    expect(panel).toHaveClass('rounded-2xl');
    expect(panel).toHaveClass('shadow-xl');
  });

  it('applies default size (md)', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-md');
  });

  it('applies small size', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="sm">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-sm');
  });

  it('applies medium size', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="md">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-md');
  });

  it('applies large size', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="lg">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-lg');
  });

  it('applies extra large size', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="xl">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-xl');
  });

  it('applies full width size', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="full">Content</Modal>);
    expect(getPanel()).toHaveClass('max-w-[95vw]');
  });

  it('has close button with aria-label', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(screen.getByLabelText(/close/i)).toBeInTheDocument();
  });

  it('has header section', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const header = screen.getByRole('heading', { name: 'Test' }).parentElement as HTMLElement;
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('flex');
    expect(header).toHaveClass('justify-between');
    expect(header).toHaveClass('border-b');
  });

  it('has body section', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    // The body div ("px-6 py-4 overflow-y-auto") directly contains the children text.
    const body = screen.getByText('Content');
    expect(body).toBeInTheDocument();
    expect(body).toHaveClass('px-6');
    expect(body).toHaveClass('py-4');
    expect(body).toHaveClass('overflow-y-auto');
  });

  it('has footer section when footer is provided', () => {
    render(
      <Modal isOpen={true} onClose={jest.fn()} title="Test" footer={<div>Footer</div>}>
        Content
      </Modal>
    );
    const footer = document.body.querySelector('.bg-neutral-50') as HTMLElement;
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveClass('border-t');
  });

  it('does not have footer section when footer is not provided', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(document.body.querySelector('.bg-neutral-50')).not.toBeInTheDocument();
  });

  it('has transition animation', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const panel = getPanel();
    expect(panel).toHaveClass('transition-all');
    expect(panel).toHaveClass('transform');
  });

  it('has z-index for stacking', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(getDialog()).toHaveClass('z-50');
  });

  it('has overflow hidden on body', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(getPanel()).toHaveClass('overflow-hidden');
  });
});

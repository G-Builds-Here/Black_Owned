'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('does not render when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={jest.fn()} title="Test Modal">Content</Modal>);
    expect(screen.queryByText(/test modal/i)).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test Modal">Content</Modal>);
    expect(screen.getByText(/test modal/i)).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test Modal">Modal Content</Modal>);
    expect(screen.getByText(/modal content/i)).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Modal Title">Content</Modal>);
    expect(screen.getByText(/modal title/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking backdrop with closeOnBackdrop false', () => {
    const handleClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test" closeOnBackdrop={false}>
        Content
      </Modal>
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('has overlay with correct styles', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const overlay = container.querySelector('[data-testid="modal-backdrop"]');
    expect(overlay).toHaveClass('fixed');
    expect(overlay).toHaveClass('inset-0');
    expect(overlay).toHaveClass('bg-black');
    expect(overlay).toHaveClass('bg-opacity-50');
  });

  it('has modal container with correct styles', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const modal = container.querySelector('[data-testid="modal-container"]');
    expect(modal).toHaveClass('fixed');
    expect(modal).toHaveClass('inset-0');
    expect(modal).toHaveClass('flex');
    expect(modal).toHaveClass('items-center');
    expect(modal).toHaveClass('justify-center');
  });

  it('has modal content with correct styles', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('bg-white');
    expect(modalContent).toHaveClass('rounded-lg');
    expect(modalContent).toHaveClass('shadow-xl');
  });

  it('applies default size (md)', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-md');
  });

  it('applies small size', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="sm">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-sm');
  });

  it('applies medium size', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="md">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-md');
  });

  it('applies large size', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="lg">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-lg');
  });

  it('applies extra large size', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="xl">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-xl');
  });

  it('applies full width size', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test" size="full">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('max-w-full');
  });

  it('has close button with aria-label', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    expect(screen.getByLabelText(/close/i)).toBeInTheDocument();
  });

  it('has header section', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const header = container.querySelector('[data-testid="modal-header"]');
    expect(header).toBeInTheDocument();
  });

  it('has body section', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const body = container.querySelector('[data-testid="modal-body"]');
    expect(body).toBeInTheDocument();
  });

  it('has footer section when footer is provided', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={jest.fn()} title="Test" footer={<div>Footer</div>}>
        Content
      </Modal>
    );
    const footer = container.querySelector('[data-testid="modal-footer"]');
    expect(footer).toBeInTheDocument();
  });

  it('does not have footer section when footer is not provided', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const footer = container.querySelector('[data-testid="modal-footer"]');
    expect(footer).not.toBeInTheDocument();
  });

  it('has transition animation', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('transition-all');
    expect(modalContent).toHaveClass('duration-300');
  });

  it('has z-index for stacking', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const overlay = container.querySelector('[data-testid="modal-backdrop"]');
    expect(overlay).toHaveClass('z-40');
    const modal = container.querySelector('[data-testid="modal-container"]');
    expect(modal).toHaveClass('z-50');
  });

  it('has overflow hidden on body', () => {
    const { container } = render(<Modal isOpen={true} onClose={jest.fn()} title="Test">Content</Modal>);
    const modalContent = container.querySelector('[data-testid="modal-content"]');
    expect(modalContent).toHaveClass('overflow-hidden');
  });
});

'use client';

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs, TabPanel, TabContent } from './Tabs';

describe('Tabs', () => {
  const mockTabs = [
    { key: 'tab1', label: 'Tab 1' },
    { key: 'tab2', label: 'Tab 2' },
    { key: 'tab3', label: 'Tab 3' },
  ];

  it('renders all tab labels', () => {
    render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    expect(screen.getByRole('tab', { name: /tab 1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /tab 2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /tab 3/i })).toBeInTheDocument();
  });

  it('calls onSelectionChange when tab is clicked', () => {
    const handleChange = jest.fn();
    render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={handleChange} />
    );
    fireEvent.click(screen.getByRole('tab', { name: /tab 2/i }));
    expect(handleChange).toHaveBeenCalledWith('tab2');
  });

  it('has role="tablist" for tab container', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const tabList = container.querySelector('[role="tablist"]');
    expect(tabList).toBeInTheDocument();
  });

  it('has border bottom for underlined variant', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} variant="underlined" />
    );
    const tabList = container.querySelector('[role="tablist"]');
    expect(tabList).toHaveClass('border-b');
    expect(tabList).toHaveClass('border-neutral-200');
  });

  it('has padding for tab buttons', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('px-4');
    expect(tabButton).toHaveClass('py-3');
  });

  it('has font-medium for tab buttons', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('font-medium');
  });

  it('has transition styles for tab buttons', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('transition-all');
  });

  it('selected tab has correct color', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const selectedTab = container.querySelector('button[role="tab"][aria-selected="true"]');
    expect(selectedTab).toHaveClass('text-heritage-ochre');
  });

  it('unselected tabs have gray color', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const unselectedTab = container.querySelector('button[role="tab"][aria-selected="false"]');
    expect(unselectedTab).toHaveClass('text-neutral-500');
  });

  it('selected tab has bottom border', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const selectedTab = container.querySelector('button[role="tab"][aria-selected="true"]');
    expect(selectedTab).toHaveClass('border-b-2');
  });

  it('unselected tabs have transparent border', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const unselectedTab = container.querySelector('button[role="tab"][aria-selected="false"]');
    expect(unselectedTab).toHaveClass('border-transparent');
  });

  it('has cursor pointer for enabled tabs', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('cursor-pointer');
  });

  it('renders TabContent correctly', () => {
    render(
      <TabContent>
        <div data-testid="content">Tab Content</div>
      </TabContent>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('TabPanel renders children when value matches', () => {
    render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()}>
        <TabPanel value="tab1">
          <div data-testid="panel-content">Panel Content</div>
        </TabPanel>
      </Tabs>
    );
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
  });

  it('TabPanel does not render when value does not match', () => {
    render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()}>
        <TabPanel value="tab2">
          <div data-testid="panel-content">Panel Content</div>
        </TabPanel>
      </Tabs>
    );
    expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
  });

  it('TabPanel has role="tabpanel"', () => {
    render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()}>
        <TabPanel value="tab1">
          <div>Content</div>
        </TabPanel>
      </Tabs>
    );
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('handles tabs with icons', () => {
    const tabsWithIcons = [
      { key: 'tab1', label: 'Tab 1', icon: <span data-testid="icon1">I1</span> },
      { key: 'tab2', label: 'Tab 2', icon: <span data-testid="icon2">I2</span> },
    ];
    render(<Tabs tabs={tabsWithIcons} selectedKey="tab1" onSelectionChange={jest.fn()} />);
    expect(screen.getByTestId('icon1')).toBeInTheDocument();
    expect(screen.getByTestId('icon2')).toBeInTheDocument();
  });

  it('lays out tab labels with a flex span', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    // The redesign removed the old gap-8 tab spacing; each tab's label
    // (and optional icon) sits in a flex span instead.
    const tabButton = container.querySelector('button[role="tab"]');
    const labelSpan = tabButton.querySelector('span');
    expect(labelSpan).toHaveClass('flex');
    expect(labelSpan).toHaveClass('items-center');
    expect(labelSpan).toHaveClass('gap-2');
  });

  it('applies pills variant styles', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} variant="pills" />
    );
    const tabList = container.querySelector('[role="tablist"]');
    expect(tabList).toHaveClass('bg-neutral-100');
    expect(tabList).toHaveClass('rounded-lg');
  });

  it('applies segmented variant styles', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} variant="segmented" />
    );
    const tabList = container.querySelector('[role="tablist"]');
    expect(tabList).toHaveClass('bg-neutral-100');
    expect(tabList).toHaveClass('rounded-lg');
  });

  it('disabled tabs cannot be selected', () => {
    const tabsWithDisabled = [
      { key: 'tab1', label: 'Tab 1' },
      { key: 'tab2', label: 'Tab 2', disabled: true },
    ];
    const handleChange = jest.fn();
    render(
      <Tabs tabs={tabsWithDisabled} selectedKey="tab1" onSelectionChange={handleChange} />
    );
    fireEvent.click(screen.getByRole('tab', { name: /tab 2/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('disabled tabs have disabled attribute', () => {
    const tabsWithDisabled = [
      { key: 'tab1', label: 'Tab 1' },
      { key: 'tab2', label: 'Tab 2', disabled: true },
    ];
    render(
      <Tabs tabs={tabsWithDisabled} selectedKey="tab1" onSelectionChange={jest.fn()} />
    );
    expect(screen.getByRole('tab', { name: /tab 2/i })).toBeDisabled();
  });

  it('applies small size', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} size="sm" />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('text-sm');
  });

  it('applies large size', () => {
    const { container } = render(
      <Tabs tabs={mockTabs} selectedKey="tab1" onSelectionChange={jest.fn()} size="lg" />
    );
    const tabButton = container.querySelector('button[role="tab"]');
    expect(tabButton).toHaveClass('text-lg');
  });
});

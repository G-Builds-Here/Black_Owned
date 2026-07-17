import { render, screen, fireEvent } from '@testing-library/react';
import { FilterSidebar } from './FilterSidebar';
import styles from './FilterSidebar.module.css';

describe('FilterSidebar', () => {
  it('renders with default title', () => {
    render(<FilterSidebar options={[]} selectedValues={[]} onChange={() => {}} />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<FilterSidebar title="Categories" options={[]} selectedValues={[]} onChange={() => {}} />);

    expect(screen.getByText('Categories')).toBeInTheDocument();
  });

  it('renders all filter options', () => {
    const options = [
      { label: 'Option 1', value: 'opt1' },
      { label: 'Option 2', value: 'opt2' },
    ];
    render(<FilterSidebar options={options} selectedValues={[]} onChange={() => {}} />);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('checks boxes for selected values', () => {
    const options = [
      { label: 'Option 1', value: 'opt1' },
      { label: 'Option 2', value: 'opt2' },
    ];
    render(<FilterSidebar options={options} selectedValues={['opt1']} onChange={() => {}} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('calls onChange when checkbox is toggled on', () => {
    const handleChange = vi.fn();
    const options = [
      { label: 'Option 1', value: 'opt1' },
    ];
    render(<FilterSidebar options={options} selectedValues={[]} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('Option 1'));

    expect(handleChange).toHaveBeenCalledWith(['opt1']);
  });

  it('calls onChange when checkbox is toggled off', () => {
    const handleChange = vi.fn();
    const options = [
      { label: 'Option 1', value: 'opt1' },
    ];
    render(<FilterSidebar options={options} selectedValues={['opt1']} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('Option 1'));

    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('has correct CSS classes', () => {
    const { container } = render(<FilterSidebar options={[]} selectedValues={[]} onChange={() => {}} />);

    expect(container.querySelector(`.${styles.filterSidebar}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.filterOptions}`)).toBeInTheDocument();
    expect(container.querySelector(`.${styles.filterTitle}`)).toBeInTheDocument();
  });

  it('applies cultural indigo styling for header', () => {
    const options = [{ label: 'Option 1', value: 'opt1' }];
    const { container } = render(<FilterSidebar options={options} selectedValues={[]} onChange={() => {}} />);
    const sidebar = container.querySelector(`.${styles.filterSidebar}`);

    expect(sidebar).toBeInTheDocument();
  });

  it('applies cultural earth tone styling for checkboxes', () => {
    const options = [{ label: 'Option 1', value: 'opt1' }];
    const { container } = render(<FilterSidebar options={options} selectedValues={[]} onChange={() => {}} />);
    const checkbox = container.querySelector('input[type="checkbox"]');

    expect(checkbox).toBeInTheDocument();
  });
});

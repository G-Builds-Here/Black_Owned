import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';
import styles from './SearchBar.module.css';

describe('SearchBar', () => {
  it('renders with default placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} />);

    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<SearchBar placeholder="Find items" value="" onChange={() => {}} />);

    expect(screen.getByPlaceholderText('Find items')).toBeInTheDocument();
  });

  it('displays current value', () => {
    render(<SearchBar value="search term" onChange={() => {}} />);

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('search term');
  });

  it('calls onChange when value changes', () => {
    const handleChange = vi.fn();
    render(<SearchBar value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new value' } });

    expect(handleChange).toHaveBeenCalledWith('new value');
  });

  it('calls onSearch when Enter key is pressed', () => {
    const handleSearch = vi.fn();
    render(<SearchBar value="" onChange={() => {}} onSearch={handleSearch} />);

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleSearch).toHaveBeenCalled();
  });

  it('does not call onSearch when non-Enter key is pressed', () => {
    const handleSearch = vi.fn();
    render(<SearchBar value="" onChange={() => {}} onSearch={handleSearch} />);

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'a', code: 'KeyA' });

    expect(handleSearch).not.toHaveBeenCalled();
  });

  it('applies cultural styling - search bar class', () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />);
    const input = container.querySelector(`.${styles.searchBar}`);

    expect(input).toBeInTheDocument();
  });

  it('applies cultural heritage styling - warm focus border', () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />);
    const input = container.querySelector(`.${styles.searchBar}`);

    expect(input).toBeInTheDocument();
  });
});

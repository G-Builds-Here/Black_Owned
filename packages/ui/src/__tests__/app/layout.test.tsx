import { metadata } from '../../app/layout';
import RootLayout from '../../app/layout';

describe('Root Layout', () => {
  it('has correct metadata', () => {
    expect(metadata.title).toBe('Black Owned UI');
    expect(metadata.description).toBe('UI components for Black Owned');
  });

  it('metadata is properly typed', () => {
    expect(metadata).toBeDefined();
    expect(typeof metadata.title).toBe('string');
    expect(typeof metadata.description).toBe('string');
  });

  it('RootLayout is a function', () => {
    expect(typeof RootLayout).toBe('function');
  });

  it('RootLayout returns a React element', () => {
    const result = RootLayout({ children: <div>Test</div> });
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });
});

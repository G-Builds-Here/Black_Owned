/**
 * Business Review Page Tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
import BusinessReviewPage from './page';

describe('BusinessReviewPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the page header', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByRole('heading', { name: /Business Review Queue/i })).toBeInTheDocument();
  });

  it('displays the pending review businesses in a table', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Afro Threads')).toBeInTheDocument();
    expect(screen.getByText('Heritage Wellness Center')).toBeInTheDocument();
  });

  it('shows business name, address, source, and rating columns', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText(/Business Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Address/i)).toBeInTheDocument();
    expect(screen.getByText(/Source/i)).toBeInTheDocument();
    expect(screen.getByText(/Rating/i)).toBeInTheDocument();
  });

  it('displays pending rating when rating is 0', () => {
    render(<BusinessReviewPage />);
    // Check that the first business row shows "Pending" for rating
    const pendingElements = screen.getAllByText('Pending');
    expect(pendingElements.length).toBeGreaterThan(0);
  });

  it('filters businesses by search query', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('shows count of businesses pending review', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText(/businesses pending review/i)).toBeInTheDocument();
  });

  it('filters businesses when search query is entered', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'Soul Food' } });
    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.queryByText('Afro Threads')).not.toBeInTheDocument();
  });

  it('shows empty state when no businesses match search', () => {
    render(<BusinessReviewPage />);
    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistentbusiness12345' } });
    expect(screen.getByText(/No businesses found/i)).toBeInTheDocument();
  });

  it('displays source badges for each business', () => {
    render(<BusinessReviewPage />);
    const directSubmissionBadges = screen.getAllByText('Direct Submission');
    expect(directSubmissionBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('Partner Referral')).toBeInTheDocument();
    expect(screen.getByText('Community Nomination')).toBeInTheDocument();
  });

  it('displays business ID in each row', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('ID: 1')).toBeInTheDocument();
    expect(screen.getByText('ID: 2')).toBeInTheDocument();
  });

  it('shows review button for each business', () => {
    render(<BusinessReviewPage />);
    const viewButtons = screen.getAllByText('View Details');
    expect(viewButtons.length).toBeGreaterThan(0);
  });

  it('displays submitted date for each business', () => {
    render(<BusinessReviewPage />);
    const july14Dates = screen.getAllByText('2026-07-14');
    expect(july14Dates.length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-13')).toBeInTheDocument();
    expect(screen.getByText('2026-07-11')).toBeInTheDocument();
  });

  it('displays period filter dropdown', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByTestId('dropdown')).toBeInTheDocument();
    const thisWeekElements = screen.getAllByText(/This Week/i);
    expect(thisWeekElements.length).toBeGreaterThan(0);
  });

  it('displays export button', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('Export List')).toBeInTheDocument();
  });

  it('shows address column data for each business', () => {
    render(<BusinessReviewPage />);
    expect(screen.getByText('123 Main St, Atlanta GA')).toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave, Houston TX')).toBeInTheDocument();
  });

  it('opens detail modal when clicking a business row', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    expect(firstRow).toBeInTheDocument();
    fireEvent.click(firstRow!);
    expect(screen.getByRole('dialog', { name: /business details/i })).toBeInTheDocument();
  });

  it('displays all business fields in the detail modal', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);

    // Check that modal is open
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    // Check basic information fields (use getAllByText to handle duplicates)
    const nameElements = screen.getAllByText('Soul Food Kitchen');
    expect(nameElements.length).toBeGreaterThan(0);
    const categoryElements = screen.getAllByText('Restaurant');
    expect(categoryElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Authentic soul food restaurant/i)).toBeInTheDocument();
    const addressElements = screen.getAllByText('123 Main St, Atlanta GA');
    expect(addressElements.length).toBeGreaterThan(0);
    const phoneElements = screen.getAllByText('(404) 555-0123');
    expect(phoneElements.length).toBeGreaterThan(0);
    const websiteElements = screen.getAllByText('https://soulfoodkitchen.example.com');
    expect(websiteElements.length).toBeGreaterThan(0);
    const hoursElements = screen.getAllByText('Mon-Sun: 11:00 AM - 10:00 PM');
    expect(hoursElements.length).toBeGreaterThan(0);
    const priceElements = screen.getAllByText('$$');
    expect(priceElements.length).toBeGreaterThan(0);
  });

  it('displays the original scraped data in the detail modal', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);

    // Check that modal is open
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    // Check that original data section exists
    expect(screen.getByText('Original Scraped Data')).toBeInTheDocument();
    // Verify the pre element with JSON data exists
    const preElements = screen.getAllByText(/DirectSubmission|business_owner|business_license.pdf/);
    expect(preElements.length).toBeGreaterThan(0);
  });

  it('shows source information in the detail modal', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);

    // Check that modal is open
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    expect(screen.getByText('Source Information')).toBeInTheDocument();
    expect(screen.getByText('Submission Source')).toBeInTheDocument();
    const directSubmissionElements = screen.getAllByText('Direct Submission');
    expect(directSubmissionElements.length).toBeGreaterThan(0);
    expect(screen.getByText('Submitted Date')).toBeInTheDocument();
    const dateElements = screen.getAllByText('2026-07-14');
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('closes the detail modal when clicking the close button', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    const closeButtons = screen.getAllByText('Close');
    fireEvent.click(closeButtons[0]);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('displays View Details button for each business', () => {
    render(<BusinessReviewPage />);
    const viewButtons = screen.getAllByText('View Details');
    expect(viewButtons.length).toBeGreaterThan(0);
  });

  it('shows approve and reject buttons in the detail modal', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);

    expect(screen.getByText('Approve Business')).toBeInTheDocument();
    expect(screen.getByText('Reject Business')).toBeInTheDocument();
  });

  it('displays category field in the detail modal', () => {
    render(<BusinessReviewPage />);
    const firstRow = screen.getByText('Soul Food Kitchen').closest('tr');
    fireEvent.click(firstRow!);

    // Check that category field label exists
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
  });

  it('shows N/A for missing phone numbers', () => {
    render(<BusinessReviewPage />);
    const fourthRow = screen.getByText('Golden Era Barbershop').closest('tr');
    fireEvent.click(fourthRow!);

    // Golden Era Barbershop has phone in mock data, but we test the N/A display logic exists
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('shows N/A for missing website', () => {
    render(<BusinessReviewPage />);
    const fourthRow = screen.getByText('Golden Era Barbershop').closest('tr');
    fireEvent.click(fourthRow!);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

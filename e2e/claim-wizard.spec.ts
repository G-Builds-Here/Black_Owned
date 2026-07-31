import { test, expect } from '@playwright/test';

test.describe('Claim Wizard E2E Tests', () => {
  const BASE_URL = 'http://localhost:3001';

  test.describe('AC2: Claim Wizard 3-Step Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to a business detail page where the claim button exists
      await page.goto(`${BASE_URL}/directory`);
    });

    test('should open the claim wizard when clicking "Claim this Business"', async ({ page }) => {
      // Find a business that is unclaimed and click the claim button
      // Assuming there's a claim button on business cards
      const claimButton = page.getByRole('button', { name: /claim this business/i });

      // Wait for the button to be available (may need to find a specific business card first)
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Verify the wizard modal opens
      await expect(page.getByRole('dialog', { name: /claim business/i })).toBeVisible();

      // Verify Step 1: Confirm Ownership is displayed
      await expect(page.getByText('Confirm Ownership')).toBeVisible();
      await expect(page.getByText('Confirm you are the owner')).toBeVisible();

      // Verify step indicator shows 3 steps
      await expect(page.getByText('1')).toBeVisible();
      await expect(page.getByText('2')).toBeVisible();
      await expect(page.getByText('3')).toBeVisible();
    });

    test('should display business information in Step 1', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Verify business name is displayed
      await expect(page.getByText(/cozy corner cafe|soul food kitchen/i)).toBeVisible();

      // Verify address is displayed if available
      await expect(page.getByText(/address/i)).toBeVisible();
    });

    test('should navigate from Step 1 to Step 2 when Next is clicked', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Click Next to go to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Verify Step 2: Upload Documents is displayed
      await expect(page.getByText('Upload Documents')).toBeVisible();
      await expect(page.getByText('Upload supporting documents')).toBeVisible();

      // Verify file upload area is visible
      await expect(page.getByText(/click to upload or drag and drop/i)).toBeVisible();
      await expect(page.getByText(/pdf or images only/i)).toBeVisible();
    });

    test('should accept PDF and image files under 10MB in Step 2', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Create a test PDF file (using a simple text file as PDF for testing)
      const testFile = Buffer.from('%PDF-1.4 test document');

      // Upload the file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test-document.pdf',
        mimeType: 'application/pdf',
        buffer: testFile,
      });

      // Verify the file is listed
      await expect(page.getByText('test-document.pdf')).toBeVisible();

      // Verify file count indicator
      await expect(page.getByText(/uploaded files \(1\)/i)).toBeVisible();
    });

    test('should reject files larger than 10MB', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Create a large file (over 10MB)
      const largeFile = Buffer.from('x'.repeat(11 * 1024 * 1024));

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'large-file.pdf',
        mimeType: 'application/pdf',
        buffer: largeFile,
      });

      // Verify warning toast is shown
      await expect(page.getByText(/file size exceeds 10mb limit/i)).toBeVisible();

      // Verify file is NOT listed
      await expect(page.getByText('large-file.pdf')).not.toBeVisible();
    });

    test('should reject non-PDF and non-image files', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Try to upload a text file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'invalid-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('invalid content'),
      });

      // Verify warning toast is shown
      await expect(page.getByText(/only pdf and image files are allowed/i)).toBeVisible();
    });

    test('should allow multiple files to be uploaded', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload first file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'document1.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 doc1'),
      });

      // Upload second file
      await fileInput.setInputFiles({
        name: 'document2.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake jpg content'),
      });

      // Verify both files are listed
      await expect(page.getByText('document1.pdf')).toBeVisible();
      await expect(page.getByText('document2.jpg')).toBeVisible();

      // Verify file count
      await expect(page.getByText(/uploaded files \(2\)/i)).toBeVisible();
    });

    test('should remove file when remove button is clicked', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload a file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 test'),
      });

      // Verify file is listed
      await expect(page.getByText('test.pdf')).toBeVisible();

      // Click remove button
      await page.getByLabel(/remove test\.pdf/i).click();

      // Verify file is removed
      await expect(page.getByText('test.pdf')).not.toBeVisible();
    });

    test('should navigate to Step 3 after uploading files', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload a file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'proof.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 proof'),
      });

      // Click Next to go to Step 3
      await page.getByRole('button', { name: /next/i }).click();

      // Verify Step 3: Review & Submit is displayed
      await expect(page.getByText('Review & Submit')).toBeVisible();
      await expect(page.getByText('Claim Summary')).toBeVisible();

      // Verify uploaded file is shown in summary
      await expect(page.getByText('proof.pdf')).toBeVisible();
    });

    test('should show submit button on Step 3', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload a file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'ownership.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 ownership'),
      });

      // Navigate to Step 3
      await page.getByRole('button', { name: /next/i }).click();

      // Verify submit button is visible
      await expect(page.getByRole('button', { name: /submit for review/i })).toBeVisible();
    });

    test('should navigate back from Step 2 to Step 1', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page.getByText('Upload Documents')).toBeVisible();

      // Click Back
      await page.getByRole('button', { name: /back/i }).click();

      // Verify back on Step 1
      await expect(page.getByText('Confirm Ownership')).toBeVisible();
    });

    test('should navigate back from Step 3 to Step 2', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload a file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4'),
      });

      // Navigate to Step 3
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page.getByText('Review & Submit')).toBeVisible();

      // Click Back
      await page.getByRole('button', { name: /back/i }).click();

      // Verify back on Step 2
      await expect(page.getByText('Upload Documents')).toBeVisible();
      await expect(page.getByText('doc.pdf')).toBeVisible();
    });

    test('should disable Next button on Step 2 when no files are uploaded', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Verify Next button is disabled
      const nextButton = page.getByRole('button', { name: /next/i });
      await expect(nextButton).toBeDisabled();
    });

    test('should enable Next button on Step 2 after files are uploaded', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Navigate to Step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Upload a file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4'),
      });

      // Verify Next button is enabled
      const nextButton = page.getByRole('button', { name: /next/i });
      await expect(nextButton).toBeEnabled();
    });

    test('should close wizard when Cancel is clicked', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });
      await claimButton.first().click();

      // Verify modal is open
      await expect(page.getByRole('dialog', { name: /claim business/i })).toBeVisible();

      // Click Cancel
      await page.getByRole('button', { name: /cancel/i }).click();

      // Verify modal is closed
      await expect(page.getByRole('dialog', { name: /claim business/i })).not.toBeVisible();
    });

    test('should reset wizard state when reopened', async ({ page }) => {
      const claimButton = page.getByRole('button', { name: /claim this business/i });
      await expect(claimButton.first()).toBeVisible({ timeout: 5000 });

      // Open wizard
      await claimButton.first().click();

      // Navigate to Step 2 and upload a file
      await page.getByRole('button', { name: /next/i }).click();
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'temp.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4'),
      });

      // Close wizard
      await page.getByRole('button', { name: /cancel/i }).click();

      // Reopen wizard
      await claimButton.first().click();

      // Verify wizard is reset to Step 1
      await expect(page.getByText('Confirm Ownership')).toBeVisible();
      await expect(page.getByText('temp.pdf')).not.toBeVisible();
    });
  });
});

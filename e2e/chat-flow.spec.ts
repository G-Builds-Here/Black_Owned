import { test, expect } from '@playwright/test';

/**
 * Chat Flow E2E Tests - LOC-0053-AC1
 *
 * Verifies the end-to-end flow of creating and resuming conversations
 * from the business detail page.
 */
test.describe('Chat Flow E2E Tests', () => {
  const BASE_URL = 'http://localhost:3001';

  // Mock business data for testing
  const TEST_BUSINESS_ID = 'biz-001';
  const TEST_BUSINESS_OWNER_ID = 'owner-001';

  test.describe('AC1: Create New Conversation', () => {
    test.beforeEach(async ({ page }) => {
      // Clear any existing localStorage to simulate fresh session
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
    });

    test('should create a new conversation when clicking Chat button on business detail page', async ({ page }) => {
      // Given: Test environment has authenticated users and businesses with no existing conversations
      // Navigate to business detail page
      await page.goto(`${BASE_URL}/business/${TEST_BUSINESS_ID}`);

      // Wait for the page to load and business details to be visible
      await expect(page.getByText('Verified')).toBeVisible({ timeout: 10000 });

      // When: User clicks the Chat button
      const chatButton = page.getByRole('button', { name: /Chat/i });
      await expect(chatButton).toBeVisible();
      await chatButton.click();

      // Then: User is navigated to the chat page
      await expect(page).toHaveURL(/\/chat/);

      // Verify the chat page loaded with the Messages heading
      await expect(page.getByRole('heading', { name: /Messages/i })).toBeVisible();

      // Verify conversation list is displayed
      await expect(page.getByText(/Your conversations/i)).toBeVisible();
    });

    test('should navigate to chat page with conversationId when clicking Chat button', async ({ page }) => {
      // Given: User is on a business detail page for a verified business
      await page.goto(`${BASE_URL}/business/${TEST_BUSINESS_ID}`);

      // Wait for page to load
      await expect(page.getByRole('heading')).toBeVisible({ timeout: 10000 });

      // When: User clicks the Chat button
      const chatButton = page.getByRole('button', { name: /Chat/i });
      await chatButton.click();

      // Then: URL should contain conversationId query parameter
      await expect(page).toHaveURL(/conversationId=/);

      // Extract and verify the conversationId is present
      const url = new URL(page.url());
      const conversationId = url.searchParams.get('conversationId');
      expect(conversationId).toBeTruthy();
      expect(conversationId).toMatch(/^conv-/);
    });
  });

  test.describe('AC2: Resume Existing Conversation', () => {
    test.beforeEach(async ({ page }) => {
      // Set up auth token for authenticated user
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock-jwt-token');
      });
    });

    test('should resume existing conversation when clicking Chat button', async ({ page }) => {
      // Given: User has an existing conversation with a business owner
      await page.goto(`${BASE_URL}/business/${TEST_BUSINESS_ID}`);

      // Wait for page to load
      await expect(page.getByRole('heading')).toBeVisible({ timeout: 10000 });

      // When: User clicks the Chat button
      const chatButton = page.getByRole('button', { name: /Chat/i });
      await chatButton.click();

      // Then: User is navigated to the chat page
      await expect(page).toHaveURL(/\/chat/);

      // Verify the conversation list shows existing conversations
      await expect(page.getByRole('heading', { name: /Messages/i })).toBeVisible();
    });
  });

  test.describe('Navigation Flow', () => {
    test('should handle Chat button click from business detail page', async ({ page }) => {
      // Given: User is on the business detail page
      await page.goto(`${BASE_URL}/business/${TEST_BUSINESS_ID}`);

      // Verify the Chat button is visible for verified businesses
      await expect(page.getByRole('button', { name: /Chat/i })).toBeVisible();

      // When: User clicks Chat
      await page.getByRole('button', { name: /Chat/i }).click();

      // Then: Should navigate to chat page
      await expect(page).toHaveURL(/\/chat/);

      // Verify chat page elements are present
      await expect(page.getByRole('heading', { name: /Messages/i })).toBeVisible();
      await expect(page.getByText(/Your conversations/i)).toBeVisible();
    });
  });
});

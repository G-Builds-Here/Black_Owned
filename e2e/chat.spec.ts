/**
 * LOC-0053 — Chat E2E (LOC-0042 flows)
 *
 * Covers: starting a conversation from the business detail page (ChatButton),
 * the customer/owner round trip with unread accounting, live NATS delivery of
 * the owner's reply, and the signed-out case. Requires the dev server on
 * :3000, the Postgres container, and the NATS WS port (8081).
 */

import { test, expect, afterAll, beforeAll, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_URL,
  type E2ESession,
  RUN_SUFFIX,
  claimBusiness,
  cleanupChatFixtures,
  newSession,
  psql,
  seedSession,
  warmRoutes,
} from './e2e-utils';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let customer: E2ESession;
let owner: E2ESession;
let businessId = '';
let businessName = '';

beforeAll(async () => {
  customer = await newSession('e2e-chat-cust');
  owner = await newSession('e2e-chat-owner');
  businessName = `E2E Chat Kitchen ${RUN_SUFFIX}`;
  const claimed = await claimBusiness(owner, businessName);
  businessId = claimed.id;
  await warmRoutes([`/business/${businessId}`, '/chat']);
}, 120_000);

afterAll(() => {
  cleanupChatFixtures([customer.email, owner.email], businessId ? [businessId] : []);
}, 60_000);

async function apiConversationsAs(page: Page, token: string): Promise<{ conversations: any[] }> {
  return page.evaluate(async (t) => {
    const res = await fetch('/api/chat/conversations', { headers: { Authorization: `Bearer ${t}` } });
    const body = await res.json();
    return { conversations: body.data?.conversations ?? body.conversations ?? [] };
  }, token);
}

test('signed-in customer starts a conversation from the business detail page', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  await seedSession(page, customer);

  await page.goto(`${BASE_URL}/business/${businessId}`);
  await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
  const chatButton = page.getByRole('button', { name: 'Chat', exact: true });
  await expect(chatButton).toBeVisible();

  await chatButton.click();
  await expect(page).toHaveURL(/\/chat\?conversation=[0-9a-f-]+/, { timeout: 30_000 });

  const count = psql(
    `SELECT COUNT(*) FROM conversations WHERE business_id='${businessId}' AND user_id='${customer.id}'`
  );
  expect(count).toBe('1');

  await context.close();
});

test('round trip: owner sees unread count, reads, and replies live over NATS', async ({ browser }) => {
  const custContext: BrowserContext = await browser.newContext();
  const custPage = await custContext.newPage();
  await seedSession(custPage, customer);

  // Resume the conversation through the same UI entry point.
  await custPage.goto(`${BASE_URL}/business/${businessId}`);
  await custPage.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(custPage).toHaveURL(/\/chat\?conversation=[0-9a-f-]+/, { timeout: 30_000 });

  // Customer sends the first message.
  await custPage.getByPlaceholder('Write a message…').fill('Hello from the e2e suite');
  await custPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(custPage.getByText('Hello from the e2e suite').first()).toBeVisible();
  await expect(custPage.getByText('Sent', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Owner side: the conversation is listed even though the owner is not the
  // conversation's user_id (owner-of-business access), with unread = 1.
  const ownerContext: BrowserContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await seedSession(ownerPage, owner);
  await ownerPage.goto(`${BASE_URL}/chat`);
  await expect(ownerPage.getByText(businessName).first()).toBeVisible({ timeout: 30_000 });

  const listing = await apiConversationsAs(ownerPage, owner.accessToken);
  const entry = listing.conversations.find((c) => c.businessId === businessId);
  expect(entry).toBeTruthy();
  expect(entry.unreadCount).toBe(1);

  // Open the thread: the message arrives and is marked read.
  await ownerPage.getByRole('button', { name: new RegExp(businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect(ownerPage.getByText('Hello from the e2e suite').first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () => psql(`SELECT is_read::text FROM messages WHERE business_id='${businessId}' ORDER BY created_at DESC LIMIT 1`),
      { timeout: 15_000 }
      // this stack's psql renders boolean::text as 'true'/'false'
    )
    .toBe('true');

  // Owner replies; the customer receives it live without reloading (NATS WS).
  await ownerPage.getByPlaceholder('Write a message…').fill('Hi back from the owner');
  await ownerPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(custPage.getByText('Hi back from the owner').first()).toBeVisible({ timeout: 30_000 });

  await custContext.close();
  await ownerContext.close();
});

test('signed-out visitor has no chat button on the business detail page', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/business/${businessId}`);
  await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveCount(0);
  await context.close();
});

/**
 * Temporary verification: prove the Input hydration mismatch is fixed.
 *
 * Simulates SSR -> client hydration: server-render markup, mount it in jsdom,
 * then hydrateRoot over it. React 19 logs a hydration mismatch via console.error.
 */
import React from 'react';
import { MessageChannel } from 'worker_threads';

// jsdom lacks MessageChannel; react-dom/server (browser build) needs it.
// Polyfill BEFORE loading react-dom/server.
(global as any).MessageChannel = (global as any).MessageChannel || MessageChannel;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderToStaticMarkup } = require('react-dom/server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hydrateRoot } = require('react-dom/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Input = require('./Input').default;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hydrateAndCollectErrors(node: React.ReactElement): Promise<string[]> {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(node);
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: any[]) => errors.push(a.map(String).join(' '));
  try {
    hydrateRoot(container, node);
    await sleep(50); // allow React to flush async hydration diagnostics
  } catch (e) {
    errors.push(String(e));
  } finally {
    console.error = orig;
  }
  return errors;
}

// Reproduces the ORIGINAL bug: a Math.random() id written into HTML.
const BadInput = () => {
  const rid = `input-${Math.random().toString(36).substr(2, 9)}`;
  return <input id={rid} placeholder="bad" />;
};

describe('Input hydration', () => {
  it('control: Math.random() id DOES trigger a hydration mismatch', async () => {
    const errors = await hydrateAndCollectErrors(<BadInput />);
    expect(errors.some((e) => /hydrat/i.test(e))).toBe(true);
  });

  it('fixed Input (useId) does NOT trigger a hydration mismatch', async () => {
    const errors = await hydrateAndCollectErrors(<Input placeholder="Search" />);
    expect(errors.some((e) => /hydrat/i.test(e))).toBe(false);
  });
});

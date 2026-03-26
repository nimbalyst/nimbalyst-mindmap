/**
 * E2E test: basic node editing in the mindmap editor.
 *
 * Prerequisites:
 *   - Nimbalyst is running in dev mode
 *   - sample.mindmap is open (call extension_test_open_file first)
 *
 * Run via: extension_test_run MCP tool with testFile param
 */

import { test, expect, extensionEditor } from '@nimbalyst/extension-sdk/testing';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FILE = path.resolve(__dirname, '../sample.mindmap');
const EXTENSION_ID = 'com.nimbalyst.mindmap';

test('double-click a node, type new text, commit with Enter', async ({ page }) => {
  const editor = extensionEditor(page, EXTENSION_ID, SAMPLE_FILE);
  await editor.waitFor({ timeout: 5000 });

  const rootNode = editor.locator('[data-id="node_root"] .mindmap-node-text');
  await rootNode.waitFor({ timeout: 5000 });
  const initialText = await rootNode.textContent();

  // Double-click to open the edit overlay
  await rootNode.dblclick();
  const overlay = editor.locator('.edit-overlay');
  await overlay.waitFor({ timeout: 3000 });

  // Type new text and commit with Enter
  await overlay.fill('');
  await overlay.pressSequentially('My Test Map');
  await overlay.press('Enter');
  await overlay.waitFor({ state: 'hidden', timeout: 3000 });

  await expect(rootNode).toHaveText('My Test Map');

  // Restore original text
  await rootNode.dblclick();
  await overlay.waitFor({ timeout: 3000 });
  await overlay.fill('');
  await overlay.pressSequentially(initialText ?? 'Central idea');
  await overlay.press('Enter');
  await overlay.waitFor({ state: 'hidden', timeout: 3000 });
});

test('edit overlay dismisses on Escape without changing text', async ({ page }) => {
  const editor = extensionEditor(page, EXTENSION_ID, SAMPLE_FILE);
  await editor.waitFor({ timeout: 5000 });

  const rootNode = editor.locator('[data-id="node_root"] .mindmap-node-text');
  await rootNode.waitFor({ timeout: 5000 });
  const initialText = await rootNode.textContent();

  // Open overlay
  await rootNode.dblclick();
  const overlay = editor.locator('.edit-overlay');
  await overlay.waitFor({ timeout: 3000 });

  // Type something then cancel with Escape
  await overlay.pressSequentially('should not save');
  await overlay.press('Escape');
  await overlay.waitFor({ state: 'hidden', timeout: 3000 });

  // Text must be unchanged
  await expect(rootNode).toHaveText(initialText ?? 'Central idea');
});

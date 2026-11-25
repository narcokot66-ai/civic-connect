import { test, expect, devices } from '@playwright/test';

// Use Pixel 5 mobile viewport emulation
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Field Worker Status Flow', () => {
  test('Officer can toggle status on mobile view and sync status', async ({ page }) => {
    // 1. Navigate to Mobile Field App route
    await page.goto('http://localhost:3000/field-app');

    // 2. Verify initial default state is Available
    const statusBadge = page.locator('text=AVAILABLE');
    await expect(statusBadge).toBeVisible();

    // 3. Tap "On-Site / Busy" button
    await page.click('#btn-status-busy');

    // 4. Assert status updates dynamically on mobile UI
    const busyBadge = page.locator('text=BUSY');
    await expect(busyBadge).toBeVisible();

    // 5. Tap "Off-Duty" button
    await page.click('#btn-status-absent');
    const absentBadge = page.locator('text=ABSENT');
    await expect(absentBadge).toBeVisible();
  });
});
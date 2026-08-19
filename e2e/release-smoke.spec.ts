import { expect, test } from '@playwright/test';

test.describe('Release smoke', () => {
  test('public entry points render and the pilot sign-in is English', async ({ page }) => {
    const homeResponse = await page.goto('/');
    expect(homeResponse?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const loginResponse = await page.goto('/login');
    expect(loginResponse?.ok()).toBe(true);
    await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible();
  });

  for (const path of ['/dashboard', '/conversations', '/calendar', '/knowledge']) {
    test(`${path} remains protected without a tenant session`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login(\?.*)?$/);
      await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible();
      await expect(page.getByLabel('Navigazione dashboard')).toHaveCount(0);
    });
  }
});

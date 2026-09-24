const { test, expect } = require('@playwright/test');

async function fillAccount(page, id, name, email, password) {
  await page.getByRole('textbox', { name: 'Student ID', exact: true }).fill(id);
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill(name);
  if (email) await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('STUDENT LOG IN', { exact: true })).toBeVisible();
}

test('student registration, QR display and password recovery on a phone-sized screen', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('STUDENT LOG IN', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/student-login.png', fullPage: true });
  await page.getByRole('button', { name: /Don't have an account/ }).click();
  await fillAccount(page.getByTestId('app-modal'), '2026-200', 'Demo Student', 'student@example.com', 'first password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('first password');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await expect(page.getByText('Welcome, Student')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Enlarge QR' }).click();
  await expect(page.getByText('Student ID: 2026-200')).toBeVisible();
  await expect(page.locator('svg').last()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await context.setOffline(false);
  await logout(page);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByTestId('app-modal').getByRole('textbox', { name: 'Email', exact: true }).fill('student@example.com');
  await page.getByRole('button', { name: 'Get verification code' }).click();
  await expect(page.getByRole('textbox', { name: 'Verification code' })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await page.getByLabel('New password', { exact: true }).fill('updated password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('updated password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.getByLabel('Password', { exact: true }).fill('updated password');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await expect(page.getByText('Demo Student', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/student-dashboard.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('admin signup, event management, organizer attendance, demo scanning and persistence', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Are you admin? ADMIN LOGIN' }).click();
  await page.getByRole('button', { name: /Don't have an account/ }).click();
  await page.getByTestId('app-modal').getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.com');
  await page.getByRole('button', { name: 'Get verification code' }).click();
  await page.getByRole('button', { name: 'Verify code' }).click();
  await fillAccount(page.getByTestId('app-modal'), '2026-100', 'Demo Officer', null, 'officer password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('officer password');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await page.getByRole('button', { name: '+ Create event', exact: true }).click();
  await page.getByRole('textbox', { name: 'Event name', exact: true }).fill('General Assembly');
  await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Main Hall');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Check myself in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Already present', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'My QR', exact: true }).click();
  await expect(page.getByText('Student ID: 2026-100')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Scan for this event', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate QR scan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Student ID', exact: true }).fill('2024-00123');
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Juan Dela Cruz');
  await page.getByRole('button', { name: 'Mark present', exact: true }).click();
  await expect(page.getByText('ATTENDANCE RECORDED')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Attendees (2)', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('STUDENT LOG IN', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Student ID', exact: true }).fill('2024-00123');
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await expect(page.getByText('General Assembly', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Officer (2026-100)', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByText('General Assembly', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

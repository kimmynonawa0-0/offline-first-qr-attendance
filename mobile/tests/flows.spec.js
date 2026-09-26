const { test, expect } = require('@playwright/test');
const { Buffer } = require('node:buffer');

const password = 'a private passphrase';
async function login(page, id, pass) {
  await page.getByRole('textbox', { name: 'Student ID', exact: true }).fill(id);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
}
async function changePassword(page) {
  await expect(page.getByText('Choose your password', { exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save password and continue' }).click();
}
async function logout(page) {
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Welcome back', { exact: true })).toBeVisible();
}
async function chooseCSV(page, content) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose CSV file' }).click();
  await (await chooser).setFiles({ name: 'faculty.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
}

test('unified login, required password change, CSV import and student offline login', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText(/SIGN UP|ADMIN LOGIN/)).toHaveCount(0);
  await login(page, '23-02330', 'BSCS-3C');
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('Admin control', { exact: true })).toBeVisible();
  await chooseCSV(page, 'student_id,name,section\n00123,Juan Dela Cruz,BSCS-3C');
  await expect(page.getByText('1 new / 0 existing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText('Imported 1 students. Skipped 0 existing IDs.')).toBeVisible();
  await logout(page);
  await login(page, '00123', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('Welcome, Student')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Enlarge QR' }).click();
  await expect(page.getByText('Student ID: 00123')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await logout(page);
  await login(page, '00123', 'BSCS-3C');
  await expect(page.getByText(/Invalid student ID or password/)).toBeVisible();
  await login(page, '00123', password);
  await expect(page.getByText('Welcome, Student')).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await login(page, '00123', password);
  await expect(page.getByText('Welcome, Student')).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid roster rejected, reimport skips IDs, organizer attendance still works', async ({ page }) => {
  await page.goto('/');
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await chooseCSV(page, 'student_id,name,section\n00123,Juan,');
  await expect(page.getByText(/Row 2: student ID, name, and section are required/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm import' })).toHaveCount(0);
  const csv = 'student_id,name,section\n00123,Juan Dela Cruz,BSCS-3C';
  await chooseCSV(page, csv);
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await chooseCSV(page, csv);
  await expect(page.getByText('1 new / 0 existing')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText('Imported 1 students. Skipped 0 existing IDs.')).toBeVisible();
  await chooseCSV(page, csv);
  await expect(page.getByText('0 new / 1 existing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
  await page.getByRole('button', { name: '+ Create event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill('General Assembly');
  await page.getByLabel('Location', { exact: true }).fill('Main Hall');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Check myself in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Already present', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Scan for this event', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate QR scan', exact: true }).click();
  await page.getByLabel('Student ID', { exact: true }).fill('00123');
  await page.getByLabel('Full name', { exact: true }).fill('Juan Dela Cruz');
  await page.getByRole('button', { name: 'Mark present', exact: true }).click();
  await expect(page.getByText('ATTENDANCE RECORDED')).toBeVisible();
  await page.reload();
  await login(page, '00123', 'BSCS-3C');
  await changePassword(page);
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await expect(page.getByText('General Assembly', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Organizer (23-02330)', { exact: true })).toHaveCount(0);
});

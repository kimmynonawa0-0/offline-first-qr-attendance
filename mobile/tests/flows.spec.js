const { test, expect } = require('@playwright/test');
const { Buffer } = require('node:buffer');
const XLSX = require('@e965/xlsx');

const password = 'a private passphrase';
async function login(page, id, pass) {
  await page.getByRole('textbox', { name: 'Student ID', exact: true }).fill(id);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
}
async function changePassword(page) {
  await expect(page.getByText('Choose your password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save password and continue' }).click();
}
async function logout(page) {
  if (!await page.getByRole('button', { name: 'Logout', exact: true }).count()) {
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Student ID', exact: true })).toBeVisible();
}
async function chooseFile(page, name, mimeType, buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose roster file' }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}
async function chooseCSV(page, content) {
  await chooseFile(page, 'faculty.csv', 'text/csv', Buffer.from(content));
}

test('first login changes password with only new and confirmation fields', async ({ page }) => {
  await page.goto('/');
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('Organizer tools', { exact: true })).toBeVisible();
});

test('PWA serves the app shell after an offline relaunch', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Student ID', exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Student ID', exact: true })).toBeVisible();
});

test('unified login, required password change, roster upload and student login', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText(/SIGN UP|ADMIN LOGIN/)).toHaveCount(0);
  await login(page, '23-02330', 'BSCS-3C');
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('Organizer tools', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View assigned events', exact: true }).click();
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page.getByLabel('Event name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Event date', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Event time', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Upload section roster', exact: true }).click();
  await chooseCSV(page, 'student_id,name,section\n00123,Juan Dela Cruz,BSCS-3C');
  await expect(page.getByLabel('1 new / 0 existing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Upload roster to server', exact: true }).click();
  await expect(page.getByText(/Roster uploaded\. 1 new students added; 0 existing IDs kept\./)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await logout(page);
  await login(page, '00123', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('Student home', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enlarge QR' }).click();
  await expect(page.getByText('Student ID: 00123')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click({ position: { x: 8, y: 8 } });
  await logout(page);
  await login(page, '00123', 'BSCS-3C');
  await expect(page.getByText(/Invalid student ID or password/)).toBeVisible();
  await login(page, '00123', password);
  await expect(page.getByText('Student home', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Student home', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid roster rejected and organizer event tools work', async ({ page }) => {
  await page.goto('/');
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await page.getByRole('button', { name: 'Upload section roster', exact: true }).click();
  await chooseCSV(page, 'student_id,name,section\n00123,Juan,');
  await expect(page.getByText(/Row 2: student ID, name, and section are required/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload roster to server' })).toHaveCount(0);
  const csv = 'student_id,name,section\n00123,Juan Dela Cruz,BSCS-3C';
  await chooseCSV(page, csv);
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await chooseCSV(page, csv);
  await expect(page.getByLabel('1 new / 0 existing')).toBeVisible();
  await page.getByRole('button', { name: 'Upload roster to server' }).click();
  await expect(page.getByText(/Roster uploaded\./)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'View assigned events', exact: true }).click();
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill('General Assembly');
  await page.getByLabel('Location', { exact: true }).fill('Main Hall');
  await page.getByTestId('app-modal').getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open General Assembly', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Current event: General Assembly', exact: true })).toBeVisible();
  const startScanning = page.getByRole('button', { name: 'Start scanning', exact: true });
  await expect(startScanning.getByTestId('button-icon')).toBeVisible();
  await startScanning.click();
  await expect(page.getByText('Time In scanning', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Current event: General Assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Check myself in (Time In)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Attendance complete', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Scan Time In', exact: true }).click();
  await expect(page.getByText('Time In scanning', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await expect(page.getByText('Student attendance', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Organizer', { exact: true })).toBeVisible();
  await expect(page.getByText(/General Assembly/)).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await logout(page);
  await login(page, '00123', 'BSCS-3C');
  await changePassword(page);
  await expect(page.getByText('General Assembly', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Current event: General Assembly', exact: true }).click();
  await expect(page.getByText('Event details', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await expect(page.getByText('No attendance records yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Organizer (23-02330)', { exact: true })).toHaveCount(0);
});

test('admin can preview an Excel roster through the file picker', async ({ page }) => {
  await page.goto('/');
  await login(page, '23-02330', 'BSCS-3C');
  await changePassword(page);
  await page.getByRole('button', { name: 'Upload section roster', exact: true }).click();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Student ID', 'Full Name', 'Section'], ['00123', 'Juan Dela Cruz', 'BSCS-3C'],
  ]), 'Roster');
  await chooseFile(page, 'faculty.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })));
  await expect(page.getByLabel('1 new / 0 existing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload roster to server' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel import' }).click();
});

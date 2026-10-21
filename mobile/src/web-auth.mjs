import { loginStudentRemotely } from './remote-sync.mjs';

export async function reauthenticateOrganizer(user, password, apiUrl, login = loginStudentRemotely) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to continue.');
  if (!password) throw new Error('Enter your organizer password to continue.');

  const account = await login(user.id, password, apiUrl);
  if (account.role !== 'admin' || account.accessLevel === 'manager') {
    throw new Error('This account is not an event organizer.');
  }
  return account;
}

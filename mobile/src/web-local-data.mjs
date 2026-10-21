export function removeBrowserPasswords(data) {
  let changed = false;
  const removeFromAccounts = accounts => accounts.map(account => {
    if (!('password' in account)) return account;
    changed = true;
    const { password, ...profile } = account;
    return profile;
  });

  const students = removeFromAccounts(data.students);
  const admins = removeFromAccounts(data.admins);
  return changed ? { ...data, students, admins } : data;
}

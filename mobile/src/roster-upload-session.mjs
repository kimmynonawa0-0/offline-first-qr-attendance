export async function authorizeRosterUpload({
  user,
  session,
  password,
  apiUrl,
  online,
  isWeb,
  reauthenticate,
}) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to upload a roster.');
  if (!online) throw new Error('Connect to the internet before uploading a roster.');

  if (session?.id === user.id && session.token) return session;
  if (!isWeb) throw new Error('Sign in online as an organizer before uploading a roster.');

  const account = await reauthenticate(user, password, apiUrl);
  if (typeof account?.sessionToken !== 'string' || !account.sessionToken) {
    throw new Error('The server did not authorize this roster upload. Sign in again and retry.');
  }
  return { id: user.id, token: account.sessionToken };
}

export async function authorizeRosterUpload({
  user,
  session,
  online,
}) {
  if (user?.role !== 'admin') throw new Error('Log in as an organizer to upload a roster.');
  if (!online) throw new Error('Connect to the internet before uploading a roster.');

  if (session?.id === user.id && typeof session.token === 'string' && session.token) return session;
  throw new Error('Your organizer session is unavailable. Log out, then sign in online again before uploading; your selected file is still on this device.');
}

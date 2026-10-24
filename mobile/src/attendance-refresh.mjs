export function hasOrganizerSession(user, session) {
  return user?.role === 'admin' && session?.id === user.id && typeof session.token === 'string' && Boolean(session.token);
}

export function organizerRefreshNeedsPassword(platform, user, session) {
  return platform === 'web' && !hasOrganizerSession(user, session);
}

export function hasServerSession(user, session) {
  return ['admin', 'student'].includes(user?.role) && session?.id === user.id
    && (!session.role || session.role === user.role)
    && typeof session.token === 'string' && Boolean(session.token);
}

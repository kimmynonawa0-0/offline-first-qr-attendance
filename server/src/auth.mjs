import { createHash, randomBytes } from 'node:crypto';

export function createOrganizerSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function loginClientRoleError(client, accessLevel) {
  if (client === 'organizer-web') return 'The organizer website is unavailable. Sign in through the NORWEScan app.';
  if (client === 'manager-web' && accessLevel !== 'manager') return 'This account does not have system-manager access.';
  if (client === 'mobile' && accessLevel === 'manager') return 'System manager accounts use the management website, not the scanning app.';
  return null;
}

export function canImportRoster(account) {
  if (!account || account.must_change_password) return false;
  return account.access_level === 'manager'
    || (account.access_level === 'organizer' && Boolean(account.section));
}

export function rosterScopeError(account, students) {
  if (account?.access_level !== 'organizer') return null;
  if (!account.section) return 'Your organizer account is not linked to a roster section. Contact the system manager.';
  if (Array.isArray(students) && students.some(student => student?.section?.trim?.() !== account.section)) {
    return `You can only import students from your section (${account.section}).`;
  }
  return null;
}

export function canCreateOrganizerEvent(account) {
  return account?.access_level === 'organizer' && !account.must_change_password;
}

export function organizerEventDeleteError(account, event, attendanceCount) {
  if (!account || account.access_level !== 'organizer') return 'Only an event organizer can delete an event.';
  if (account.must_change_password) return 'Change your temporary password before deleting events.';
  if (!event || event.created_by !== account.id) return 'Only the organizer who created this event can delete it.';
  if (attendanceCount > 0) return 'This event already has attendance records. Ask the system manager to delete it.';
  return null;
}

export function organizerSectionAssigneeIds(account, organizers) {
  if (!canCreateOrganizerEvent(account)) return null;
  const ids = new Set([account.id]);
  if (account.section && Array.isArray(organizers)) {
    for (const organizer of organizers) {
      if (organizer?.id && organizer.section === account.section
        && organizer.access_level === 'organizer' && organizer.enabled !== false) {
        ids.add(organizer.id);
      }
    }
  }
  return [...ids];
}

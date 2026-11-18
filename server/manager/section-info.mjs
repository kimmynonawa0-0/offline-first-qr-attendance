export function sectionInfo(section) {
  const value = String(section || '').trim();
  const match = value.match(/^(.+?)[ -]+(\d+)(?:[ -]*[A-Za-z]+)?$/);
  return match ? { program: match[1].toUpperCase(), year: match[2] } : { program: 'Other', year: 'Other' };
}

// Initials for the avatar circle.
//
// Falls back to '?' for a name with no letter or digit in it, so the avatar
// never renders as an empty circle.

export function initialsOf(name) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';

  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';

  return (first + last).toUpperCase();
}

/**
 * Picks a logo dot for a name, so the same child keeps the same colour and two
 * children in one list do not blend together.
 */
export function dotIndexFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % 4;
}
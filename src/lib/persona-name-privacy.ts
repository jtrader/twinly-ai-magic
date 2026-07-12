/**
 * Pure — flags when a creator's chosen persona name matches their own real
 * (legal) name closely enough to reduce the privacy separation between Real
 * Me and that persona. This is a soft warning shown at persona-creation
 * time, never a block — naming a persona after yourself is the creator's
 * choice, this just makes the tradeoff visible before they commit to it.
 */
export function matchesRealName(personaName: string, realFullName: string | null | undefined): boolean {
  const a = personaName.trim().toLowerCase();
  const b = (realFullName ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

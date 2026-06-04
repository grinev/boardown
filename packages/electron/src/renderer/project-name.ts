// Last path segment of a folder — the sidebar's display name and the
// onboarding's project-name seed. Handles POSIX and Windows separators.
export function folderName(folder: string): string {
  return (
    folder
      .split(/[/\\]/)
      .filter((part) => part.length > 0)
      .pop() ?? folder
  );
}

// A valid ID prefix (2–5 uppercase letters) guessed from a folder/project name:
// initials of its words, or the first letters of a single word. Empty when no
// usable letters — onboarding then asks for it as before.
export function suggestIdPrefix(name: string): string {
  const words = name.split(/[^A-Za-z]+/).filter((word) => word.length > 0);
  const initials = words
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
  const base = initials.length >= 2 ? initials : (words[0] ?? '').toUpperCase();
  const candidate = base.replace(/[^A-Z]/g, '').slice(0, 5);
  return candidate.length >= 2 ? candidate : '';
}

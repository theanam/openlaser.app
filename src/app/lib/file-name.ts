/** "photo.png" → "photo"; names without an extension stay as they are. */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

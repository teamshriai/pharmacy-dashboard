/**
 * Saves a generated file. The link is attached before clicking (older Firefox
 * needs that) and the object URL is kept for a minute, because iOS Safari opens
 * the file in a preview first and a URL revoked too early shows up blank.
 */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

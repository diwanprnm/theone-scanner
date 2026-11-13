/** Web Share API wrapper. Falls back to download on browsers that refuse files. */
export function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
}

export function canShare(files: File[]): boolean {
  return canShareFiles() && navigator.canShare({ files })
}

/** Returns true when the system share sheet opened, false when the caller should download instead. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  if (!files.length || !canShare(files)) return false
  try {
    await navigator.share({ files, title })
    return true
  } catch (err) {
    // User dismissing the sheet is not a failure of the feature; still not "shared".
    if (err instanceof DOMException && err.name === 'AbortError') return true
    return false
  }
}
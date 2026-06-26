export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Share a URL via the Web Share API when available, otherwise copy it to the
 * clipboard. A user-cancelled share is reported as `shared` (no fallback copy).
 */
export async function shareOrCopyUrl(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      // Otherwise fall through to clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

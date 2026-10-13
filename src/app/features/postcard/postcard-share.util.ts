export interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export function sanitizeFilenamePart(value: string, fallback: string): string {
  return (value || fallback).replace(/[^a-z0-9_-]+/gi, '_');
}

export function computeCanShareFiles(blob: Blob | null, filename: string): boolean {
  if (!blob) return false;
  const nav = navigator as Navigator & ShareCapableNavigator;
  if (typeof nav.canShare !== 'function') return false;
  try {
    const probe = new File([blob], filename, { type: 'image/png' });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

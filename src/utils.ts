export function validateAndNormalizeUrl(urlLike: string | null): string | null {
  if (!urlLike) return null;
  try {
    const parsed = new URL(urlLike);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

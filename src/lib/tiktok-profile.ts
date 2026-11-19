export const MAX_PROFILE_VIDEOS = 200;

export type ProfileVideo = { id: string; url: string; description: string };

export function tiktokProfileHandle(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !/(^|\.)tiktok\.com$/.test(url.hostname.toLowerCase())
  )
    return null;
  return url.pathname.match(/^\/@([\w.-]+)\/?$/)?.[1] ?? null;
}

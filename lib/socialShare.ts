// Web-intent share URLs for popular social platforms.
// WeChat is handled separately (QR code -> scan on phone) because it cannot
// be deep-linked from a desktop browser.

export type SocialPlatform =
  | "wechat"
  | "facebook"
  | "x"
  | "line"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "reddit"
  | "email";

/** Build a platform-specific share URL. `wechat` returns null (use QR instead). */
export function buildSocialUrl(
  platform: Exclude<SocialPlatform, "wechat">,
  opts: { link: string; text: string; title: string },
): string {
  const { link, text, title } = opts;
  const e = encodeURIComponent;
  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${e(link)}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${e(link)}&text=${e(text)}`;
    case "line":
      return `https://social-plugins.line.me/lineit/share?url=${e(link)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${e(link)}`;
    case "whatsapp":
      return `https://wa.me/?text=${e(`${text} ${link}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${e(link)}&text=${e(text)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${e(link)}&title=${e(title)}`;
    case "email":
      return `mailto:?subject=${e(title)}&body=${e(`${text}\n\n${link}`)}`;
  }
}

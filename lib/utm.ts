/**
 * UTM 跟踪工具 —— 让各渠道来源可归因
 *
 * 用法：
 *   import { utmLink } from "@/lib/utm"
 *   <a href={utmLink("https://truelens.top", "xiaohongshu", "profile")}>...
 *
 * UTM 方案（统一管理，改一处全站生效）
 */

export type UtmSource =
  | "xiaohongshu"   // 小红书
  | "zhihu"         // 知乎
  | "douyin"        // 抖音
  | "wechat"        // 微信公众号
  | "bilibili"      // B站
  | "linkedin"      // LinkedIn
  | "line"          // LINE
  | "producthunt"   // ProductHunt
  | "direct"        // 直接访问（兜底）
  | "email";        // 邮件

export type UtmMedium =
  | "social"        // 社媒
  | "article"       // 文章
  | "video"         // 视频
  | "qna"           // 问答
  | "email"         // 邮件
  | "referral";     // 推荐

const UTM_CONFIG: Record<UtmSource, { medium: UtmMedium; campaign: string }> = {
  xiaohongshu:  { medium: "social",   campaign: "xhs_launch_w1" },
  zhihu:        { medium: "qna",      campaign: "zhihu_launch_w1" },
  douyin:       { medium: "video",    campaign: "dy_launch_w1" },
  wechat:       { medium: "article",  campaign: "wechat_launch_w1" },
  bilibili:     { medium: "video",    campaign: "bili_launch_w1" },
  linkedin:     { medium: "social",   campaign: "linkedin_launch_w1" },
  line:         { medium: "social",   campaign: "line_launch_w1" },
  producthunt:  { medium: "referral", campaign: "ph_launch" },
  direct:       { medium: "referral", campaign: "direct" },
  email:        { medium: "email",    campaign: "email_newsletter" },
};

/**
 * 生成带 UTM 参数的完整 URL
 * @param url 基础 URL（如 "https://truelens.top"）
 * @param source UTM 来源
 * @param extra 额外 UTM 参数（可选）
 */
export function utmLink(
  url: string,
  source: UtmSource,
  extra?: { term?: string; content?: string },
): string {
  const cfg = UTM_CONFIG[source] ?? UTM_CONFIG.direct;
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: cfg.medium,
    utm_campaign: cfg.campaign,
  });
  if (extra?.term) params.set("utm_term", extra.term);
  if (extra?.content) params.set("utm_content", extra.content);

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}

/**
 * 获取 UTM 配置（用于日志/调试）
 */
export function getUtmConfig() {
  return UTM_CONFIG;
}

/**
 * 创建一组各渠道营销链接
 * 用于营销文案中插入官网链接时统一使用
 */
export function marketingLinks() {
  return {
    homepage: "https://truelens.top",
    xiaohongshu: utmLink("https://truelens.top", "xiaohongshu"),
    zhihu: utmLink("https://truelens.top", "zhihu"),
    douyin: utmLink("https://truelens.top", "douyin"),
    wechat: utmLink("https://truelens.top", "wechat"),
    bilibili: utmLink("https://truelens.top", "bilibili"),
    linkedin: utmLink("https://truelens.top", "linkedin"),
    line: utmLink("https://truelens.top", "line"),
    producthunt: utmLink("https://truelens.top", "producthunt"),
    pricing: utmLink("https://truelens.top/pricing", "direct", { term: "pricing" }),
  };
}

# UTM 归因方案 v1.0

> 用途：所有营销内容中的官网链接必须使用 UTM 参数，以便在 Vercel Analytics 中识别来源渠道

---

## 渠道代码对照表

| 渠道 | utm_source | utm_medium | utm_campaign | 备注 |
|------|-----------|-----------|-------------|------|
| 小红书 | `xiaohongshu` | `social` | `xhs_launch_w1` | 首发周 |
| 知乎 | `zhihu` | `qna` | `zhihu_launch_w1` | 首发周 |
| 抖音 | `douyin` | `video` | `dy_launch_w1` | 首发周 |
| 微信公众号 | `wechat` | `article` | `wechat_launch_w1` | 首发周 |
| B站 | `bilibili` | `video` | `bili_launch_w1` | 首发周 |
| LinkedIn | `linkedin` | `social` | `linkedin_launch_w1` | 首发周 |
| LINE | `line` | `social` | `line_launch_w1` | 首发周 |
| ProductHunt | `producthunt` | `referral` | `ph_launch` | 单次活动 |
| 邮件 | `email` | `email` | `email_newsletter` | 定期 |
| 直接访问 | `direct` | `referral` | `direct` | 兜底 |

---

## 完整链接示例

```
https://truelens.top?utm_source=xiaohongshu&utm_medium=social&utm_campaign=xhs_launch_w1
https://truelens.top?utm_source=zhihu&utm_medium=qna&utm_campaign=zhihu_launch_w1
```

## 代码中使用

```ts
import { utmLink, marketingLinks } from "@/lib/utm"

// 获取渠道链接
utmLink("https://truelens.top", "xiaohongshu")
// → https://truelens.top?utm_source=xiaohongshu&utm_medium=social&utm_campaign=xhs_launch_w1

// 获取所有渠道预置链接
const links = marketingLinks()
links.xiaohongshu  // 小红书链接
links.pricing       // 定价页链接
```

## 注意事项

1. **所有渠道链接必须用 UTM**，否则无法归因
2. 一个链接只标一个渠道，不要叠加多个 utm_source
3. 首发周（w1）结束后，更新 utm_campaign 为 `w2`、`w3` 等
4. Vercel Analytics 会自动按 UTM 参数分组展示来源

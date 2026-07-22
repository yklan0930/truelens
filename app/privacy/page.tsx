import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隱私權政策 / Privacy Policy — TrueLens",
  description:
    "TrueLens 隱私權政策：我們如何收集、使用、儲存與保護您的個人資料。TrueLens privacy policy: how we collect, use, store, and protect your personal data.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo-icon.png"
              alt="TrueLens"
              width={56}
              height={56}
              className="w-14 h-14 rounded-2xl shrink-0 ring-1 ring-slate-200/70 shadow-sm"
            />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-slate-900 leading-tight">TrueLens</span>
              <span className="text-xs text-slate-500 leading-tight">AI 内容真伪检测</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">隱私權政策</h1>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-700 mb-1">Privacy Policy</h2>
        <p className="text-sm text-slate-500 mb-8">
          最後更新：2026-07-22 · Last updated: 2026-07-22
        </p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 text-slate-700 leading-relaxed">
          {/* ============== 中文 ============== */}
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">一、我們是誰</h3>
            <p>
              TrueLens（網址 <a href="https://truelens.top" className="text-indigo-600 hover:underline">truelens.top</a>
              ，以下簡稱「我們」）是一個 AI 生成內容真偽檢測平台。本政策說明當您使用我們的服務時，我們如何收集、使用、儲存與保護您的個人資料。
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">二、我們收集哪些資料</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>您主動上傳的圖片/視訊：</strong>用於即時 AI 內容檢測。我們<strong>不會</strong>將您的圖片用於模型訓練。</li>
              <li><strong>帳號資訊：</strong>若您註冊帳號，我們會收集您的電子郵件地址與密碼雜湊（不存明文）。</li>
              <li><strong>使用紀錄：</strong>包含檢測時間、引擎類型、AI 概率、IP 位址、用戶代理（用於防濫用、計費與產品改進）。</li>
              <li><strong>付款資訊：</strong>由我們的支付合作方（Polar.sh）直接處理；我們<strong>不收集</strong>您的信用卡號。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">三、我們如何使用您的資料</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>執行 AI 內容檢測並回傳結果給您。</li>
              <li>防止濫用、識別異常請求、保護系統安全。</li>
              <li>計費與訂單管理。</li>
              <li>回應您的客服請求。</li>
              <li>在<strong>去識別化與彙總</strong>後用於產品改進。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">四、資料保留期限</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>未登入訪客的檢測記錄：<strong>不保留</strong>。</li>
              <li>登入使用者的檢測歷史：您帳號有效期間保留；您可隨時手動刪除。</li>
              <li>分享卡（公開連結）：保留至您主動刪除為止。</li>
              <li>付款發票：依稅法規定保存 5 年。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">五、第三方服務商</h3>
            <p>我們僅在必要範圍內與下列服務商共享資料：</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>HuggingFace</strong>：圖像/視訊推論（去識別化後）。</li>
              <li><strong>Sightengine</strong>：高精度檢測引擎（圖像/視訊）。</li>
              <li><strong>Polar.sh</strong>：海外付款處理（MoR 模式）。</li>
              <li><strong>Vercel + Neon</strong>：託管與資料庫。</li>
              <li><strong>LINE</strong>（如您使用 LINE 官方帳號通知）：僅用於訊息推播。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">六、您的權利</h3>
            <p>您可隨時：</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>查詢我們持有您的哪些資料。</li>
              <li>要求更正、刪除或匯出您的資料。</li>
              <li>撤回同意或關閉帳號。</li>
            </ul>
            <p>聯絡信箱：<a href="mailto:privacy@truelens.top" className="text-indigo-600 hover:underline">privacy@truelens.top</a></p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">七、Cookie 使用</h3>
            <p>本站使用必要 cookie（登入態、匿名使用量計數、偏好語言）以及 Google Analytics（去識別化分析）。您可在瀏覽器設定中清除或封鎖 cookie。</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">八、政策變更</h3>
            <p>本政策更新將以發布日期標示於頁首。重大變更將透過站內公告或電子郵件通知您。</p>
          </section>

          <hr className="my-8 border-slate-200" />

          {/* ============== English ============== */}
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">1. Who We Are</h3>
            <p>
              TrueLens (<a href="https://truelens.top" className="text-indigo-600 hover:underline">truelens.top</a>,
              hereinafter "we", "us", or "our") is an AI content authenticity detection platform. This
              policy explains how we collect, use, store, and protect your personal data when you use
              our service.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">2. What Data We Collect</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Images/videos you upload</strong> for real-time detection. We do <strong>not</strong> use them for model training.</li>
              <li><strong>Account information:</strong> email and password hash (never plaintext) if you register.</li>
              <li><strong>Usage logs:</strong> detection time, engine type, AI probability, IP, user agent (for anti-abuse, billing, product improvement).</li>
              <li><strong>Payment info:</strong> handled directly by our payment partner (Polar.sh); we <strong>never</strong> store card numbers.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">3. How We Use Your Data</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Run AI content detection and return results to you.</li>
              <li>Prevent abuse, identify anomalies, protect system security.</li>
              <li>Process billing and manage subscriptions.</li>
              <li>Respond to your customer support requests.</li>
              <li>Improve our product through <strong>anonymized and aggregated</strong> analytics.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">4. Data Retention</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Anonymous visitor detection records: <strong>not retained</strong>.</li>
              <li>Logged-in user history: retained while your account is active; you can delete it anytime.</li>
              <li>Public share links: retained until you delete them.</li>
              <li>Tax invoices: retained 5 years per local tax law.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">5. Third-Party Processors</h3>
            <p>We share data only to the extent necessary with:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>HuggingFace</strong> — image/video inference (anonymized payloads).</li>
              <li><strong>Sightengine</strong> — high-precision detection engine.</li>
              <li><strong>Polar.sh</strong> — overseas payment processing (Merchant of Record).</li>
              <li><strong>Vercel + Neon</strong> — hosting and database.</li>
              <li><strong>LINE</strong> — only if you opt in for notifications.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">6. Your Rights</h3>
            <p>You may at any time:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Request access to the personal data we hold about you.</li>
              <li>Request correction, deletion, or export of your data.</li>
              <li>Withdraw consent or close your account.</li>
            </ul>
            <p>Contact: <a href="mailto:privacy@truelens.top" className="text-indigo-600 hover:underline">privacy@truelens.top</a></p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">7. Cookies</h3>
            <p>
              We use strictly necessary cookies (session, anonymous usage counter, language preference)
              and Google Analytics (anonymized). You can clear or block cookies in your browser
              settings.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">8. Changes to This Policy</h3>
            <p>
              Material changes will be reflected in the "Last updated" date above and, when
              significant, announced on the site or by email.
            </p>
          </section>
        </div>

        <p className="text-center text-sm text-slate-500 mt-8">
          <Link href="/" className="text-indigo-600 hover:underline">← 返回首页 / Back to home</Link>
          <span className="mx-3">·</span>
          <Link href="/terms" className="text-indigo-600 hover:underline">服务条款 / Terms of Service</Link>
        </p>
      </main>
    </div>
  );
}

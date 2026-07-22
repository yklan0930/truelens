import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "服務條款 / Terms of Service — TrueLens",
  description:
    "TrueLens 服務條款：使用我們的 AI 內容檢測服務時的權利、義務與責任聲明。TrueLens Terms of Service: rights, obligations, and disclaimers.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
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
              className="w-14 h-14 rounded-2xl shrink-1 ring-1 ring-slate-200/70 shadow-sm"
            />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-slate-900 leading-tight">TrueLens</span>
              <span className="text-xs text-slate-500 leading-tight">AI 内容真伪检测</span>
            </div>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">服務條款</h1>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-700 mb-1">Terms of Service</h2>
        <p className="text-sm text-slate-500 mb-8">
          最後更新：2026-07-22 · Last updated: 2026-07-22
        </p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 text-slate-700 leading-relaxed">
          {/* ============== 中文 ============== */}
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">一、接受條款</h3>
            <p>
              當您存取或使用 TrueLens（<a href="https://truelens.top" className="text-indigo-600 hover:underline">truelens.top</a>，以下簡稱「本服務」），即代表您同意遵守本服務條款。若您不同意，請停止使用本服務。
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">二、服務內容</h3>
            <p>
              TrueLens 提供 AI 生成內容（圖片、視訊）真偽檢測服務，並附帶取證證據（EXIF、C2PA、視覺特徵等）供您參考。<strong>本服務並非 100% 準確，結果僅供參考，不構成法律或專業鑑定意見。</strong>
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">三、帳號與使用規範</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>您需對您帳號下的一切行為負責。</li>
              <li>不得上傳含兒童性影像（CSAM）、恐怖主義、仇恨言論或任何違法內容。</li>
              <li>不得嘗試反組譯、入侵或以任何手段繞過使用額度（quota）限制。</li>
              <li>不得將本服務用於騷擾、跟蹤或誹謗他人。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">四、智慧財產權</h3>
            <p>
              本服務的所有商標、軟體、演算法、UI 與文案均屬 TrueLens 或其授權方所有。經您上傳的圖片/視訊，<strong>仍歸您所有</strong>；我們僅於執行檢測所需的範圍內處理，不主張任何所有權。
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">五、付費與退款</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Pro 與 Business 為訂閱制，依所選方案按月或按年計費。</li>
              <li>加量包（add-on）一經購買即加入當月額度，<strong>不支援退款</strong>，除非法律強制規定。</li>
              <li>訂閱可隨時取消；當期已付款的服務仍可使用至期滿。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">六、免責聲明</h3>
            <p>本服務按「現狀」與「可用」原則提供。在適用法律允許的最大範圍內，我們不對以下情況承擔責任：</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>檢測結果的絕對準確性或商業可用性。</li>
              <li>因使用本服務所引發的間接、偶發或衍生損失。</li>
              <li>第三方服務商（中斷、不可用）導致的服務中斷。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">七、服務變更與終止</h3>
            <p>我們保留隨時修改或終止本服務的權利。若您的帳號違反本條款，我們得立即暫停或終止該帳號。</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">八、準據法與管轄</h3>
            <p>本條款依中華人民共和國法律解釋；因本條款引發的爭議，由上海市有管轄權的法院管轄。</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">九、聯絡我們</h3>
            <p>如有問題，請聯絡：<a href="mailto:legal@truelens.top" className="text-indigo-600 hover:underline">legal@truelens.top</a></p>
          </section>

          <hr className="my-8 border-slate-200" />

          {/* ============== English ============== */}
          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">1. Acceptance of Terms</h3>
            <p>
              By accessing or using TrueLens (<a href="https://truelens.top" className="text-indigo-600 hover:underline">truelens.top</a>,
              the "Service"), you agree to be bound by these Terms of Service. If you do not
              agree, please discontinue use of the Service.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">2. Service Description</h3>
            <p>
              TrueLens provides AI content (image and video) authenticity detection, with supporting
              forensic evidence (EXIF, C2PA, visual signatures, etc.). <strong>The Service is not
              100% accurate; results are for reference only and do not constitute legal or
              professional expert opinion.</strong>
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">3. Account & Acceptable Use</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>You are responsible for all activity under your account.</li>
              <li>You may not upload CSAM, terrorist content, hate speech, or any illegal material.</li>
              <li>You may not attempt to reverse-engineer, breach, or circumvent quota limits.</li>
              <li>You may not use the Service to harass, stalk, or defame others.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">4. Intellectual Property</h3>
            <p>
              All trademarks, software, algorithms, UI, and copy related to the Service are owned by
              TrueLens or its licensors. <strong>You retain ownership of images/videos you
              upload;</strong> we process them only as needed to provide detection and claim no
              ownership rights.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">5. Payment & Refunds</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Pro and Business are subscription plans, billed monthly or annually.</li>
              <li>Add-on credit packs are <strong>non-refundable</strong> once purchased, except as required by law.</li>
              <li>Subscriptions may be cancelled at any time; paid service continues through the end of the current period.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">6. Disclaimers</h3>
            <p>The Service is provided "as is" and "as available." To the maximum extent permitted by law, we disclaim liability for:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Absolute accuracy of any detection result or its fitness for commercial use.</li>
              <li>Indirect, incidental, or consequential damages arising from use of the Service.</li>
              <li>Service interruptions caused by third-party providers.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">7. Modification & Termination</h3>
            <p>
              We reserve the right to modify or discontinue the Service at any time. Accounts that
              violate these Terms may be suspended or terminated immediately.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">8. Governing Law</h3>
            <p>
              These Terms are governed by the laws of the People's Republic of China. Disputes
              shall be submitted to the competent court in Shanghai.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 mb-3">9. Contact</h3>
            <p>Questions? Reach us at <a href="mailto:legal@truelens.top" className="text-indigo-600 hover:underline">legal@truelens.top</a></p>
          </section>
        </div>

        <p className="text-center text-sm text-slate-500 mt-8">
          <Link href="/" className="text-indigo-600 hover:underline">← 返回首页 / Back to home</Link>
          <span className="mx-3">·</span>
          <Link href="/privacy" className="text-indigo-600 hover:underline">隐私政策 / Privacy Policy</Link>
        </p>
      </main>
    </div>
  );
}

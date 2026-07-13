export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-[#1A2B4E] text-xl font-bold mb-6">
        プライバシーポリシー
      </h1>

      <div className="space-y-5 text-sm text-[#1a1c1c] leading-relaxed">
        <section className="bg-white border border-[#D1D5DB] rounded-lg p-5">
          <h2 className="font-semibold text-[#1A2B4E] mb-2">1. 基本方針</h2>
          <p>
            本サービスは、学生の成績情報という極めてセンシティブな個人情報を扱います。
            「個人情報を外部に漏らさない」ことを設計の中心に据えています。
          </p>
        </section>

        <section className="bg-white border border-[#D1D5DB] rounded-lg p-5">
          <h2 className="font-semibold text-[#1A2B4E] mb-2">2. データの保持方法</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              入力・取り込みした学生データ（学年・課程・成績情報など）は、
              あなたのブラウザ上でサービスを開いている間だけ一時的に保持されます。
            </li>
            <li>ページのリロード・タブを閉じる・リセット操作で消去されます。</li>
            <li>サーバー側に永続的に保存することはしません。</li>
          </ul>
        </section>

        <section className="bg-white border border-[#D1D5DB] rounded-lg p-5">
          <h2 className="font-semibold text-[#1A2B4E] mb-3">3. データフロー</h2>
          <p className="mb-3">
            学生データがどこで処理され、どこへ行くかを示します。
          </p>
          <div className="bg-[#f3f3f3] rounded p-4 font-mono text-xs leading-loose">
            <p>【学生の成績表PDF】</p>
            <p className="pl-4 text-[#946e69]">↓ ブラウザ内で処理（学外送信なし）</p>
            <p>【ブラウザのメモリ上に一時保持】</p>
            <p className="pl-4 text-[#946e69]">↓ HTTPS で送信</p>
            <p>【バックエンド（学内DGX Spark上）】</p>
            <p className="pl-4 text-[#946e69]">↓ 学内LLMへ問い合わせ</p>
            <p>【ローカルLLM（同一DGX上）】</p>
            <p className="pl-4 text-[#946e69]">↓ 応答をブラウザへ返す</p>
            <p>【あなたのブラウザ】</p>
            <p className="mt-2 text-[#946e69]">
              ※ この流れのどこにも「永続保存」への分岐はありません。
            </p>
            <p className="text-[#946e69]">
              ※ 学外のクラウドAI事業者等へ送信・保存されることはありません。
            </p>
          </div>
        </section>

        <section className="bg-white border border-[#D1D5DB] rounded-lg p-5">
          <h2 className="font-semibold text-[#1A2B4E] mb-2">
            4. データが外部に出ないことの担保
          </h2>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              <span className="font-medium">AIへの送信先：</span>
              学内DGX Spark上のローカルLLMを利用。学外のAI事業者には送信しません。
            </li>
            <li>
              <span className="font-medium">保存しない：</span>
              サーバーにも永続保存しません。
            </li>
            <li>
              <span className="font-medium">通信の暗号化：</span>
              学生の端末とサーバー間の通信はHTTPSで暗号化します。
            </li>
          </ol>
        </section>

        <section className="bg-white border border-[#D1D5DB] rounded-lg p-5">
          <h2 className="font-semibold text-[#1A2B4E] mb-2">5. ログへの非記録</h2>
          <p>
            学生の成績情報・履修データ・対話内容の全文をサーバーのログに記録しません。
            個人の成績を復元できる形では残しません。
          </p>
        </section>
      </div>

      <p className="mt-6 text-xs text-[#946e69] text-center">
        龍谷大学 プロジェクトリサーチ 2026
      </p>
    </div>
  );
}

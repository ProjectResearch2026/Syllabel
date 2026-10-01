/**
 * 生成中であることを示す指標（design.md §4.1.4）。
 *
 * **本文が1文字も届いていないあいだ、吹き出しを空のままにしない。** 履修提案は
 * 説明文が届くまで1分強かかる（§7.2）し、チャット系も思考を有効にしている
 * ため（§6.3.1）1回に100秒を超えることがある。そのあいだ吹き出しが無地のままだと、
 * 待っているのか壊れているのかが学生に判断できない。
 *
 * **文言は呼び出し側が渡す。** 待ち時間の長さが画面で違い、履修提案だけは所要時間を
 * 添える必要があるためである。
 *
 * 点は `animate-bounce` を 150ms ずつずらして跳ねさせる。**動きを読めない環境のために
 * 文言を必ず添える**ので、点そのものは `aria-hidden` とし、読み上げは文言に任せる。
 */
export default function ThinkingIndicator({ label }: { label: string }) {
  return (
    <span role="status" className="flex items-center gap-2">
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-fg-primary" />
        <span className="size-1.5 animate-bounce rounded-full bg-fg-primary [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-border-primary [animation-delay:300ms]" />
      </span>
      <span className="text-[13px] leading-[21px] text-fg-secondary">{label}</span>
    </span>
  );
}

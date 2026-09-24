import { redirect } from "next/navigation";

/**
 * 旧ルート。取り込みは PC・モバイルとも `/` に統一した（design.md §8）。
 * 古いリンクやブックマークから来た人を取り込み画面へ送る。
 */
export default function ImportPage() {
  redirect("/");
}

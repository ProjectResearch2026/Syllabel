/**
 * サービス名と説明文。ページの `<title>` / `<meta name="description">`(`app/layout.tsx`)と
 * ホーム画面に追加したときの名前(`app/manifest.ts`)が同じ値を見る。
 */

export const SERVICE_NAME = "Syllabel";

/** ブラウザのタブは幅が狭いと後ろが切れるので、サービス名を先頭に置く */
export const SITE_TITLE = `${SERVICE_NAME}｜履修登録支援AIチャットボット`;

/** 検索結果やリンクのプレビューに出る説明文。ページ上には表示されない */
export const SITE_DESCRIPTION =
  `${SERVICE_NAME}は、龍谷大学先端理工学部の学生向けに、成績表から次学期の時間割を提案する履修登録支援AIチャットボットです。`;

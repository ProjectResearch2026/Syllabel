import MobileImportFlow from "./_components/MobileImportFlow";
import PcImportPage from "./_components/PcImportPage";

/**
 * 成績表の取り込み（`/`）。**PC とモバイルで同じ URL に同じ画面を置く**
 * （ui-design_pc.pen / ui-design_phone.pen の 01〜03）。見た目だけを CSS で切り替える。
 */
export default function RootPage() {
  return (
    <>
      <div className="flex flex-1 flex-col md:hidden">
        <MobileImportFlow />
      </div>
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <PcImportPage />
      </div>
    </>
  );
}

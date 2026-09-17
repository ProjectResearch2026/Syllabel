import MobileImportFlow from "./_components/MobileImportFlow";
import PcImportPage from "../_components/PcImportPage";

export default function ImportPage() {
  return (
    <>
      <div className="md:hidden flex-1">
        <MobileImportFlow />
      </div>
      <div className="hidden min-h-0 md:flex md:flex-1 md:flex-col">
        <PcImportPage />
      </div>
    </>
  );
}

import MobileImportFlow from "./_components/MobileImportFlow";
import PcImportPage from "../_components/PcImportPage";

export default function ImportPage() {
  return (
    <>
      <div className="md:hidden flex-1">
        <MobileImportFlow />
      </div>
      <div className="hidden md:flex md:flex-col md:flex-1">
        <PcImportPage />
      </div>
    </>
  );
}

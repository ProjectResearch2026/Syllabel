import MobileTimetablePage from "./_components/MobileTimetablePage";
import PcImportPage from "./_components/PcImportPage";

export default function RootPage() {
  return (
    <>
      <div className="md:hidden">
        <MobileTimetablePage />
      </div>
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <PcImportPage />
      </div>
    </>
  );
}

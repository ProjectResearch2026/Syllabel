import MobileTimetablePage from "./_components/MobileTimetablePage";
import PcImportPage from "./_components/PcImportPage";

export default function RootPage() {
  return (
    <>
      <div className="md:hidden">
        <MobileTimetablePage />
      </div>
      <div className="hidden md:flex flex-col flex-1">
        <PcImportPage />
      </div>
    </>
  );
}

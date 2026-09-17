import MobileSettingsPage from "./_components/MobileSettingsPage";
import PcMyDataPage from "./_components/PcMyDataPage";

export default function MyDataPage() {
  return (
    <>
      <div className="md:hidden flex-1">
        <MobileSettingsPage />
      </div>
      <div className="hidden min-h-0 md:flex md:flex-1 md:flex-col">
        <PcMyDataPage />
      </div>
    </>
  );
}

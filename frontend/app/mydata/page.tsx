import MobileSettingsPage from "./_components/MobileSettingsPage";
import PcMyDataPage from "./_components/PcMyDataPage";

export default function MyDataPage() {
  return (
    <>
      <div className="md:hidden flex-1">
        <MobileSettingsPage />
      </div>
      <div className="hidden md:flex md:flex-col md:flex-1">
        <PcMyDataPage />
      </div>
    </>
  );
}

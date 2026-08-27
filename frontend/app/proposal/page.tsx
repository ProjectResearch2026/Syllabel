import CreditBar from "./_components/CreditBar";
import TimetablePanel from "./_components/TimetablePanel";
import ChatPanel from "./_components/ChatPanel";
import MobileProposalPage from "./_components/MobileProposalPage";
import ProposalLoader from "./_components/ProposalLoader";

export default function ProposalPage() {
  return (
    <>
      <ProposalLoader />
      <div className="md:hidden">
        <MobileProposalPage />
      </div>
      <div className="hidden md:flex flex-col flex-1">
        <CreditBar />
        <div className="flex flex-1 overflow-hidden">
          <TimetablePanel />
          <ChatPanel />
        </div>
      </div>
    </>
  );
}

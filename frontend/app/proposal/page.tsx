import CreditBar from "./_components/CreditBar";
import TimetablePanel from "./_components/TimetablePanel";
import ChatPanel from "./_components/ChatPanel";
import MobileProposalPage from "./_components/MobileProposalPage";
import ProposalLoader from "./_components/ProposalLoader";

/**
 * 時間割（履修提案）。ui-design_pc.pen 04_履修提案。
 *
 * PC は**縦に伸びない**。単位バーはヘッダーカードの続きとして上に貼り付き、
 * 残りを時間割カードとAIパネルが横に分け合う。スクロールするのはパネルの中だけ。
 */
export default function ProposalPage() {
  return (
    <>
      <ProposalLoader />
      <div className="md:hidden">
        <MobileProposalPage />
      </div>
      <div className="hidden min-h-0 flex-1 gap-2 md:flex md:flex-col md:pc-viewport">
        <CreditBar />
        <div className="flex min-h-0 flex-1 gap-4">
          <TimetablePanel />
          <ChatPanel />
        </div>
      </div>
    </>
  );
}

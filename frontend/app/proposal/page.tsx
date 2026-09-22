import CreditBar from "./_components/CreditBar";
import TimetablePanel from "./_components/TimetablePanel";
import ChatPanel from "./_components/ChatPanel";
import MobileProposalPage from "./_components/MobileProposalPage";

/**
 * 時間割（履修提案）。ui-design_pc.pen 04_履修提案。
 *
 * PC は**縦に伸びない**。単位バーはヘッダーカードの続きとして上に貼り付き、
 * 残りを時間割カードとAIパネルが横に分け合う。スクロールするのはパネルの中だけ。
 *
 * **この画面に来ただけでは提案を撃たない**（design.md §8.3）。提案は AIパネルに
 * 希望条件を送った時点で始まる（`lib/useProposalConversation.ts`）。
 */
export default function ProposalPage() {
  return (
    <>
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

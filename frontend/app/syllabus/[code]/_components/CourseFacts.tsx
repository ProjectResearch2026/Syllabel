import {
  CalendarDays,
  User,
  Award,
  GraduationCap,
  MapPin,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { SyllabusDetail } from "@/lib/syllabus-api";
import { formatInstructors } from "@/lib/syllabus-api";
import { formatSchedule, formatGrade } from "@/lib/schedule";
import { targetsOf } from "@/lib/courseTarget";

/**
 * 科目の基本情報（ui-design_pc.pen 06_講義詳細 FactsStrip）。
 *
 * 見出しカードの下に**1行で横並び**にする。**ラベル付きで並べる**のは変えない。
 * 以前はアイコンと値だけを横一列に並べていたため、`オンライン` が
 * キャンパスなのか授業形態なのか、`2年次～4年次` が配当年次なのかが
 * 読み取れなかった。開講の表示は `lib/schedule.ts` に従う。
 *
 * 値が無い項目は落とすので、残った項目だけで幅を分け合う。
 */
export default function CourseFacts({ syllabus }: { syllabus: SyllabusDetail }) {
  const schedule = formatSchedule(syllabus);
  const grade = formatGrade(syllabus);
  const instructors = formatInstructors(syllabus.instructors);
  const place = [syllabus.campus_name, syllabus.room].filter(Boolean).join(" / ");
  const target = targetsOf(syllabus);

  const facts: { icon: LucideIcon; label: string; value: React.ReactNode }[] = [
    {
      icon: CalendarDays,
      label: "開講",
      value:
        schedule.length > 0 ? (
          <span className="flex flex-col">
            {schedule.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : null,
    },
    { icon: User, label: "担当教員", value: instructors },
    { icon: Award, label: "単位", value: `${syllabus.credits}単位` },
    { icon: GraduationCap, label: "配当年次", value: grade },
    { icon: MapPin, label: "場所", value: place || null },
    {
      icon: Building2,
      label: syllabus.programs.length > 0 ? "対象課程" : "対象学部",
      value: target.length > 0 ? target.join("・") : null,
    },
  ];

  return (
    /*
     * モバイルは枠付きの2列の表(ui-design_phone.pen 06 CourseFacts)。
     * 最後の行の下線は `-mb-px` で枠線に重ねて消す
     */
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border-primary md:flex md:flex-wrap md:gap-x-5 md:gap-y-4 md:overflow-visible md:rounded-none md:border-0 md:border-t md:border-card-divider md:pt-4">
      {facts
        .filter((fact) => fact.value)
        .map((fact) => (
          <div
            key={fact.label}
            className="-mb-px flex min-w-0 flex-col gap-0.5 border-b border-border-primary px-3 py-2 odd:border-r md:mb-0 md:min-w-[140px] md:flex-1 md:gap-1 md:border-0 md:p-0"
          >
            <dt className="flex items-center gap-1.5 text-[10px] text-fg-secondary md:text-[11px] md:font-semibold md:tracking-[0.3px] md:text-fg-muted">
              <fact.icon size={13} className="hidden shrink-0 text-fg-icon md:block" aria-hidden="true" />
              {fact.label}
            </dt>
            <dd className="text-xs font-semibold leading-5 text-fg-primary md:text-[13px] md:font-medium">
              {fact.value}
            </dd>
          </div>
        ))}
    </dl>
  );
}

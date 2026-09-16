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

/**
 * 科目の基本情報。**ラベル付きで並べる。**
 *
 * 以前はアイコンと値だけを横一列に並べていたため、`オンライン` が
 * キャンパスなのか授業形態なのか、`2年次～4年次` が配当年次なのかが
 * 読み取れなかった。開講の表示は `lib/schedule.ts` に従う。
 */
export default function CourseFacts({ syllabus }: { syllabus: SyllabusDetail }) {
  const schedule = formatSchedule(syllabus);
  const grade = formatGrade(syllabus);
  const instructors = formatInstructors(syllabus.instructors);
  const place = [syllabus.campus_name, syllabus.room].filter(Boolean).join(" / ");
  const target = syllabus.programs.length > 0 ? syllabus.programs : syllabus.faculties;

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
      label: target === syllabus.programs ? "対象課程" : "対象学部",
      value: target.length > 0 ? target.join("・") : null,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {facts
        .filter((fact) => fact.value)
        .map((fact) => (
          <div key={fact.label} className="flex min-w-0 gap-2">
            <fact.icon size={15} className="mt-[3px] shrink-0 text-fg-muted" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-wide text-fg-muted">
                {fact.label}
              </dt>
              <dd className="text-[13.5px] font-medium leading-relaxed text-fg-primary">
                {fact.value}
              </dd>
            </div>
          </div>
        ))}
    </dl>
  );
}

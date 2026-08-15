'use client';

import Link from 'next/link';
import { Sparkles, Stamp } from 'lucide-react';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

type SubmissionType = 'pokefuta' | 'design';

type SubmissionTypeSwitcherProps = {
  current: SubmissionType;
  designSubmissionSuspended?: boolean;
};

const options = [
  {
    id: 'pokefuta' as const,
    href: '/upload',
    label: 'ポケふた',
    description: 'ポケモンマンホール',
    submissionKind: 'character' as const,
    activeClass: 'border-[#BF5640] bg-[#FFF3EE] text-[#8F3F2E] shadow-[0_0_0_1px_rgba(191,86,64,0.12)]',
    iconClass: 'bg-[#BF5640] text-white',
    icon: Stamp,
  },
  {
    id: 'design' as const,
    href: '/design-manholes/new',
    label: 'デザインふた',
    description: 'キャラクター・ご当地デザインなど',
    submissionKind: 'design' as const,
    activeClass: 'border-[#7B63A8] bg-[#F4F0FA] text-[#5E4788] shadow-[0_0_0_1px_rgba(123,99,168,0.12)]',
    iconClass: 'bg-[#7B63A8] text-white',
    icon: Sparkles,
  },
];

export default function SubmissionTypeSwitcher({
  current,
  designSubmissionSuspended = false,
}: SubmissionTypeSwitcherProps) {
  const { trackSubmissionEntry } = useAnalytics();

  return (
    <section aria-labelledby="submission-type-heading">
      <div className="mb-2 flex items-end justify-between gap-2">
        <h1 id="submission-type-heading" className="text-base font-extrabold">
          投稿するマンホールを選択
        </h1>
        <span className="text-[11px] font-bold text-[#5F574F]">種類を確認してください</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = option.id === current;
          const suspended = option.id === 'design' && designSubmissionSuspended;
          const Icon = option.icon;

          return (
            <Link
              key={option.id}
              href={option.href}
              aria-current={active ? 'page' : undefined}
              onClick={() => trackSubmissionEntry({
                submission_kind: option.submissionKind,
                surface: 'submission_type_switcher',
              })}
              className={`relative rounded-xl border-2 p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm ${
                active ? option.activeClass : 'border-[#8C6A4A]/15 bg-white/65 text-[#2A2A2A]'
              }`}
            >
              {(active || suspended) && (
                <span className="absolute right-2 top-2 rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-extrabold">
                  {suspended ? '受付停止中' : '選択中'}
                </span>
              )}
              <span className={`mb-2 grid h-8 w-8 place-items-center rounded-full ${active ? option.iconClass : 'bg-[#8C6A4A]/10 text-[#6B6B6B]'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="block text-sm font-extrabold leading-snug">{option.label}</span>
              <span className="mt-1 block text-[11px] font-medium leading-snug text-[#5F574F]">
                {option.description}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

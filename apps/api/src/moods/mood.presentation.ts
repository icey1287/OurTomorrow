import { Prisma } from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";

export const moodEntrySelect = Prisma.validator<Prisma.MoodEntrySelect>()({
  id: true,
  authorId: true,
  entryDate: true,
  mood: true,
  note: true,
  visibleToPartner: true,
  wantsResponse: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export type MoodEntryRecord = Prisma.MoodEntryGetPayload<{
  select: typeof moodEntrySelect;
}>;

export type MoodEntryView = {
  id: string;
  version: number;
  author: UserSummary;
  entryDate: string;
  mood: string;
  note: string | null;
  visibleToPartner: boolean;
  wantsResponse: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyMoodsResponse = {
  month: string;
  mine: MoodEntryView[];
  partner: MoodEntryView[];
};

function member(couple: CoupleSummary, userId: string): UserSummary {
  const result = couple.members.find((candidate) => candidate.id === userId);
  if (!result) throw new Error("Mood entry references a non-member user");
  return result;
}

export function toMoodEntryView(
  entry: MoodEntryRecord,
  couple: CoupleSummary,
): MoodEntryView {
  return {
    id: entry.id,
    version: entry.version,
    author: member(couple, entry.authorId),
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    mood: entry.mood,
    note: entry.note,
    visibleToPartner: entry.visibleToPartner,
    wantsResponse: entry.wantsResponse,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

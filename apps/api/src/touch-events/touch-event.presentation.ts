import { Prisma, type TouchEventKind } from "@prisma/client";

export const touchEventSelect = Prisma.validator<Prisma.TouchEventSelect>()({
  id: true,
  senderId: true,
  recipientId: true,
  kind: true,
  createdAt: true,
  deliveredAt: true,
  readAt: true,
});

export type TouchEventRecord = Prisma.TouchEventGetPayload<{
  select: typeof touchEventSelect;
}>;

export type TouchEventView = {
  id: string;
  kind: TouchEventKind;
  direction: "SENT" | "RECEIVED";
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export function toTouchEventView(
  event: TouchEventRecord,
  actorId: string,
): TouchEventView {
  return {
    id: event.id,
    kind: event.kind,
    direction: event.senderId === actorId ? "SENT" : "RECEIVED",
    createdAt: event.createdAt.toISOString(),
    deliveredAt: event.deliveredAt?.toISOString() ?? null,
    readAt: event.readAt?.toISOString() ?? null,
  };
}

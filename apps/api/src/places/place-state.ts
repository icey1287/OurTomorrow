import {
  PlaceFutureState,
  PlaceHistoryState,
  PlaceStatus,
  PlanStatus,
  WishStatus,
} from "@prisma/client";

export type PlaceStateSnapshot = {
  status: PlaceStatus;
  historyState: PlaceHistoryState;
  futureState: PlaceFutureState;
  firstVisitedAt: Date | null;
};

export type PlaceStateInput = {
  status?: PlaceStatus;
  historyState?: PlaceHistoryState;
  futureState?: PlaceFutureState;
};

export type PlaceAssociationStates = {
  wishes: readonly WishStatus[];
  plans: readonly PlanStatus[];
};

const FUTURE_PRIORITY = {
  [PlaceFutureState.NONE]: 0,
  [PlaceFutureState.WANT_TO_GO]: 1,
  [PlaceFutureState.PLANNED]: 2,
  [PlaceFutureState.DEPARTING]: 3,
  [PlaceFutureState.COMPLETED]: 4,
} satisfies Record<PlaceFutureState, number>;

export function dimensionsForLegacyPlaceStatus(status: PlaceStatus): {
  historyState: PlaceHistoryState;
  futureState: PlaceFutureState;
} {
  switch (status) {
    case PlaceStatus.LIVED:
      return {
        historyState: PlaceHistoryState.LIVED,
        futureState: PlaceFutureState.NONE,
      };
    case PlaceStatus.VISITED:
    case PlaceStatus.FIRST_TIME:
      return {
        historyState: PlaceHistoryState.VISITED,
        futureState: PlaceFutureState.NONE,
      };
    case PlaceStatus.WANT_TO_GO:
      return {
        historyState: PlaceHistoryState.UNVISITED,
        futureState: PlaceFutureState.WANT_TO_GO,
      };
    case PlaceStatus.PLANNED:
      return {
        historyState: PlaceHistoryState.UNVISITED,
        futureState: PlaceFutureState.PLANNED,
      };
    case PlaceStatus.DEPARTING:
      return {
        historyState: PlaceHistoryState.UNVISITED,
        futureState: PlaceFutureState.DEPARTING,
      };
    case PlaceStatus.COMPLETED:
      return {
        historyState: PlaceHistoryState.VISITED,
        futureState: PlaceFutureState.COMPLETED,
      };
  }
}

export function legacyStatusForDimensions(
  historyState: PlaceHistoryState,
  futureState: PlaceFutureState,
): PlaceStatus {
  switch (futureState) {
    case PlaceFutureState.WANT_TO_GO:
      return PlaceStatus.WANT_TO_GO;
    case PlaceFutureState.PLANNED:
      return PlaceStatus.PLANNED;
    case PlaceFutureState.DEPARTING:
      return PlaceStatus.DEPARTING;
    case PlaceFutureState.COMPLETED:
      return PlaceStatus.COMPLETED;
    case PlaceFutureState.NONE:
      if (historyState === PlaceHistoryState.LIVED) return PlaceStatus.LIVED;
      if (historyState === PlaceHistoryState.VISITED) {
        return PlaceStatus.VISITED;
      }
      // The legacy enum cannot express a neutral, unvisited place. Keeping it
      // as WANT_TO_GO is the least surprising projection for older clients.
      return PlaceStatus.WANT_TO_GO;
  }
}

export function resolvePlaceStateInput(
  current: PlaceStateSnapshot,
  input: PlaceStateInput,
): PlaceStateSnapshot {
  const legacyDimensions =
    input.status === undefined
      ? {
          historyState: current.historyState,
          futureState: current.futureState,
        }
      : dimensionsForLegacyPlaceStatus(input.status);
  const historyState = input.historyState ?? legacyDimensions.historyState;
  const futureState = input.futureState ?? legacyDimensions.futureState;
  const hasExplicitDimension =
    input.historyState !== undefined || input.futureState !== undefined;

  return {
    status:
      input.status !== undefined && !hasExplicitDimension
        ? input.status
        : legacyStatusForDimensions(historyState, futureState),
    historyState,
    futureState,
    firstVisitedAt: current.firstVisitedAt,
  };
}

export function strongestFutureState(
  states: readonly PlaceFutureState[],
): PlaceFutureState {
  return states.reduce<PlaceFutureState>(
    (strongest, candidate) =>
      FUTURE_PRIORITY[candidate] > FUTURE_PRIORITY[strongest]
        ? candidate
        : strongest,
    PlaceFutureState.NONE,
  );
}

export function activeFutureStateForAssociations({
  wishes,
  plans,
}: PlaceAssociationStates): PlaceFutureState {
  const states: PlaceFutureState[] = [];
  for (const status of wishes) {
    if (status === WishStatus.IDEA) {
      states.push(PlaceFutureState.WANT_TO_GO);
    } else if (status === WishStatus.PLANNED) {
      states.push(PlaceFutureState.PLANNED);
    } else if (status === WishStatus.IN_PROGRESS) {
      states.push(PlaceFutureState.DEPARTING);
    }
  }
  for (const status of plans) {
    if (status === PlanStatus.DRAFT || status === PlanStatus.SCHEDULED) {
      states.push(PlaceFutureState.PLANNED);
    } else if (status === PlanStatus.IN_PROGRESS) {
      states.push(PlaceFutureState.DEPARTING);
    }
  }
  return strongestFutureState(states);
}

export function completePlaceState(
  current: PlaceStateSnapshot,
  completedAt: Date,
  competingFutureState: PlaceFutureState = PlaceFutureState.NONE,
): PlaceStateSnapshot {
  const historyState =
    current.historyState === PlaceHistoryState.LIVED
      ? PlaceHistoryState.LIVED
      : PlaceHistoryState.VISITED;
  const futureState =
    competingFutureState === PlaceFutureState.NONE
      ? PlaceFutureState.COMPLETED
      : competingFutureState;
  return {
    status: legacyStatusForDimensions(historyState, futureState),
    historyState,
    futureState,
    firstVisitedAt: current.firstVisitedAt ?? completedAt,
  };
}

export function reopenPlaceState(
  current: PlaceStateSnapshot,
  competingFutureState: PlaceFutureState = PlaceFutureState.NONE,
): PlaceStateSnapshot {
  const futureState = strongestFutureState([
    PlaceFutureState.PLANNED,
    competingFutureState,
  ]);
  return {
    status: legacyStatusForDimensions(current.historyState, futureState),
    historyState: current.historyState,
    futureState,
    firstVisitedAt: current.firstVisitedAt,
  };
}

export function patchPlaceState(
  current: PlaceStateSnapshot,
  input: Pick<PlaceStateInput, "historyState" | "futureState">,
  now: Date,
): PlaceStateSnapshot {
  const resolved = resolvePlaceStateInput(current, input);
  if (resolved.futureState !== PlaceFutureState.COMPLETED) return resolved;
  return completePlaceState(
    { ...resolved, firstVisitedAt: current.firstVisitedAt },
    now,
  );
}

import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  requestId: string,
  operation: () => T,
): T {
  return requestContext.run({ requestId }, operation);
}

export function currentRequestId(): string | null {
  return requestContext.getStore()?.requestId ?? null;
}

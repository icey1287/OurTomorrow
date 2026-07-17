import { describe, expect, it, vi } from "vitest";

import { createPrivacyCurtainController } from "./privacy";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("privacy curtain", () => {
  it("clears private state and keeps covering until identity refresh succeeds", async () => {
    const refresh = deferred();
    const order: string[] = [];
    const curtain = createPrivacyCurtainController({
      clearPrivateState: () => order.push("clear"),
      hasIdentity: () => true,
      isForeground: () => true,
      refreshIdentity: () => {
        order.push("refresh");
        return refresh.promise;
      },
    });

    curtain.conceal();
    const restoring = curtain.restore();

    expect(curtain.covered.value).toBe(true);
    expect(curtain.restoring.value).toBe(true);
    expect(order).toEqual(["clear", "refresh"]);

    refresh.resolve();
    await restoring;

    expect(curtain.covered.value).toBe(false);
    expect(curtain.restoring.value).toBe(false);
  });

  it("keeps the curtain on refresh failure and allows an explicit retry", async () => {
    const refreshIdentity = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const curtain = createPrivacyCurtainController({
      clearPrivateState: vi.fn(),
      hasIdentity: () => true,
      isForeground: () => true,
      refreshIdentity,
    });

    curtain.conceal();
    await curtain.restore();

    expect(curtain.covered.value).toBe(true);
    expect(curtain.errorMessage.value).toContain("仍保持遮盖");

    await curtain.restore();

    expect(refreshIdentity).toHaveBeenCalledTimes(2);
    expect(curtain.covered.value).toBe(false);
  });

  it("does not refresh an unselected identity but still clears private state", async () => {
    const clearPrivateState = vi.fn();
    const refreshIdentity = vi.fn();
    const curtain = createPrivacyCurtainController({
      clearPrivateState,
      hasIdentity: () => false,
      isForeground: () => true,
      refreshIdentity,
    });

    curtain.conceal();
    await curtain.restore();

    expect(clearPrivateState).toHaveBeenCalledOnce();
    expect(refreshIdentity).not.toHaveBeenCalled();
    expect(curtain.covered.value).toBe(false);
  });

  it("never uncovers when the page is hidden again during refresh", async () => {
    const refresh = deferred();
    let foreground = true;
    const curtain = createPrivacyCurtainController({
      clearPrivateState: vi.fn(),
      hasIdentity: () => true,
      isForeground: () => foreground,
      refreshIdentity: () => refresh.promise,
    });

    curtain.conceal();
    const restoring = curtain.restore();
    foreground = false;
    curtain.conceal();
    refresh.resolve();
    await restoring;

    expect(curtain.covered.value).toBe(true);
  });
});

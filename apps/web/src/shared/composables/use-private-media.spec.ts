import { effectScope, ref, type Ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stageTwoApi } from "@/shared/api/stage-two";
import {
  revokeAllPrivateMediaUrls,
  usePrivateMedia,
} from "@/shared/composables/use-private-media";

afterEach(() => {
  revokeAllPrivateMediaUrls();
  vi.restoreAllMocks();
});

describe("private media object URLs", () => {
  it("fetches through the identity-aware client and revokes on scope disposal", async () => {
    vi.spyOn(stageTwoApi, "privateMedia").mockResolvedValue(
      new Blob(["private-image"], { type: "image/webp" }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-1");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const source = ref("/media/asset-1/thumbnail");
    const scope = effectScope();
    let objectUrl: Ref<string | null> | undefined;

    scope.run(() => {
      objectUrl = usePrivateMedia(source).objectUrl;
    });

    await vi.waitFor(() => expect(objectUrl?.value).toBe("blob:private-1"));
    expect(stageTwoApi.privateMedia).toHaveBeenCalledWith(
      "/media/asset-1/thumbnail",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    scope.stop();
    expect(revoke).toHaveBeenCalledWith("blob:private-1");
  });

  it("can revoke every active URL before switching identities", async () => {
    vi.spyOn(stageTwoApi, "privateMedia").mockResolvedValue(
      new Blob(["private-image"], { type: "image/webp" }),
    );
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:boy")
      .mockReturnValueOnce("blob:girl");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const firstScope = effectScope();
    const secondScope = effectScope();

    firstScope.run(() => usePrivateMedia(ref("/media/asset-1")));
    secondScope.run(() => usePrivateMedia(ref("/media/asset-2")));
    await vi.waitFor(() =>
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2),
    );

    revokeAllPrivateMediaUrls();
    expect(revoke).toHaveBeenCalledWith("blob:boy");
    expect(revoke).toHaveBeenCalledWith("blob:girl");

    firstScope.stop();
    secondScope.stop();
  });

  it("waits for a lazy-load signal before fetching bytes", async () => {
    const fetchMedia = vi
      .spyOn(stageTwoApi, "privateMedia")
      .mockResolvedValue(new Blob(["private-image"], { type: "image/webp" }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:lazy");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const enabled = ref(false);
    const scope = effectScope();

    scope.run(() => usePrivateMedia(ref("/media/lazy"), enabled));
    await Promise.resolve();
    expect(fetchMedia).not.toHaveBeenCalled();

    enabled.value = true;
    await vi.waitFor(() => expect(fetchMedia).toHaveBeenCalledTimes(1));
    scope.stop();
  });
});

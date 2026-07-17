import {
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";

import { stageTwoApi } from "@/shared/api/stage-two";

const activePrivateMediaUrls = new Set<string>();

export function revokeAllPrivateMediaUrls() {
  for (const url of activePrivateMediaUrls) URL.revokeObjectURL(url);
  activePrivateMediaUrls.clear();
}

export function usePrivateMedia(
  source: MaybeRefOrGetter<string | null | undefined>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const objectUrl = ref<string | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref<string | null>(null);
  let ownedObjectUrl: string | null = null;
  let activeController: AbortController | null = null;
  let generation = 0;

  function revoke() {
    if (ownedObjectUrl) {
      URL.revokeObjectURL(ownedObjectUrl);
      activePrivateMediaUrls.delete(ownedObjectUrl);
    }
    ownedObjectUrl = null;
    objectUrl.value = null;
  }

  async function load(path = toValue(source), isEnabled = toValue(enabled)) {
    const currentGeneration = ++generation;
    activeController?.abort();
    activeController = null;
    revoke();
    errorMessage.value = null;

    if (!path || !isEnabled) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    const controller = new AbortController();
    activeController = controller;

    try {
      const blob = await stageTwoApi.privateMedia(path, {
        signal: controller.signal,
      });
      if (currentGeneration !== generation) return;

      ownedObjectUrl = URL.createObjectURL(blob);
      activePrivateMediaUrls.add(ownedObjectUrl);
      objectUrl.value = ownedObjectUrl;
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (error instanceof Error && error.name === "AbortError") return;
      errorMessage.value =
        error instanceof Error ? error.message : "照片暂时没有打开。";
    } finally {
      if (currentGeneration === generation) {
        activeController = null;
        isLoading.value = false;
      }
    }
  }

  watch(
    [() => toValue(source), () => toValue(enabled)],
    ([path, isEnabled]) => void load(path, isEnabled),
    { immediate: true },
  );

  onScopeDispose(() => {
    generation += 1;
    activeController?.abort();
    activeController = null;
    revoke();
  });

  return { objectUrl, isLoading, errorMessage, reload: load };
}

import { readonly, ref } from "vue";

export type PrivacyCurtainDependencies = {
  clearPrivateState: () => void;
  hasIdentity: () => boolean;
  isForeground: () => boolean;
  refreshIdentity: () => Promise<unknown>;
};

export function createPrivacyCurtainController(
  dependencies: PrivacyCurtainDependencies,
) {
  const covered = ref(false);
  const restoring = ref(false);
  const errorMessage = ref<string | null>(null);
  let generation = 0;
  let restorePromise: Promise<void> | null = null;

  function conceal() {
    generation += 1;
    covered.value = true;
    errorMessage.value = null;
  }

  async function restore(): Promise<void> {
    if (!covered.value || !dependencies.isForeground()) return;
    if (restorePromise) return restorePromise;

    const restoreGeneration = generation;
    restoring.value = true;
    errorMessage.value = null;
    let restored = false;

    restorePromise = (async () => {
      dependencies.clearPrivateState();
      if (dependencies.hasIdentity()) {
        await dependencies.refreshIdentity();
      }
      restored = true;
      if (restoreGeneration === generation && dependencies.isForeground()) {
        covered.value = false;
      }
    })()
      .catch(() => {
        errorMessage.value =
          "暂时无法重新确认当前身份。请联网后再试，私密内容仍保持遮盖。";
      })
      .finally(() => {
        restoring.value = false;
        restorePromise = null;
      });

    await restorePromise;

    if (
      restored &&
      covered.value &&
      dependencies.isForeground() &&
      restoreGeneration !== generation
    ) {
      await restore();
    }
  }

  return {
    covered: readonly(covered),
    restoring: readonly(restoring),
    errorMessage: readonly(errorMessage),
    conceal,
    restore,
  };
}

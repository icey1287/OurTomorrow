<script setup lang="ts">
import { EyeOff, RefreshCw } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { RouterView } from "vue-router";

import { queryClient } from "@/app/query-client";
import BaseButton from "@/shared/components/BaseButton.vue";
import { revokeAllPrivateMediaUrls } from "@/shared/composables/use-private-media";
import { createPrivacyCurtainController } from "@/shared/pwa/privacy";
import { clearPwaPrivateData } from "@/shared/pwa/pwa";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const privacy = createPrivacyCurtainController({
  clearPrivateState: () => {
    queryClient.clear();
    revokeAllPrivateMediaUrls();
    clearPwaPrivateData();
  },
  hasIdentity: () => Boolean(identity.role),
  isForeground: () => document.visibilityState === "visible",
  refreshIdentity: () => identity.refreshIdentity(),
});

function setDocumentCovered(covered: boolean) {
  if (covered) {
    document.documentElement.dataset.privacyCovered = "true";
    return;
  }
  delete document.documentElement.dataset.privacyCovered;
}

function concealPrivateContent() {
  privacy.conceal();
}

function restorePrivateContent() {
  void privacy.restore();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") restorePrivateContent();
  else concealPrivateContent();
}

if (document.visibilityState !== "visible") concealPrivateContent();

const stopCoverageWatch = watch(privacy.covered, setDocumentCovered, {
  immediate: true,
  flush: "sync",
});

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", concealPrivateContent);
  window.addEventListener("pageshow", restorePrivateContent);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("pagehide", concealPrivateContent);
  window.removeEventListener("pageshow", restorePrivateContent);
  stopCoverageWatch();
  setDocumentCovered(false);
});
</script>

<template>
  <div
    class="privacy-curtain fixed inset-0 z-[100] grid place-items-center bg-[#f7f5f1] px-6 text-center dark:bg-ink-950"
    :class="{ 'privacy-curtain--covered': privacy.covered.value }"
    :aria-hidden="privacy.covered.value ? undefined : 'true'"
    :aria-modal="privacy.covered.value ? 'true' : undefined"
    :role="privacy.covered.value ? 'dialog' : undefined"
  >
    <div class="max-w-sm">
      <span
        class="mx-auto grid size-14 place-items-center rounded-3xl bg-white text-ink-700 shadow-card dark:bg-white/10 dark:text-white"
        aria-hidden="true"
      >
        <EyeOff class="size-6" />
      </span>
      <h1
        class="mt-5 font-display text-2xl font-semibold text-ink-950 dark:text-white"
      >
        私密内容已遮盖
      </h1>
      <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
        {{
          privacy.errorMessage.value ||
          (privacy.restoring.value
            ? "正在重新确认当前身份…"
            : "回到明天后，我们会重新加载两个人的内容。")
        }}
      </p>
      <BaseButton
        v-if="privacy.errorMessage.value"
        class="mt-5"
        :loading="privacy.restoring.value"
        @click="restorePrivateContent"
      >
        <RefreshCw class="size-4" />重新尝试
      </BaseButton>
    </div>
  </div>

  <div
    :aria-hidden="privacy.covered.value ? 'true' : undefined"
    :inert="privacy.covered.value"
  >
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <component
          :is="Component"
          :key="route.meta.transitionKey ?? route.path"
        />
      </Transition>
    </RouterView>
  </div>
</template>

<style scoped>
.privacy-curtain {
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
}

.privacy-curtain--covered,
:global(html[data-privacy-covered="true"]) .privacy-curtain {
  pointer-events: auto;
  visibility: visible;
  opacity: 1;
}
</style>

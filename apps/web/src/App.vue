<script setup lang="ts">
import { EyeOff, RefreshCw } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { RouterView } from "vue-router";

import { queryClient } from "@/app/query-client";
import { coupleEmblem, microLily } from "@/shared/assets/romantic";
import { createPrivacyCurtainController } from "@/shared/pwa/privacy";
import { clearPwaPrivateData } from "@/shared/pwa/pwa";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const privacy = createPrivacyCurtainController({
  clearPrivateState: () => {
    queryClient.clear();
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
    class="privacy-curtain fixed inset-0 z-[100] grid place-items-center bg-[#f5ecd9] px-6 text-center"
    :class="{ 'privacy-curtain--covered': privacy.covered.value }"
    :aria-hidden="privacy.covered.value ? undefined : 'true'"
    :aria-modal="privacy.covered.value ? 'true' : undefined"
    :role="privacy.covered.value ? 'dialog' : undefined"
  >
    <div class="privacy-paper">
      <img
        class="privacy-emblem"
        :src="coupleEmblem"
        alt=""
        aria-hidden="true"
      />
      <span class="privacy-eye" aria-hidden="true"
        ><EyeOff class="size-5"
      /></span>
      <h1>手账暂时合上了</h1>
      <p>
        {{
          privacy.errorMessage.value ||
          (privacy.restoring.value
            ? "正在重新认出翻开它的人…"
            : "回到这里时，我们会重新确认身份，再把纸页交还给你。")
        }}
      </p>
      <button
        v-if="privacy.errorMessage.value"
        type="button"
        :disabled="privacy.restoring.value"
        @click="restorePrivateContent"
      >
        <RefreshCw class="size-4" />{{
          privacy.restoring.value ? "正在重试…" : "重新翻开"
        }}
      </button>
      <img class="privacy-lily" :src="microLily" alt="" aria-hidden="true" />
    </div>
  </div>

  <div
    :aria-hidden="privacy.covered.value ? 'true' : undefined"
    :inert="privacy.covered.value"
  >
    <RouterView v-slot="{ Component, route }">
      <Transition :name="route.meta.transitionName ?? 'page'" mode="out-in">
        <component :is="Component" :key="route.path" />
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

.privacy-paper {
  position: relative;
  width: min(100%, 330px);
  border: 1px solid rgb(104 73 54 / 0.16);
  background: #fff8e8;
  padding: 34px 24px 31px;
  color: #443229;
  box-shadow: 6px 7px 0 rgb(79 52 36 / 0.09);
  transform: rotate(-0.45deg);
}

.privacy-emblem {
  width: 126px;
  margin: -22px auto -12px;
  filter: drop-shadow(2px 5px 4px rgb(68 45 32 / 0.14));
}

.privacy-eye {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin: 0 auto;
  border: 1px solid rgb(102 70 51 / 0.16);
  border-radius: 50%;
  background: #efe1c8;
  color: #815848;
}

.privacy-paper h1 {
  margin: 15px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 25px;
  letter-spacing: -0.04em;
}

.privacy-paper p {
  margin: 10px 0 0;
  color: #786052;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
  line-height: 1.65;
}

.privacy-paper button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  gap: 6px;
  margin-top: 18px;
  border: 1px solid rgb(74 50 37 / 0.22);
  border-radius: 3px;
  background: #a6534c;
  padding: 0 16px;
  color: #fff8e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
  font-weight: 700;
}

.privacy-lily {
  position: absolute;
  right: -25px;
  bottom: -22px;
  width: 79px;
  opacity: 0.35;
  transform: rotate(-7deg);
}
</style>

<script setup lang="ts">
import type { IdentityRole, ThemePreference } from "@our-tomorrow/contracts";
import {
  BadgeCheck,
  Check,
  Mars,
  Monitor,
  Moon,
  Palette,
  Pencil,
  RefreshCw,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
  Venus,
  ZapOff,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";

import { apiFieldErrors, ApiClientError } from "@/shared/api/client";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";
import { type MotionPreference, useThemeStore } from "@/shared/stores/theme";
import {
  type FieldErrors,
  validateRequiredText,
} from "@/shared/utils/profile-validation";

type ProfileField = "displayName" | "nicknameInRelationship";

const router = useRouter();
const identity = useIdentityStore();
const theme = useThemeStore();

const profile = reactive({
  displayName: "",
  nicknameInRelationship: "",
});
const profileErrors = ref<FieldErrors<ProfileField>>({});
const profileRequestError = ref<string | null>(null);
const profileSavedMessage = ref<string | null>(null);
const savingProfile = ref(false);
const savingTheme = ref<ThemePreference | null>(null);
const themeError = ref<string | null>(null);
const switchingRole = ref<IdentityRole | null>(null);
const refreshingIdentity = ref(false);
const identityActionError = ref<string | null>(null);

const currentRoleLabel = computed(() =>
  identity.role === "boy"
    ? "男生"
    : identity.role === "girl"
      ? "女生"
      : "未选择",
);
const nextRole = computed<IdentityRole>(() =>
  identity.role === "boy" ? "girl" : "boy",
);
const nextRoleLabel = computed(() =>
  nextRole.value === "boy" ? "男生" : "女生",
);

const themeOptions: Array<{
  id: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    id: "system",
    label: "跟随系统",
    description: "随设备外观切换",
    icon: Monitor,
  },
  { id: "light", label: "晨光", description: "温暖、清晰的浅色", icon: Sun },
  { id: "dark", label: "深夜", description: "私密、克制的深色", icon: Moon },
];

const motionOptions: Array<{ id: MotionPreference; label: string }> = [
  { id: "system", label: "跟随系统" },
  { id: "reduce", label: "减少动效" },
  { id: "full", label: "完整动效" },
];

function validateProfile() {
  const nextErrors: FieldErrors<ProfileField> = {};
  const displayNameError = validateRequiredText(
    profile.displayName,
    "显示名称",
    100,
  );
  if (displayNameError) nextErrors.displayName = displayNameError;
  if (profile.nicknameInRelationship.trim().length > 100) {
    nextErrors.nicknameInRelationship = "关系里的称呼不能超过 100 个字符。";
  }
  profileErrors.value = nextErrors;
  return Object.keys(nextErrors).length === 0;
}

async function saveProfile() {
  const user = identity.user;
  if (!user || savingProfile.value || !validateProfile()) return;
  savingProfile.value = true;
  profileRequestError.value = null;
  profileSavedMessage.value = null;

  try {
    await identity.updateProfile({
      version: user.version,
      displayName: profile.displayName.trim(),
      nicknameInRelationship: profile.nicknameInRelationship.trim() || null,
    });
    profileSavedMessage.value = "个人资料已保存。";
  } catch (error) {
    if (error instanceof ApiClientError) {
      profileErrors.value = {
        ...profileErrors.value,
        ...apiFieldErrors(error),
      };
      profileRequestError.value =
        error.code === "STATE_CONFLICT"
          ? "资料刚刚在另一处更新，请刷新后再修改。"
          : error.code === "VALIDATION_FAILED"
            ? "有些内容需要修改，请查看表单提示。"
            : error.message;
    } else {
      profileRequestError.value = "个人资料没有保存成功，请稍后再试。";
    }
  } finally {
    savingProfile.value = false;
  }
}

async function saveTheme(preference: ThemePreference) {
  const couple = identity.couple;
  if (!couple || savingTheme.value) return;
  if (couple.theme === preference) {
    theme.setPreference(preference);
    return;
  }

  savingTheme.value = preference;
  themeError.value = null;

  try {
    const updatedCouple = await identity.updateCouple({
      version: couple.version,
      theme: preference,
    });
    theme.setPreference(updatedCouple.theme);
  } catch (error) {
    themeError.value =
      error instanceof ApiClientError && error.code === "STATE_CONFLICT"
        ? "主题刚刚在另一处更新，请刷新后重试。"
        : error instanceof Error
          ? error.message
          : "主题没有保存成功，请稍后再试。";
  } finally {
    savingTheme.value = null;
  }
}

async function switchIdentity() {
  if (switchingRole.value) return;
  switchingRole.value = nextRole.value;
  identityActionError.value = null;

  try {
    await identity.selectRole(nextRole.value);
    await router.replace("/today");
  } catch (error) {
    identityActionError.value =
      error instanceof Error ? error.message : "身份切换没有成功。";
  } finally {
    switchingRole.value = null;
  }
}

async function retryIdentity() {
  if (refreshingIdentity.value) return;
  refreshingIdentity.value = true;
  identityActionError.value = null;
  try {
    await identity.refreshIdentity();
  } catch (error) {
    identityActionError.value =
      error instanceof Error ? error.message : "身份资料没有恢复成功。";
  } finally {
    refreshingIdentity.value = false;
  }
}

async function clearCachedIdentity() {
  identity.clearIdentity();
  await router.replace("/login");
}

watch(
  () => identity.user,
  (user) => {
    if (!user) return;
    profile.displayName = user.displayName;
    profile.nicknameInRelationship = user.nicknameInRelationship ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Settings · 当前浏览器"
      title="管理身份、资料与共同外观。"
      description="身份选择保存在当前浏览器；共同资料仍由服务器保存。"
    />

    <div
      v-if="identity.errorMessage && !identity.identity"
      class="mb-5 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <span>{{ identity.errorMessage }}</span>
      <BaseButton
        variant="secondary"
        size="sm"
        :loading="refreshingIdentity"
        @click="retryIdentity"
      >
        <RefreshCw class="size-4" />重新加载身份
      </BaseButton>
    </div>

    <section class="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div class="space-y-5">
        <SurfaceCard>
          <div class="flex items-center gap-4">
            <span
              class="grid size-12 place-items-center rounded-2xl bg-ink-950 text-lg font-semibold text-white dark:bg-white dark:text-ink-950"
            >
              {{ (identity.user?.displayName ?? "我").slice(0, 1) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-ink-950 dark:text-white">
                {{ identity.user?.displayName || "身份资料加载中" }}
              </p>
              <p class="mt-1 truncate text-xs text-ink-400 dark:text-ink-500">
                当前选择：{{ currentRoleLabel }}
              </p>
            </div>
            <UserRound class="size-5 text-ink-300 dark:text-ink-600" />
          </div>

          <form class="mt-6 space-y-4" novalidate @submit.prevent="saveProfile">
            <div>
              <label class="field-label" for="settings-display-name"
                >显示名称</label
              >
              <input
                id="settings-display-name"
                v-model="profile.displayName"
                class="field-input"
                autocomplete="name"
                maxlength="100"
                :disabled="!identity.user"
                :aria-invalid="Boolean(profileErrors.displayName)"
                :aria-describedby="
                  profileErrors.displayName
                    ? 'settings-display-name-error'
                    : undefined
                "
              />
              <p
                v-if="profileErrors.displayName"
                id="settings-display-name-error"
                class="mt-2 text-sm text-red-600 dark:text-red-300"
              >
                {{ profileErrors.displayName }}
              </p>
            </div>
            <div>
              <label class="field-label" for="settings-nickname"
                >关系里的称呼
                <span class="font-normal text-ink-400">（可留空）</span></label
              >
              <input
                id="settings-nickname"
                v-model="profile.nicknameInRelationship"
                class="field-input"
                maxlength="100"
                :disabled="!identity.user"
                :aria-invalid="Boolean(profileErrors.nicknameInRelationship)"
                :aria-describedby="
                  profileErrors.nicknameInRelationship
                    ? 'settings-nickname-error'
                    : undefined
                "
              />
              <p
                v-if="profileErrors.nicknameInRelationship"
                id="settings-nickname-error"
                class="mt-2 text-sm text-red-600 dark:text-red-300"
              >
                {{ profileErrors.nicknameInRelationship }}
              </p>
            </div>
            <div
              v-if="profileRequestError"
              class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
              role="alert"
            >
              {{ profileRequestError }}
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p
                class="text-sm text-present-700 dark:text-present-300"
                role="status"
                aria-live="polite"
              >
                {{ profileSavedMessage }}
              </p>
              <BaseButton
                type="submit"
                size="sm"
                :loading="savingProfile"
                :disabled="!identity.user"
                ><Check class="size-4" />保存个人资料</BaseButton
              >
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-start gap-3">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
              ><UsersRound class="size-4"
            /></span>
            <SectionHeading
              title="共同空间"
              description="关系名称、签名、开始日期和时区由两个人共享。"
            />
          </div>
          <dl
            class="mt-5 space-y-3 rounded-2xl bg-ink-50/70 p-4 text-sm dark:bg-white/[0.03]"
          >
            <div class="flex justify-between gap-4">
              <dt class="text-ink-400">空间</dt>
              <dd
                class="text-right font-semibold text-ink-800 dark:text-ink-100"
              >
                {{ identity.couple?.name || "加载中" }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-400">开始日期</dt>
              <dd class="text-right text-ink-700 dark:text-ink-200">
                {{ identity.couple?.startDate || "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-ink-400">时区</dt>
              <dd class="break-all text-right text-ink-700 dark:text-ink-200">
                {{ identity.couple?.timezone || "—" }}
              </dd>
            </div>
          </dl>
          <RouterLink
            to="/us?edit=relationship"
            class="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-memory-700 transition hover:bg-memory-50 dark:text-memory-300 dark:hover:bg-memory-950/30"
            ><Pencil class="size-4" />编辑共同关系资料</RouterLink
          >
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-start gap-3">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
              ><BadgeCheck class="size-4"
            /></span>
            <SectionHeading
              title="本机身份"
              description="请求通过角色请求头识别当前是两个人中的哪一位。"
            />
          </div>
          <div
            class="mt-5 rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div class="flex items-center gap-3">
              <component
                :is="identity.role === 'boy' ? Mars : Venus"
                class="size-5 text-present-600 dark:text-present-300"
              />
              <div>
                <p class="text-sm font-semibold text-ink-900 dark:text-white">
                  当前是{{ currentRoleLabel }}
                </p>
                <p
                  class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500"
                >
                  刷新页面会从 localStorage 自动恢复。
                </p>
              </div>
            </div>
          </div>
          <p
            v-if="identityActionError"
            class="mt-4 text-sm text-red-600 dark:text-red-300"
            role="alert"
          >
            {{ identityActionError }}
          </p>
          <div class="mt-5 flex flex-col gap-3 sm:flex-row">
            <BaseButton
              variant="secondary"
              :loading="switchingRole === nextRole"
              @click="switchIdentity"
              ><RefreshCw class="size-4" />切换为{{ nextRoleLabel }}</BaseButton
            >
            <BaseButton
              variant="ghost"
              :disabled="Boolean(switchingRole)"
              @click="clearCachedIdentity"
              ><Trash2 class="size-4" />清除本机身份缓存</BaseButton
            >
          </div>
          <p class="mt-3 text-xs leading-5 text-ink-400 dark:text-ink-500">
            清除缓存不会删除服务器上的共同资料，下次进入时只需重新选择身份。
          </p>
        </SurfaceCard>
      </div>

      <div class="space-y-5">
        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
              ><Palette class="size-4"
            /></span>
            <SectionHeading
              title="共同主题"
              description="主题保存到情侣空间，两个人会看到同一选择。"
            />
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              v-for="option in themeOptions"
              :key="option.id"
              type="button"
              class="relative rounded-2xl border p-4 text-left transition disabled:cursor-wait disabled:opacity-60"
              :class="
                identity.couple?.theme === option.id
                  ? 'border-present-300 bg-present-50 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/30 dark:ring-present-900/30'
                  : 'border-ink-200/80 bg-white/55 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              "
              :disabled="Boolean(savingTheme) || !identity.couple"
              :aria-pressed="identity.couple?.theme === option.id"
              @click="saveTheme(option.id)"
            >
              <component
                :is="option.icon"
                class="size-5 text-ink-600 dark:text-ink-300"
              />
              <p
                class="mt-4 text-sm font-semibold text-ink-950 dark:text-white"
              >
                {{ option.label }}
              </p>
              <p class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500">
                {{ option.description }}
              </p>
              <span
                v-if="savingTheme === option.id"
                class="absolute right-3 top-3 size-4 animate-spin rounded-full border-2 border-present-500 border-t-transparent"
                aria-label="正在保存主题"
              />
            </button>
          </div>
          <p
            v-if="themeError"
            class="mt-4 text-sm text-red-600 dark:text-red-300"
            role="alert"
          >
            {{ themeError }}
          </p>

          <div class="quiet-divider my-6" />
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex items-start gap-3">
              <ZapOff class="mt-0.5 size-4 text-ink-400" />
              <div>
                <p class="text-sm font-semibold text-ink-900 dark:text-white">
                  本设备动态效果
                </p>
                <p
                  class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500"
                >
                  这是无障碍设备偏好，只保存在当前浏览器。
                </p>
              </div>
            </div>
            <div
              class="inline-flex self-start rounded-xl bg-ink-100/75 p-1 dark:bg-white/[0.06] sm:self-auto"
            >
              <button
                v-for="option in motionOptions"
                :key="option.id"
                type="button"
                class="rounded-lg px-3 py-2 text-xs font-semibold transition"
                :class="
                  theme.motionPreference === option.id
                    ? 'bg-white text-ink-950 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-ink-400 hover:text-ink-700 dark:hover:text-ink-200'
                "
                :aria-pressed="theme.motionPreference === option.id"
                @click="theme.setMotionPreference(option.id)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading
            title="两位固定成员"
            description="男生与女生两个身份始终对应同一个情侣空间。"
          />
          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <article
              v-for="member in identity.couple?.members ?? []"
              :key="member.id"
              class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <component
                :is="member.role === 'boy' ? Mars : Venus"
                class="size-5 text-ink-400"
              />
              <p
                class="mt-3 text-sm font-semibold text-ink-900 dark:text-white"
              >
                {{ member.nicknameInRelationship || member.displayName }}
              </p>
              <p class="mt-1 text-xs text-ink-400 dark:text-ink-500">
                {{ member.role === "boy" ? "男生" : "女生" }} ·
                {{ member.displayName }}
              </p>
            </article>
          </div>
        </SurfaceCard>
      </div>
    </section>
  </main>
</template>

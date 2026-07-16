<script setup lang="ts">
import type { ThemePreference } from "@our-tomorrow/contracts";
import {
  ArchiveRestore,
  BellOff,
  ChevronRight,
  DatabaseBackup,
  Download,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserRound,
  ZapOff,
} from "lucide-vue-next";
import { ref } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useSessionStore } from "@/shared/stores/session";
import { type MotionPreference, useThemeStore } from "@/shared/stores/theme";

const router = useRouter();
const session = useSessionStore();
const theme = useThemeStore();
const privateNotifications = ref(true);
const loggingOut = ref(false);

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

const motionOptions: Array<{
  id: MotionPreference;
  label: string;
}> = [
  { id: "system", label: "跟随系统" },
  { id: "reduce", label: "减少动效" },
  { id: "full", label: "完整动效" },
];

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;

  try {
    await session.logout();
    await router.replace("/login");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Settings · 掌控自己的空间"
      title="安静、私密，也始终可带走。"
      description="管理称呼、时区、主题、通知与数据。所有重要设置都明确告诉你会发生什么。"
    />

    <section class="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      <div class="space-y-5">
        <SurfaceCard>
          <div class="flex items-center gap-4">
            <span
              class="grid size-12 place-items-center rounded-2xl bg-ink-950 text-lg font-semibold text-white dark:bg-white dark:text-ink-950"
            >
              {{ (session.user?.displayName ?? "我").slice(0, 1) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-ink-950 dark:text-white">
                {{ session.user?.displayName ?? "你的资料" }}
              </p>
              <p class="mt-1 truncate text-xs text-ink-400 dark:text-ink-500">
                @{{ session.user?.username ?? "private-account" }}
              </p>
            </div>
            <UserRound class="size-5 text-ink-300 dark:text-ink-600" />
          </div>
          <button
            type="button"
            class="mt-5 flex w-full items-center justify-between rounded-2xl bg-ink-50/80 px-4 py-3 text-left text-sm font-semibold text-ink-700 transition hover:bg-ink-100 dark:bg-white/[0.04] dark:text-ink-200 dark:hover:bg-white/[0.07]"
          >
            昵称与头像
            <ChevronRight class="size-4 text-ink-300 dark:text-ink-600" />
          </button>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading title="共同空间" />
          <div class="mt-4 space-y-1">
            <button
              v-for="item in [
                '双方称呼',
                '关系签名与封面',
                '开始日期',
                '共同空间时区',
              ]"
              :key="item"
              type="button"
              class="flex w-full items-center justify-between rounded-xl px-2 py-3 text-left text-sm text-ink-600 transition hover:bg-ink-50 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/[0.04] dark:hover:text-white"
            >
              {{ item }}
              <ChevronRight class="size-4 text-ink-300 dark:text-ink-600" />
            </button>
          </div>
        </SurfaceCard>
      </div>

      <div class="space-y-5">
        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
            >
              <Palette class="size-4" />
            </span>
            <SectionHeading
              title="外观"
              description="三个时间维度各有气质，但始终属于同一套视觉语言。"
            />
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              v-for="option in themeOptions"
              :key="option.id"
              type="button"
              class="rounded-2xl border p-4 text-left transition"
              :class="
                theme.preference === option.id
                  ? 'border-present-300 bg-present-50 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/30 dark:ring-present-900/30'
                  : 'border-ink-200/80 bg-white/55 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              "
              @click="theme.setPreference(option.id)"
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
            </button>
          </div>

          <div class="quiet-divider my-6" />

          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex items-start gap-3">
              <ZapOff class="mt-0.5 size-4 text-ink-400" />
              <div>
                <p class="text-sm font-semibold text-ink-900 dark:text-white">
                  动态效果
                </p>
                <p
                  class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500"
                >
                  减少非必要动画，内容与交互保持完整。
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
                @click="theme.setMotionPreference(option.id)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
            >
              <ShieldCheck class="size-4" />
            </span>
            <SectionHeading
              title="隐私与通知"
              description="锁屏上默认不展示私密正文。"
            />
          </div>

          <button
            type="button"
            class="mt-5 flex w-full items-center justify-between gap-5 rounded-2xl border border-ink-200/80 bg-white/55 p-4 text-left dark:border-white/10 dark:bg-white/[0.03]"
            role="switch"
            :aria-checked="privateNotifications"
            @click="privateNotifications = !privateNotifications"
          >
            <span class="flex items-start gap-3">
              <BellOff class="mt-0.5 size-4 text-ink-400" />
              <span>
                <span
                  class="block text-sm font-semibold text-ink-900 dark:text-white"
                  >隐藏通知详情</span
                >
                <span
                  class="mt-1 block text-xs leading-5 text-ink-400 dark:text-ink-500"
                  >只显示“你收到了一条来自明天的新消息”。</span
                >
              </span>
            </span>
            <span
              class="relative h-6 w-11 shrink-0 rounded-full transition"
              :class="
                privateNotifications
                  ? 'bg-present-500'
                  : 'bg-ink-200 dark:bg-ink-700'
              "
            >
              <span
                class="absolute top-1 size-4 rounded-full bg-white shadow-sm transition"
                :class="privateNotifications ? 'left-6' : 'left-1'"
              />
            </span>
          </button>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading
            title="我的数据"
            description="可以完整导出，也可以恢复误删内容。"
          />
          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              v-for="item in [
                {
                  label: '导出全部数据',
                  note: '含格式版本清单',
                  icon: Download,
                },
                {
                  label: '回收站',
                  note: '恢复软删除内容',
                  icon: ArchiveRestore,
                },
                {
                  label: '备份状态',
                  note: '查看最近检查',
                  icon: DatabaseBackup,
                },
              ]"
              :key="item.label"
              type="button"
              class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 text-left transition hover:border-ink-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
            >
              <component
                :is="item.icon"
                class="size-4 text-ink-500 dark:text-ink-400"
              />
              <p
                class="mt-4 text-sm font-semibold text-ink-900 dark:text-white"
              >
                {{ item.label }}
              </p>
              <p class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500">
                {{ item.note }}
              </p>
            </button>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div
            class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="text-sm font-semibold text-ink-900 dark:text-white">
                退出当前设备
              </p>
              <p class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500">
                退出会删除服务器会话，不会删除你们的内容。
              </p>
            </div>
            <BaseButton
              variant="secondary"
              :loading="loggingOut"
              @click="logout"
            >
              <LogOut class="size-4" />
              安全退出
            </BaseButton>
          </div>
        </SurfaceCard>
      </div>
    </section>
  </main>
</template>

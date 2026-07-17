<script setup lang="ts">
import type {
  AnnualReviewContributionView,
  AnnualReviewView,
  MediaAssetSummary,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  BookHeart,
  Check,
  Image,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import { annualReviewApi } from "@/shared/api/stage-six-annual";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const currentYear = computed(() => {
  const timeZone = identity.couple?.timezone ?? "Asia/Shanghai";
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(),
  );
});
const firstYear = computed(() =>
  Number(identity.couple?.startDate.slice(0, 4) ?? currentYear.value),
);
const years = computed(() => {
  const result: number[] = [];
  for (let year = currentYear.value; year >= firstYear.value; year -= 1) {
    result.push(year);
  }
  return result;
});
const selectedYear = ref(currentYear.value);
watch(currentYear, (year) => {
  if (!years.value.includes(selectedYear.value)) selectedYear.value = year;
});

const reviewsQuery = useQuery({
  queryKey: computed(() => ["annual-reviews", identity.role]),
  queryFn: annualReviewApi.list,
  enabled: computed(() => Boolean(identity.role)),
  refetchInterval: (query) =>
    (query.state.data as AnnualReviewView[] | undefined)?.some(
      (review) => review.status === "GENERATING",
    )
      ? 2_000
      : false,
});
const photosQuery = useQuery({
  queryKey: computed(() => [
    "annual-review-photo-options",
    identity.role,
    selectedYear.value,
  ]),
  queryFn: () => annualReviewApi.mediaOptions(selectedYear.value),
  enabled: computed(() => Boolean(identity.role)),
});

const review = computed(
  () =>
    reviewsQuery.data.value?.find(
      (candidate) => candidate.year === selectedYear.value,
    ) ?? null,
);
const currentContribution = computed(
  () =>
    review.value?.contributions.find(
      (contribution) => contribution.role === identity.role,
    ) ?? null,
);
const availablePhotos = computed<MediaAssetSummary[]>(
  () => photosQuery.data.value ?? [],
);

const form = reactive({
  selectedMediaId: "",
  message: "",
  nextYearLetter: "",
});
const busy = ref<"generate" | "save" | "publish" | null>(null);
const notice = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

watch(
  () => [review.value?.id, review.value?.version] as const,
  () => {
    const contribution = currentContribution.value;
    form.selectedMediaId = contribution?.selectedMedia?.id ?? "";
    form.message = contribution?.message ?? "";
    form.nextYearLetter = review.value?.nextYearLetter ?? "";
  },
  { immediate: true },
);

async function refresh() {
  await reviewsQuery.refetch();
}

async function generate() {
  if (busy.value) return;
  busy.value = "generate";
  notice.value = null;
  errorMessage.value = null;
  try {
    await annualReviewApi.request(selectedYear.value);
    notice.value = "年度回忆书已经交给后台整理。";
    await queryClient.invalidateQueries({ queryKey: ["annual-reviews"] });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "年度回忆书没有开始生成。";
  } finally {
    busy.value = null;
  }
}

async function save() {
  const current = review.value;
  if (!current || busy.value) return;
  busy.value = "save";
  notice.value = null;
  errorMessage.value = null;
  try {
    await annualReviewApi.update(selectedYear.value, {
      version: current.version,
      selectedMediaId: form.selectedMediaId || null,
      message: form.message.trim() || null,
      nextYearLetter: form.nextYearLetter.trim() || null,
    });
    notice.value = "你们的年度选择已经保存。";
    await queryClient.invalidateQueries({ queryKey: ["annual-reviews"] });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "年度回忆书没有保存成功。";
  } finally {
    busy.value = null;
  }
}

async function publish() {
  const current = review.value;
  if (
    !current ||
    busy.value ||
    !window.confirm("发布后这本年度回忆书会锁定编辑，确认发布吗？")
  ) {
    return;
  }
  busy.value = "publish";
  notice.value = null;
  errorMessage.value = null;
  try {
    await annualReviewApi.publish(selectedYear.value, {
      version: current.version,
    });
    notice.value = "这一年的回忆书已经正式收藏。";
    await queryClient.invalidateQueries({ queryKey: ["annual-reviews"] });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "年度回忆书没有发布成功。";
  } finally {
    busy.value = null;
  }
}

function contributionTitle(contribution: AnnualReviewContributionView) {
  return contribution.role === "boy" ? "男生选出的这一年" : "女生选出的这一年";
}
</script>

<template>
  <section class="mt-8" aria-labelledby="annual-review-title">
    <SurfaceCard class="overflow-hidden" :padded="false">
      <div
        class="bg-gradient-to-br from-memory-50 via-white to-future-50 p-6 dark:from-memory-950/40 dark:via-ink-950 dark:to-future-950/35 sm:p-8"
      >
        <div
          class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="flex items-start gap-4">
            <span
              class="grid size-12 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/50 dark:text-memory-200"
            >
              <BookHeart class="size-5" />
            </span>
            <SectionHeading
              id="annual-review-title"
              title="年度回忆书"
              description="只汇总共同公开的回忆、地点、愿望与标签，不读取私人心情、日记、胶囊或冷静信正文。"
            />
          </div>
          <div class="flex items-center gap-2">
            <label>
              <span class="sr-only">回忆书年份</span>
              <select v-model.number="selectedYear" class="field-input py-2.5">
                <option v-for="year in years" :key="year" :value="year">
                  {{ year }} 年
                </option>
              </select>
            </label>
            <BaseButton
              size="sm"
              variant="ghost"
              :loading="reviewsQuery.isFetching.value"
              @click="refresh"
            >
              <RefreshCw class="size-4" />刷新
            </BaseButton>
          </div>
        </div>

        <p v-if="notice" class="mt-5 text-sm text-present-700" role="status">
          {{ notice }}
        </p>
        <p
          v-if="errorMessage || reviewsQuery.isError.value"
          class="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
          role="alert"
        >
          {{
            errorMessage ||
            (reviewsQuery.error.value instanceof Error
              ? reviewsQuery.error.value.message
              : "年度回忆书没有加载成功。")
          }}
        </p>

        <div
          v-if="!review"
          class="mt-6 rounded-3xl border border-dashed border-memory-300 bg-white/60 p-8 text-center dark:border-memory-800 dark:bg-white/[0.03]"
        >
          <Sparkles class="mx-auto size-6 text-memory-500" />
          <p class="mt-4 font-semibold text-ink-900 dark:text-white">
            {{ selectedYear }} 年还没有一本回忆书
          </p>
          <p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-400">
            后台会按共同空间时区整理这一年的公开回忆、足迹、完成愿望和标签。
          </p>
          <BaseButton
            class="mt-5"
            :loading="busy === 'generate'"
            @click="generate"
          >
            <BookHeart class="size-4" />生成这一年的回忆书
          </BaseButton>
        </div>

        <div
          v-else-if="
            review.status === 'GENERATING' || review.status === 'DRAFT'
          "
          class="mt-6 flex items-center gap-4 rounded-3xl bg-white/65 p-6 dark:bg-white/[0.04]"
        >
          <LoaderCircle class="size-6 animate-spin text-memory-500" />
          <div>
            <p class="font-semibold text-ink-900 dark:text-white">
              正在把 {{ review.year }} 年慢慢装订起来
            </p>
            <p class="mt-1 text-sm text-ink-400">
              页面会自动刷新，不需要一直停在这里。
            </p>
          </div>
        </div>

        <template v-else>
          <div class="mt-7 grid gap-3 sm:grid-cols-4">
            <article
              v-for="stat in [
                ['共同回忆', review.statistics.memories],
                ['一起去过', review.statistics.places],
                ['完成愿望', review.statistics.completedWishes],
                ['年度照片', review.statistics.photos],
              ]"
              :key="stat[0]"
              :aria-label="`${stat[0]} ${stat[1]}`"
              class="rounded-2xl border border-white/80 bg-white/65 p-4 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <p class="text-2xl font-semibold text-ink-950 dark:text-white">
                {{ stat[1] }}
              </p>
              <p class="mt-1 text-xs text-ink-400">{{ stat[0] }}</p>
            </article>
          </div>

          <div v-if="review.keywords.length" class="mt-6 flex flex-wrap gap-2">
            <span
              v-for="keyword in review.keywords"
              :key="keyword"
              class="rounded-full bg-memory-100 px-3 py-1.5 text-xs font-semibold text-memory-700 dark:bg-memory-950/55 dark:text-memory-200"
            >
              # {{ keyword }}
            </span>
          </div>

          <div class="mt-7 grid gap-4 md:grid-cols-2">
            <article
              v-for="contribution in review.contributions"
              :key="contribution.role"
              class="overflow-hidden rounded-3xl border border-white/80 bg-white/65 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div class="aspect-[4/3] bg-ink-100 dark:bg-ink-900">
                <PrivateMediaImage
                  v-if="contribution.selectedMedia"
                  :src="contribution.selectedMedia.thumbnailUrl"
                  :alt="contributionTitle(contribution)"
                />
                <div v-else class="grid h-full place-items-center text-ink-300">
                  <Image class="size-8" />
                </div>
              </div>
              <div class="p-5">
                <p class="text-xs font-semibold text-memory-600">
                  {{ contributionTitle(contribution) }}
                </p>
                <p
                  class="mt-3 text-sm leading-7 text-ink-600 dark:text-ink-300"
                >
                  {{ contribution.message || "还在等一句年度寄语。" }}
                </p>
              </div>
            </article>
          </div>

          <div
            v-if="review.status === 'READY'"
            class="mt-7 rounded-3xl border border-ink-200/80 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <p class="font-semibold text-ink-900 dark:text-white">
              补上你的年度选择
            </p>
            <div class="mt-4 grid gap-4 lg:grid-cols-2">
              <label>
                <span class="field-label">年度照片</span>
                <select v-model="form.selectedMediaId" class="field-input">
                  <option value="">暂不选择</option>
                  <option
                    v-for="photo in availablePhotos"
                    :key="photo.id"
                    :value="photo.id"
                  >
                    {{ photo.originalName }}
                  </option>
                </select>
              </label>
              <label>
                <span class="field-label">我的年度寄语</span>
                <textarea
                  v-model="form.message"
                  class="field-input min-h-28 resize-y"
                  maxlength="2000"
                  placeholder="这一年最想一起记住什么？"
                />
              </label>
            </div>
            <label class="mt-4 block">
              <span class="field-label">写给下一年的我们</span>
              <textarea
                v-model="form.nextYearLetter"
                class="field-input min-h-32 resize-y"
                maxlength="20000"
                placeholder="等下一年回头看时，希望我们已经……"
              />
            </label>
            <div class="mt-5 flex flex-wrap justify-end gap-3">
              <BaseButton
                variant="ghost"
                :loading="busy === 'generate'"
                @click="generate"
              >
                <RefreshCw class="size-4" />重新整理统计
              </BaseButton>
              <BaseButton
                variant="secondary"
                :loading="busy === 'save'"
                @click="save"
              >
                <Check class="size-4" />保存选择
              </BaseButton>
              <BaseButton :loading="busy === 'publish'" @click="publish">
                <Send class="size-4" />正式收藏
              </BaseButton>
            </div>
          </div>

          <div
            v-else-if="review.nextYearLetter"
            class="mt-7 rounded-3xl bg-future-50 p-6 dark:bg-future-950/35"
          >
            <p
              class="text-xs font-semibold text-future-700 dark:text-future-200"
            >
              写给下一年的我们
            </p>
            <p
              class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200"
            >
              {{ review.nextYearLetter }}
            </p>
          </div>
        </template>
      </div>
    </SurfaceCard>
  </section>
</template>

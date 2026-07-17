<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import AnniversaryBoard from "@/features/tomorrow/AnniversaryBoard.vue";
import CapsuleBoard from "@/features/tomorrow/CapsuleBoard.vue";
import FutureMapPanel from "@/features/tomorrow/FutureMapPanel.vue";
import PlanBoard from "@/features/tomorrow/PlanBoard.vue";
import TomorrowHero from "@/features/tomorrow/TomorrowHero.vue";
import TomorrowLaterFeatures from "@/features/tomorrow/TomorrowLaterFeatures.vue";
import {
  isTomorrowCreateType,
  type TomorrowCreateType,
} from "@/features/tomorrow/tomorrow-utils";
import WishBoard from "@/features/tomorrow/WishBoard.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";

const route = useRoute();
const router = useRouter();
const createTarget = ref<TomorrowCreateType | null>(null);

watch(
  () => route.query.create,
  (value) => {
    if (!isTomorrowCreateType(value)) return;
    createTarget.value = value;
    const { create: _create, ...rest } = route.query;
    void router.replace({ path: route.path, query: rest, hash: route.hash });
  },
  { immediate: true },
);

function requestCreate(type: TomorrowCreateType) {
  createTarget.value = type;
}

function consumeCreate(type: TomorrowCreateType) {
  if (createTarget.value === type) createTarget.value = null;
}
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Tomorrow · 尚未发生的未来"
      title="把期待写下来，让它有一天真的发生。"
      description="愿望、计划、纪念日和时间胶囊都遵循服务端状态与关系时区；一件未来完成后，可以完整地回到记录。"
    >
      <template #actions>
        <BaseButton size="sm" @click="requestCreate('wish')">
          <Plus class="size-4" />新愿望
        </BaseButton>
      </template>
    </PageHeader>

    <div class="space-y-8 sm:space-y-10">
      <TomorrowHero
        @create-anniversary="requestCreate('anniversary')"
        @create-capsule="requestCreate('capsule')"
      />
      <WishBoard
        :request-create="createTarget === 'wish'"
        @create-consumed="consumeCreate('wish')"
      />
      <PlanBoard
        :request-create="createTarget === 'plan'"
        @create-consumed="consumeCreate('plan')"
      />
      <FutureMapPanel />
      <AnniversaryBoard
        :request-create="createTarget === 'anniversary'"
        @create-consumed="consumeCreate('anniversary')"
      />
      <CapsuleBoard
        :request-create="createTarget === 'capsule'"
        @create-consumed="consumeCreate('capsule')"
      />
      <TomorrowLaterFeatures />
    </div>
  </main>
</template>

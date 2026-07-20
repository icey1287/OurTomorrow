import { onBeforeUnmount, type Ref, watch } from "vue";

export function useSheetBodyLock(open: Ref<boolean>) {
  let previousOverflow = "";

  watch(
    open,
    (isOpen) => {
      if (typeof document === "undefined") return;
      if (isOpen) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = previousOverflow;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (typeof document !== "undefined" && open.value) {
      document.body.style.overflow = previousOverflow;
    }
  });
}

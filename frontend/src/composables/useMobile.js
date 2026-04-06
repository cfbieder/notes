import { ref, onMounted, onBeforeUnmount } from 'vue';

export function useMobile(breakpoint = 768) {
  const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);

  function onResize() {
    isMobile.value = window.innerWidth < breakpoint;
  }

  onMounted(() => window.addEventListener('resize', onResize));
  onBeforeUnmount(() => window.removeEventListener('resize', onResize));

  return { isMobile };
}

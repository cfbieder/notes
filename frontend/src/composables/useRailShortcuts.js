import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useUIStore } from '../stores/ui.js';
import { useAIAssistStore } from '../stores/aiAssist.js';
import { useResearchStore } from '../stores/research.js';

// Keyboard shortcuts for the activity rail (CR026 §8):
//   ⌘1..⌘8 → jump to the corresponding rail item
//   ⌘9     → Research (CR039), only once a book exists
//   ⌘B     → toggle the contextual panel collapsed/expanded
//
// Shortcuts are skipped when the user is typing in an input, textarea,
// or contenteditable region so they don't fight the editor or any
// form field.
export function useRailShortcuts({ onToggleReminders } = {}) {
  const router = useRouter();
  const uiStore = useUIStore();
  const aiAssistStore = useAIAssistStore();
  const researchStore = useResearchStore();

  const numberMap = {
    '1': () => router.push('/notes'),
    '2': () => router.push('/tasks'),
    '3': () => router.push('/ideas'),
    '4': () => onToggleReminders?.(),
    '5': () => router.push('/search'),
    '6': () => router.push('/graph'),
    '7': () => aiAssistStore.toggle(),
    '8': () => router.push('/vault'),
    '9': () => { if (researchStore.hasBook) router.push('/research/sources'); }
  };

  function isTextInput(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function onKeydown(e) {
    // Only fire on ⌘/Ctrl + digit or letter; ignore inside text-entry surfaces
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.shiftKey || e.altKey) return;
    if (isTextInput(e.target)) return;

    if (numberMap[e.key]) {
      e.preventDefault();
      numberMap[e.key]();
      return;
    }

    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      uiStore.toggleRailPanel();
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
  });
}

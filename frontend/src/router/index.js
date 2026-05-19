import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const routes = [
  {
    path: '/',
    redirect: '/notes'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/notes',
    name: 'Notes',
    component: () => import('../views/NotesView.vue'),
    meta: { rail: 'notes' }
  },
  {
    path: '/notes/:id',
    name: 'NoteDetail',
    component: () => import('../views/NotesView.vue'),
    meta: { rail: 'notes' }
  },
  {
    path: '/inbox',
    name: 'Inbox',
    component: () => import('../views/InboxView.vue'),
    meta: { rail: 'notes' }
  },
  {
    path: '/ideas',
    name: 'Ideas',
    component: () => import('../views/IdeasView.vue'),
    meta: { rail: 'ideas' }
  },
  {
    path: '/ideas/:id',
    name: 'IdeaDetail',
    component: () => import('../views/NotesView.vue'),
    meta: { rail: 'ideas' }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('../views/TasksView.vue'),
    meta: { rail: 'tasks' }
  },
  {
    path: '/tags/:name',
    name: 'TagNotes',
    component: () => import('../views/NotesView.vue'),
    meta: { rail: 'notes' }
  },
  {
    path: '/notebooks/:id',
    name: 'NotebookNotes',
    component: () => import('../views/NotesView.vue'),
    meta: { rail: 'notes' }
  },
  {
    path: '/graph',
    name: 'Graph',
    component: () => import('../views/GraphView.vue'),
    meta: { rail: 'graph' }
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('../views/SearchView.vue'),
    meta: { rail: 'search' }
  },
  {
    path: '/trash',
    name: 'Trash',
    component: () => import('../views/TrashView.vue'),
    meta: { rail: 'trash' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { rail: 'settings' }
  },
  {
    path: '/vault',
    name: 'Vault',
    component: () => import('../views/VaultView.vue'),
    meta: { rail: 'vault' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Auth guard — attempt session restore before redirecting to login
router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const authStore = useAuthStore();

  // On first load, try to restore session from refresh token cookie
  if (!authStore.initialized) {
    await authStore.init();
  }

  if (!authStore.isAuthenticated) {
    return { name: 'Login' };
  }

  return true;
});

export default router;

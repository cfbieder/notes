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
    component: () => import('../views/NotesView.vue')
  },
  {
    path: '/notes/:id',
    name: 'NoteDetail',
    component: () => import('../views/NotesView.vue')
  },
  {
    path: '/inbox',
    name: 'Inbox',
    component: () => import('../views/InboxView.vue')
  },
  {
    path: '/ideas',
    name: 'Ideas',
    component: () => import('../views/IdeasView.vue')
  },
  {
    path: '/ideas/:id',
    name: 'IdeaDetail',
    component: () => import('../views/NotesView.vue')
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('../views/TasksView.vue')
  },
  {
    path: '/tags/:name',
    name: 'TagNotes',
    component: () => import('../views/NotesView.vue')
  },
  {
    path: '/notebooks/:id',
    name: 'NotebookNotes',
    component: () => import('../views/NotesView.vue')
  },
  {
    path: '/graph',
    name: 'Graph',
    component: () => import('../views/GraphView.vue')
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('../views/SearchView.vue')
  },
  {
    path: '/trash',
    name: 'Trash',
    component: () => import('../views/TrashView.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue')
  },
  {
    path: '/vault',
    name: 'Vault',
    component: () => import('../views/VaultView.vue')
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

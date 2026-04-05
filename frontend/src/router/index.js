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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Auth guard — useAuthStore must be called after pinia is installed,
// so we call it lazily inside the guard.
router.beforeEach((to) => {
  if (to.meta.public) return true;

  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) {
    return { name: 'Login' };
  }

  return true;
});

export default router;

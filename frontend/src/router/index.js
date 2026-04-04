import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/notes'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue')
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

export default router;

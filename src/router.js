import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { title: 'Главная' } },
    { path: '/theory', name: 'theory', component: () => import('./views/TheoryView.vue'), meta: { title: 'Теория' } },
    { path: '/practice', name: 'practice', component: () => import('./views/PracticeView.vue'), meta: { title: 'Практика' } },
    { path: '/lab', name: 'lab', component: () => import('./views/LabView.vue'), meta: { title: 'QA Lab' } },
    { path: '/projects', name: 'projects', component: () => import('./views/ProjectsView.vue'), meta: { title: 'Практические проекты' } },
    { path: '/arena', name: 'arena', component: () => import('./views/ArenaView.vue'), meta: { title: 'QA Arena' } },
    { path: '/marathons', name: 'marathons', component: () => import('./views/MarathonsView.vue'), meta: { title: 'QA-марафоны' } },
    { path: '/interview', name: 'interview', component: () => import('./views/InterviewView.vue'), meta: { title: 'Собеседование' } },
    { path: '/daily', name: 'daily', component: () => import('./views/DailyView.vue'), meta: { title: 'QA Daily' } },
    { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: 'Профиль' } },
    { path: '/xp-history', name: 'xp-history', component: () => import('./views/XpHistoryView.vue'), meta: { title: 'Опыт и награды' } },
    { path: '/achievements', name: 'achievements', component: () => import('./views/AchievementsView.vue'), meta: { title: 'Достижения' } },
    { path: '/leaderboard', name: 'leaderboard', component: () => import('./views/LeaderboardView.vue'), meta: { title: 'Рейтинг' } },
    { path: '/admin/ai', name: 'ai-admin', component: () => import('./views/AiAdminView.vue'), meta: { title: 'AI-черновики' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Страница не найдена' } },
  ],
  scrollBehavior: (to) => to.hash ? ({ el: to.hash, top: 12, behavior: 'smooth' }) : ({ top: 0, behavior: 'smooth' }),
})

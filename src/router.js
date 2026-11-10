import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import TheoryView from './views/TheoryView.vue'
import PracticeView from './views/PracticeView.vue'
import InterviewView from './views/InterviewView.vue'
import DailyView from './views/DailyView.vue'
import ProfileView from './views/ProfileView.vue'
import AchievementsView from './views/AchievementsView.vue'
import LeaderboardView from './views/LeaderboardView.vue'
import NotFoundView from './views/NotFoundView.vue'
import AiAdminView from './views/AiAdminView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Главная' } },
    { path: '/theory', name: 'theory', component: TheoryView, meta: { title: 'Теория' } },
    { path: '/practice', name: 'practice', component: PracticeView, meta: { title: 'Найди багулю' } },
    { path: '/interview', name: 'interview', component: InterviewView, meta: { title: 'Собеседование' } },
    { path: '/daily', name: 'daily', component: DailyView, meta: { title: 'QA Daily' } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { title: 'Профиль' } },
    { path: '/achievements', name: 'achievements', component: AchievementsView, meta: { title: 'Достижения' } },
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardView, meta: { title: 'Рейтинг' } },
    { path: '/admin/ai', name: 'ai-admin', component: AiAdminView, meta: { title: 'AI-черновики' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { title: 'Страница не найдена' } },
  ],
  scrollBehavior: (to) => to.hash ? ({ el: to.hash, top: 12, behavior: 'smooth' }) : ({ top: 0, behavior: 'smooth' }),
})

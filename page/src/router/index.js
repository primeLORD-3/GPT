import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import BackendView from '../views/BackendView.vue'
import NovelView from '../views/NovelView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/backends',
      name: 'backends',
      component: BackendView,
    },
    {
      path: '/novel',
      name: 'novel',
      component: NovelView,
    },
    // 重定向所有其他路径到仪表盘
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
})

export default router

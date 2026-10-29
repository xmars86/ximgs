import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/library' },
    {
      path: '/library',
      name: 'library',
      component: () => import('../features/library/LibraryPage.vue')
    },
    {
      path: '/trash',
      name: 'trash',
      component: () => import('../features/library/LibraryPage.vue')
    },
    {
      path: '/sync',
      name: 'sync',
      component: () => import('../features/sync/SyncPage.vue')
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../features/logs/LogsPage.vue')
    },
    {
      path: '/skus',
      name: 'skus',
      component: () => import('../features/sku/SkuPage.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../features/settings/SettingsPage.vue')
    },
    {
      path: '/process',
      name: 'process',
      component: () => import('../features/process/ProcessPage.vue')
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('../features/upload/UploadPage.vue')
    },
    {
      path: '/links',
      name: 'links',
      component: () => import('../features/links/LinksPage.vue')
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('../features/tools/ToolsPage.vue')
    }
  ]
})

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
import { i18n } from './shared/i18n'
import { bootstrapLocale } from './shared/i18n/useLocale'
import './shared/ui/base.css'

async function boot(): Promise<void> {
  await bootstrapLocale().catch(() => undefined)

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(i18n)
  app.mount('#app')
}

void boot()

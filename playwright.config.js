import { defineConfig, devices } from '@playwright/test'

const repository = process.env.GITHUB_REPOSITORY
const [owner, repositoryName] = repository?.split('/') ?? []
const previewBase = process.env.GITHUB_ACTIONS === 'true' && repositoryName && repositoryName !== `${owner}.github.io`
  ? `/${repositoryName}/`
  : '/'
const previewUrl = new URL(previewBase, 'http://127.0.0.1:4173').href

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: previewUrl,
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
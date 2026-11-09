import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const repository = process.env.GITHUB_REPOSITORY
const [owner, repositoryName] = repository?.split('/') ?? []
const pagesBase = repositoryName && repositoryName !== `${owner}.github.io`
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  plugins: [vue()],
  base: process.env.GITHUB_ACTIONS === 'true' ? pagesBase : '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
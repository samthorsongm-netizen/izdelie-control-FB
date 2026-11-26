import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — чтобы сборка работала и в корне домена, и в подпапке GitHub Pages
export default defineConfig({
  base: './',
  plugins: [react()],
  // одна копия React иначе ломает хуки
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    // разделяем вендоров: при обновлении сайта они остаются в кеше браузера
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // react и react-dom гоняем через один граф vite-node, иначе два экземпляра
    server: { deps: { inline: ['react', 'react-dom'] } },
  },
} as never)

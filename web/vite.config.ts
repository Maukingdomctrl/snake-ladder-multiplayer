import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/.proxy': {
        target: 'https://discord.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.proxy/, ''),
      },
      '/render': {
        target: 'https://snake-ladder-multiplayer-c5ai.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/render/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('emoji-picker-react')) return 'emoji-picker';
          if (id.includes('firebase')) return 'firebase';
          if (id.includes('node_modules/react')) return 'react-vendor';
        },
      },
    },
  },
})
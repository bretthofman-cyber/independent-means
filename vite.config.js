import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    environment: 'node',
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('@clerk/clerk-react')) return 'vendor-auth';
          if (id.includes('@supabase/supabase-js')) return 'vendor-db';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
      // /api/chat is a Vercel serverless function — not available via `npm run dev`.
      // For local AI testing use: vercel dev (runs on port 3000 and serves both frontend + functions)
      '/api/chat': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})

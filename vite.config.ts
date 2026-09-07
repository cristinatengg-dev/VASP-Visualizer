import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false, // Disable sourcemaps for production security
  },
  plugins: [
    react(), // Removed babel plugins which are dev-only
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.ELIANGMAT_DATA_DEV === '1' ? 'http://127.0.0.1:4318' : 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})

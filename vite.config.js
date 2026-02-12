import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - แยก libraries ใหญ่ๆ ออก
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['react-icons', 'react-hot-toast', 'react-qr-code'],
          'vendor-pdf': ['jspdf'],
        }
      }
    },
    chunkSizeWarningLimit: 500
  }
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const envTarget = process.env.VITE_API_TARGET;
  const defaultTarget = mode === 'production' ? '' : 'http://127.0.0.1:8000';
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: envTarget || defaultTarget ? {
        '/api': {
          target: envTarget || defaultTarget,
          changeOrigin: true,
        },
      } : undefined,
    },
  };
});

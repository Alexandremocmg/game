import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // expõe na rede local para teste em celular via adb reverse
    port: 5173,
    // domínio do ngrok muda a cada execução; sem allowedHosts, o Vite
    // bloqueia por padrão como proteção contra DNS rebinding.
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});

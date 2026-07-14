import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Proxy same-origin /api calls to the local Firebase Functions emulator
    // during development so Mistral chat and web search work with `npm run dev`.
    // Update the project id / port if yours differ (see `firebase emulators:start`).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001/promptgenv1/us-central1/api",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

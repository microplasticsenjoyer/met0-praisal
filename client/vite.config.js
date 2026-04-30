import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/appraise": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});

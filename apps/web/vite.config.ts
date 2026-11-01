import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      "/api": process.env.API_PROXY || "http://127.0.0.1:3001",
      "/auth": process.env.API_PROXY || "http://127.0.0.1:3001",
      "/ws": {
        target: process.env.API_PROXY || "ws://127.0.0.1:3001",
        ws: true,
      },
    },
  },
});

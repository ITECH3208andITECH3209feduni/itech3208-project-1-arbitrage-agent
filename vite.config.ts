import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { japanCarDirectDevServer } from "./src/japanCarDirectDevServer";

export default defineConfig({
  plugins: [react(), japanCarDirectDevServer()],
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ["**/.jcd-browser-profile/**"],
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});

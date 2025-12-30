import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcUrl = new URL("./src", import.meta.url);
const srcPath = decodeURIComponent(
  srcUrl.pathname.replace(/^\/([A-Za-z]:)/, "$1")
);

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/trick-taking-trainer/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
}));

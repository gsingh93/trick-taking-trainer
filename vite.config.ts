import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcUrl = new URL("./src", import.meta.url);
const srcPath = decodeURIComponent(
  srcUrl.pathname.replace(/^\/([A-Za-z]:)/, "$1")
);

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
});

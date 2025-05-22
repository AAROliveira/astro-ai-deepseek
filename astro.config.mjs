import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@tailwindcss/vite";
import node from "@astrojs/node";

export default defineConfig({
  integrations: [react()], // Astro renderer is enabled by default, but try adding:
  output: "server",
  adapter: node({ mode: "standalone" }),
  vite: {
    plugins: [tailwind()],
  },
});

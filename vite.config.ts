import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/main.ts",
      name: "cashu-kym",
      // the proper extensions will be added
      fileName: "index",
    },
  },
  plugins: [dts()],
});

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/pure.ts",
      name: "cashu-kym",
      formats: ["es", "cjs"],
    },
    outDir: "./dist/pure",
    rollupOptions: {
      output: [
        {
          format: "es",
          entryFileNames: "index.js",
          inlineDynamicImports: true,
        },
        {
          format: "cjs",
          entryFileNames: "index.cjs",
          inlineDynamicImports: true,
        },
      ],
    },
  },
  plugins: [
    dts({
      entryRoot: "./src",
      include: ["./src/**/*.ts"],
      outDir: "./dist/pure",
      rollupTypes: true,
      copyDtsFiles: false,
      insertTypesEntry: true,
      tsconfigPath: "./tsconfig.json",
    }),
  ],
});

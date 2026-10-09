import path from "path"
import fs from "fs"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// maplibre v6 在运行时按 import.meta.url 相对路径加载 ./maplibre-gl-worker.mjs，
// Rollup 打包后该文件不会自动产出，构建结束时手动拷入 assets，否则线上 worker 404、地图不出图
const copyMaplibreWorker = {
  name: 'copy-maplibre-worker',
  apply: 'build' as const,
  closeBundle() {
    fs.copyFileSync(
      path.resolve(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
      path.resolve(__dirname, 'dist/assets/maplibre-gl-worker.mjs'),
    )
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), copyMaplibreWorker],
  optimizeDeps: { exclude: ['maplibre-gl'] }, // maplibre v6 的 worker 用 import.meta.url 相对寻址，不能被预打包
  server: {
    port: 7100,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

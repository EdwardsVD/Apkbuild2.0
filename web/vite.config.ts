import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Izinkan semua host (termasuk host preview sandbox) agar live preview
    // tidak diblokir Vite. Hanya berlaku untuk dev server, bukan build akhir.
    allowedHosts: true,
  },
});

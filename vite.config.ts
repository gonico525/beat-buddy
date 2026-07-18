import { defineConfig } from 'vite';

// GitHub Pages はサブパス配信 (https://<user>.github.io/beat-buddy/) のため
// base 必須 (requirements §11.1)。未設定だとアセットが 404 になる。
export default defineConfig({
  base: '/beat-buddy/',
});

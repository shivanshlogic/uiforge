import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain static build -- `npm run build` outputs dist/, deployable to any
// static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3...).
// There is no backend for this app at all: parsing the uploaded .txt spec
// and turning it into UI both happen entirely in the browser (see
// src/lib/gridParser.js) -- nothing here needs a server, dynamic or
// otherwise. The only network calls this app ever makes are to
// window.UIFORGE_LOCAL_BACKEND (127.0.0.1, the visitor's own machine --
// see src/lib/localBackend.js), never back to wherever this site itself
// is hosted.
export default defineConfig({
  plugins: [react()],
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Le build produit un seul fichier HTML autonome (JS + CSS intégrés)
// dans ../editeur-plan/, pour qu'il s'ouvre comme les maquettes, sans serveur.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: '../editeur-plan',
    emptyOutDir: true,
  },
});

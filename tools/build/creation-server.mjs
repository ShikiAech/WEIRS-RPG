import { build } from 'vite';
import { fileURLToPath } from 'node:url';
await build({
  configFile:false,publicDir:false,
  build:{target:'es2022',outDir:'supabase/functions/_shared',emptyOutDir:false,minify:false,copyPublicDir:false,
    lib:{entry:fileURLToPath(new URL('./creation-server-entry.ts',import.meta.url)),formats:['es'],fileName:()=> 'creation-engine.js'},
  },
});

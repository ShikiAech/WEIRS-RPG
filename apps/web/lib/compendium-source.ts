import { supabase } from './supabase';
import { createCompendiumRepository } from './compendium';
import { demoCompendium } from './compendium-demo';
import { createCachedCompendiumRepository } from './compendium-cache';
let database = supabase
  ? createCachedCompendiumRepository(createCompendiumRepository(supabase))
  : null;
const demonstrationRepository = createCachedCompendiumRepository(demoCompendium);
let account: string | null = null;
supabase?.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id ?? null;
  if (next !== account) {
    account = next;
    database = createCachedCompendiumRepository(createCompendiumRepository(supabase!));
  }
});
export function compendiumSource(demonstration = false) {
  const demo = demonstration || !database;
  return { repository: demo ? demonstrationRepository : database!, demo };
}

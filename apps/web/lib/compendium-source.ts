import { supabase } from './supabase';
import { createCompendiumRepository } from './compendium';
import { demoCompendium } from './compendium-demo';
const database = supabase ? createCompendiumRepository(supabase) : null;
export function compendiumSource(demonstration = false) {
  const demo = demonstration || !database;
  return { repository: demo ? demoCompendium : database!, demo };
}

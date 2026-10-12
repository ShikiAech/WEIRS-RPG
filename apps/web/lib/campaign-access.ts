import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CampaignAccess,
  CampaignMembership,
  CampaignRecord,
} from '../../../packages/contracts/sheets';

export async function campaignAccess(
  client: SupabaseClient,
  userId: string,
): Promise<CampaignAccess> {
  const responses = await Promise.all([
    client.from('campanhas').select('id,nome').order('nome'),
    client.from('membros_campanha').select('campanha_id,usuario_id,papel'),
    client.from('administradores').select('usuario_id').eq('usuario_id', userId),
  ]);
  for (const response of responses) if (response.error) throw response.error;
  const campaigns = (responses[0].data || []) as CampaignRecord[];
  const actual = (responses[1].data || []) as CampaignMembership[];
  const admin = responses[2].data?.some((row) => row.usuario_id === userId) || false;
  const memberships: CampaignMembership[] = admin
    ? [
        ...actual.filter((m) => m.usuario_id !== userId),
        ...campaigns.map((c) => ({
          campanha_id: c.id,
          usuario_id: userId,
          papel: 'mestre' as const,
        })),
      ]
    : actual;
  return { campaigns, memberships, admin };
}

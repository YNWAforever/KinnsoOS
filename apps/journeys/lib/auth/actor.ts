import { serverClient } from '../supabase/server';
export type Actor = { id: string; roles: string[]; merchantMemberships: string[] };
export async function currentActor(): Promise<Actor | null> {
  const client = await serverClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const facts = await client.rpc('kinnso_actor');
  if (facts.error || facts.data?.id !== data.user.id) return null;
  return { id: data.user.id, roles: facts.data.roles, merchantMemberships: facts.data.merchantMemberships };
}
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new Error('AUTH_REQUIRED');
  return actor;
}

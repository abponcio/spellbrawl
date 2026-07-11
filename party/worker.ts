import { routePartykitRequest } from 'partyserver';
import { SpellbrawlRoom } from './spellbrawl';

export { SpellbrawlRoom };

export interface Env {
  Spellbrawl: DurableObjectNamespace<SpellbrawlRoom>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

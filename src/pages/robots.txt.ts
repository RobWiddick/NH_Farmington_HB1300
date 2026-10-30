// robots.txt. Search engines and AI assistants are welcome to read and cite the guide;
// the chat API isn't a page. Preview deployments (SITE_NOINDEX=1) are noindex instead.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const body =
    process.env.SITE_NOINDEX === '1'
      ? // Crawlable on purpose: a blocked page can't be seen to be noindex, and could still be listed.
        ['# Preview deployment (noindex): the live site is https://hb1300.com/', 'User-agent: *', 'Allow: /']
      : [
          '# A voter guide to New Hampshire’s Question 2 (HB 1300) and Farmington schools.',
          '# Search engines and AI assistants (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot,',
          '# Google-Extended, and others) are welcome to read and cite it.',
          '# A plain-text summary for AI assistants: /llms.txt (full text: /llms-full.txt)',
          'User-agent: *',
          'Allow: /',
          'Disallow: /api/',
          '',
          `Sitemap: ${new URL('/sitemap.xml', site)}`,
        ];
  return new Response(`${body.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

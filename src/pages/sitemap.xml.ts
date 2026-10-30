// sitemap.xml: the site is one page; lastmod is when its content last changed.
import type { APIRoute } from 'astro';
import { site as config } from '../data/site';

export const GET: APIRoute = ({ site }) => {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${new URL('/', site)}</loc><lastmod>${config.lastUpdatedISO}</lastmod></url>`,
    '</urlset>',
  ];
  return new Response(`${xml.join('\n')}\n`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};

// schema.org structured data (JSON-LD) for the guide, so search engines and AI assistants
// can tell what the page is about, who wrote it, when it changed, and what it cites.
// The FAQ (FAQPage) is added after the build by scripts/build-seo.mjs, straight from the
// rendered FAQ section, so it always matches what visitors see.
import { site } from './site';
import { sources } from './sources';

export function guideJsonLd(siteUrl: URL) {
  const home = new URL('/', siteUrl).href;
  const id = (name: string) => `${home}#${name}`;
  const farmington = {
    '@type': 'Place',
    name: 'Farmington, New Hampshire',
    address: { '@type': 'PostalAddress', addressLocality: 'Farmington', addressRegion: 'NH', addressCountry: 'US' },
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': id('website'),
        url: home,
        name: site.siteName,
        alternateName: 'HB1300.com',
        description: site.description,
        inLanguage: 'en-US',
        publisher: { '@id': id('author') },
      },
      {
        '@type': 'Person',
        '@id': id('author'),
        name: site.publisher,
        url: home,
        homeLocation: farmington,
      },
      {
        '@type': 'WebPage',
        '@id': id('webpage'),
        url: home,
        name: site.title,
        description: site.description,
        isPartOf: { '@id': id('website') },
        inLanguage: 'en-US',
        datePublished: site.publishedDateTime,
        dateModified: site.lastUpdatedDateTime,
        primaryImageOfPage: { '@id': id('image') },
        mainEntity: { '@id': id('article') },
      },
      {
        '@type': 'Article',
        '@id': id('article'),
        headline: 'NH Question 2: what the HB 1300 school tax cap would mean for Farmington schools',
        alternativeHeadline: 'It’s called a “tax cap.” It’s really a school cap.',
        description: site.description,
        genre: 'Voter guide',
        author: { '@id': id('author') },
        publisher: { '@id': id('author') },
        datePublished: site.publishedDateTime,
        dateModified: site.lastUpdatedDateTime,
        mainEntityOfPage: { '@id': id('webpage') },
        image: { '@type': 'ImageObject', '@id': id('image'), url: new URL('/og.png', siteUrl).href, width: 1200, height: 630 },
        inLanguage: 'en-US',
        isAccessibleForFree: true,
        spatialCoverage: farmington,
        about: [
          {
            '@type': 'Legislation',
            name: 'HB 1300 (2026), Chapter 324',
            legislationIdentifier: 'HB 1300',
            legislationJurisdiction: 'New Hampshire',
            url: sources['hb1300-text'].url,
          },
          {
            '@type': 'Legislation',
            name: 'RSA 32:5-i, School District Local Tax Cap and SAU Fixed Cap',
            legislationIdentifier: 'RSA 32:5-i',
            legislationJurisdiction: 'New Hampshire',
            url: sources['rsa-32-5-i'].url,
          },
          { '@type': 'Thing', name: `New Hampshire Ballot Question 2 (${site.electionDate})` },
          { '@type': 'EducationalOrganization', name: 'Farmington School District (SAU 61)', location: farmington },
        ],
        keywords: [
          'New Hampshire Question 2',
          'NH Question 2 2026',
          'HB 1300',
          'RSA 32:5-i',
          'school tax cap',
          'property tax cap',
          '60% supermajority',
          'Farmington NH',
          'Farmington School District',
          'SAU 61',
        ],
        // Every source the page cites, by title and link.
        citation: Object.values(sources).map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url })),
      },
    ],
  };
}

/**
 * Google Analytics for the public site only. The Pages deploy sets OPENLASER_GTAG_ID; dev, CI and
 * local builds leave it unset and ship without the tag.
 */
import type { HtmlTagDescriptor, Plugin } from 'vite';

const GA_ID = /^G-[A-Z0-9]{4,}$/;

export function gtagTags(id: string): HtmlTagDescriptor[] {
  if (!GA_ID.test(id)) throw new Error(`OPENLASER_GTAG_ID is not a Google Analytics ID: ${id}`);
  return [
    {
      tag: 'script',
      attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
      injectTo: 'head',
    },
    {
      tag: 'script',
      children: [
        'window.dataLayer = window.dataLayer || [];',
        'function gtag(){dataLayer.push(arguments);}',
        "gtag('js', new Date());",
        `gtag('config', '${id}');`,
      ].join('\n'),
      injectTo: 'head',
    },
  ];
}

export function gtag(id: string | undefined = process.env.OPENLASER_GTAG_ID): Plugin {
  return {
    name: 'openlaser-gtag',
    apply: 'build',
    transformIndexHtml: () => (id ? gtagTags(id) : []),
  };
}

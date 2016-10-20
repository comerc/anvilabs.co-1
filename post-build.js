/* @flow */

import fs from 'fs';
import path from 'path';

import { parse as parseToml } from 'toml';
import _ from 'lodash/fp';
import absolutify from 'absolutify';
import frontMatter from 'front-matter';
import markdownIt from 'markdown-it';
import moment from 'moment';
import RSS from 'rss';
import sm from 'sitemap';

import { blogPostsFromPages } from './utils';
import type { BlogPost } from './types';

const config = parseToml(
  String(fs.readFileSync(path.join(__dirname, '/config.toml'))),
);
const { hostname } = config;

const generateSitemapUrl = (page: mixed): ?Object => {
  /* eslint-disable fp/no-let, fp/no-mutation */
  let pagePath;
  if (typeof page === 'object' && page !== null) {
    pagePath = page.path;
  } else {
    pagePath = page;
  }
  /* eslint-enable fp/no-let, fp/no-mutation */

  const nonIndexedPages = ['/404/'];
  const importantPages = ['/', '/work/', '/blog/'];
  const isRootPath = pagePath === '/';
  const isNonIndexedPage = _.some(_.identity, [
    _.includes(pagePath, nonIndexedPages),
    _.some(
      (nonIndexedPage: string) => _.startsWith(nonIndexedPage, pagePath),
      nonIndexedPages,
    ),
  ]);
  const isImportantPage = _.includes(pagePath, importantPages);

  if (!pagePath || isNonIndexedPage) return null;

  return {
    url: pagePath,
    changefreq: isImportantPage ? 'daily' : 'monthly',
    priority: isRootPath ? 1 : 0.85,
  };
};

const generateSitemap = (pages: Array<mixed>) => {
  const sitemapUrls = _.flow(
    _.map(generateSitemapUrl),
    _.compact,
  )(pages);

  const sitemap = sm.createSitemap({
    hostname,
    cacheTime: 600000,
    urls: sitemapUrls,
  });

  fs.writeFileSync(
    path.join(__dirname, '/public/sitemap.xml'),
    sitemap.toString(),
  );
};

const generateFeed = (pages: Array<mixed>) => {
  const feed = new RSS({
    title: siteTitle,
    description: siteDescription,
    feed_url: `${hostname}/feed.xml`,
    site_url: hostname,
    copyright: '© 2016 ТОО «Anvilabs»',
    language: 'ru',
    pubDate: moment().toJSON(),
  });
  const md = markdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  // eslint-disable-next-line lodash-fp/no-unused-result
  _.flow(
    blogPostsFromPages,
    _.map((post: BlogPost & {
      path: string,
      requirePath: string,
    }) => {
      // read the markdown file
      const content = String(
        fs.readFileSync(path.join(__dirname, `/pages/${post.requirePath}`)),
      );
      // extract yaml meta tags
      const meta = frontMatter(content);
      // replace relative links with absolute ones
      const body = absolutify(
        md.render(meta.body),
        // remove trailing slashes from url
        `${hostname}${post.path}`.replace(/\/$/, ''),
      );

      return { ...post, body };
    }),
    _.forEach((post: BlogPost & { path: string }) => {
      feed.item({
        ..._.pick(['title', 'author', 'date'], post),
        description: post.body,
        url: `${hostname}${post.path}`,
      });
    }),
  )(pages);

  fs.writeFileSync(
    path.join(__dirname, './public/feed.xml'),
    feed.xml({ indent: true }),
  );
};

const generateRobots = () => {
  const fileContent = 'User-agent: *\n' +
    'Allow: /\n\n' +
    `Sitemap: ${hostname}/sitemap.xml`;

  fs.writeFileSync(
    path.join(__dirname, '/public/robots.txt'),
    fileContent,
  );
};

export default (pages: Array<mixed>, callback: () => void) => {
  generateSitemap(pages);
  generateFeed(pages);
  generateRobots();

  callback();
};

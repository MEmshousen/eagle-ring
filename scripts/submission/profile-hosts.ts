/**
 * The profile-page denylist (spec §3, `site`).
 *
 * A Site is the Member's own website, not a profile on someone else's
 * platform. Submission CI rejects any `site` whose host is one of these
 * domains or a subdomain of one (so `linkedin.com` also covers
 * `www.linkedin.com` and `m.linkedin.com`).
 *
 * To change the list, add or remove a domain here: lowercase, no `https://`,
 * no path. The Maintainer judges grey areas by hand, so only list hosts where
 * every page is a profile or a feed.
 *
 * Note: `github.com` is listed, which covers `github.com/<user>` profiles and
 * repo pages. GitHub Pages Sites live on `<user>.github.io`, a different
 * domain, and are allowed.
 */
export const PROFILE_HOSTS: readonly string[] = [
  // Professional networks
  'linkedin.com',
  'handshake.com',
  'joinhandshake.com',

  // Social media
  'x.com',
  'twitter.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'threads.net',
  'threads.com',
  'tiktok.com',
  'bsky.app',
  'snapchat.com',
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'discord.com',
  'discord.gg',

  // Code hosts (profile and repo pages, not hosted Sites)
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'leetcode.com',
  'hackerrank.com',
  'kaggle.com',

  // Link-in-bio and contact-card pages
  'linktr.ee',
  'beacons.ai',
  'bio.link',
  'about.me',
]

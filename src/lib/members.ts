/**
 * The shared Member module: the loaded Members plus every helper. Pages and
 * endpoints import from here; the pure helpers live in `./member` so they can
 * be tested without Astro.
 */
import { getCollection } from 'astro:content'
import { ringOrder, type Member } from './member'

export * from './member'

/** Every Member, validated, in ring order (alphabetical by slug). */
export const members: Member[] = ringOrder(
  (await getCollection('members')).map(({ id, data }) => ({ slug: id, ...data })),
)

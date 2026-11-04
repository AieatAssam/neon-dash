import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GlowCache } from '../glow-cache.ts';

test('glow cache evicts oldest sprites to stay within pixel budget', () => {
 const cache = new GlowCache(10, 10);
 cache.set('floor', 'large', 7); cache.set('runner', 'small', 3);
 assert.equal(cache.get('floor'), 'large');
 cache.set('orb', 'new', 2);
 assert.equal(cache.get('floor'), undefined);
 assert.equal(cache.get('runner'), 'small'); assert.equal(cache.get('orb'), 'new');
 cache.set('oversized', 'not retained', 11);
 assert.equal(cache.get('oversized'), undefined);
 assert.equal(cache.get('runner'), 'small');
});

test('glow cache enforces entry limit and accounts for replacement', () => {
 const cache = new GlowCache(10, 2);
 cache.set('a', 1, 8); cache.set('a', 2, 2); cache.set('b', 3, 6);
 assert.equal(cache.get('a'), 2); assert.equal(cache.get('b'), 3);
 cache.set('c', 4, 1);
 assert.equal(cache.get('a'), undefined); assert.equal(cache.get('b'), 3);
});

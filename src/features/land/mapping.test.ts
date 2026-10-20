import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landFailure, parseBuyRow, toLandPlot, toLandSnapshot, type PlotRow } from './mapping.ts';

const row = (o: Partial<PlotRow> = {}): PlotRow => ({
  plot_key: 'kuto-07', location_id: 'kuto-street', tier: 'basic', price: 25000, tile_x: 0, tile_y: 15, width: 2, depth: 2,
  owner_name: null, owned_by_me: false, ...o,
});

test('plot status comes from the server row', () => {
  assert.equal(toLandPlot(row())?.status, 'for-sale');
  assert.deepEqual(toLandPlot(row({ owner_name: 'Ọlá', owned_by_me: true })), { key: 'kuto-07', tier: 'basic', price: 25000, x: 0, y: 15, w: 2, d: 2, status: 'mine', ownerName: 'Ọlá' });
  assert.equal(toLandPlot(row({ owner_name: 'Bayo Ade' }))?.status, 'owned');
});

test('rows that do not look right are dropped', () => {
  for (const bad of [{ plot_key: 'KUTO' }, { tier: 'mega' }, { price: 0 }, { price: 1.5 }, { location_id: 'lagos' }, { tile_x: 19, width: 2 }, { tile_y: -1 }, { depth: 0 }]) {
    assert.equal(toLandPlot(row(bad as Partial<PlotRow>)), null, JSON.stringify(bad));
  }
  assert.equal(toLandSnapshot([row(), row({ tier: 'x' })], []).plots.length, 1);
});

test('the purchase result is validated', () => {
  const ok = { transaction_id: 't', plot_key: 'kuto-07', price: 25000, cash: 25000, owned_by_me: true, replayed: false };
  assert.deepEqual(parseBuyRow(ok), ok);
  for (const bad of [null, 'x', { ...ok, cash: -1 }, { ...ok, cash: '25000' }, { ...ok, replayed: 'no' }, { ...ok, plot_key: 'x' }]) assert.equal(parseBuyRow(bad), null);
});

test('database errors map to clear answers', () => {
  assert.deepEqual(landFailure('OG402', 'buy'), { status: 402, code: 'insufficient-funds', message: 'You do not have enough cash for this plot.' });
  assert.equal(landFailure('OG409', 'buy').code, 'sold');
  assert.equal(landFailure('OG404', 'buy').status, 404);
  assert.equal(landFailure('OG403', 'buy').status, 403);
  assert.equal(landFailure('OG422', 'buy').code, 'request-reused');
  assert.equal(landFailure('22023', 'buy').status, 400);
  assert.equal(landFailure('28000', 'buy').status, 401);
  assert.equal(landFailure('28000', 'read').code, 'no-character');
  assert.deepEqual(landFailure('PGRST202', 'read'), { status: 503, code: 'unavailable', message: 'Land is not open on this server yet.' });
  assert.equal(landFailure('42883', 'buy').code, 'unavailable');
  assert.equal(landFailure('XX000', 'buy').status, 500);
  assert.equal(landFailure(undefined, 'read').code, 'server');
});

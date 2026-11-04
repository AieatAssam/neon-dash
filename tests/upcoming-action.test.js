import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../core.ts';
import { upcomingAction } from '../upcoming-action.ts';

function fixture() {
  const game = createGame({ speed: 340, maxSpeed: 340 });
  game.state.obstacles = [];
  game.state.terrain = [];
  return game;
}
const spike = (x, phase = null) => ({ x, width: 26, height: 42, phase });

test('warns 1.4 seconds ahead at maximum speed, including offscreen hazards', () => {
  const game = fixture();
  game.state.obstacles = [spike(124 + 340 * 1.3)];
  assert.equal(upcomingAction(game)?.label, 'JUMP');
  assert.ok(Math.abs(upcomingAction(game).seconds - 1.3) < .001);
  game.state.obstacles[0].x = 124 + 340 * 1.5;
  assert.equal(upcomingAction(game), null);
});

test('active gates name the safe phase; safe gates explicitly say pass', () => {
  const game = fixture();
  game.state.obstacles = [{ ...spike(300, 0), kind: 'gate' }];
  assert.equal(upcomingAction(game)?.label, 'SWITCH TO VIOLET');
  game.state.phase = 1;
  assert.equal(upcomingAction(game)?.label, 'GATE · PASS');
});

test('ignores inactive spikes and passed hazards', () => {
  const game = fixture();
  game.state.obstacles = [spike(60), spike(200, 1), spike(350)];
  assert.equal(upcomingAction(game)?.label, 'JUMP');
  assert.ok(Math.abs(upcomingAction(game).seconds - (350 - 124) / 340) < .001);
});

test('terrain and obstacles compete by earliest contact, independent of array order', () => {
  const game = fixture();
  game.state.obstacles = [{ ...spike(400, 0), kind: 'gate' }, spike(450)];
  game.state.terrain = [{ kind: 'gap', x: 300, width: 90, height: 0 }];
  assert.equal(upcomingAction(game)?.label, 'JUMP · GAP');
});

test('prediction includes the speed ramp and pauses with simulation state', () => {
  const game = fixture();
  game.config.speed = 240;
  game.state.speed = 240;
  game.state.obstacles = [spike(124 + 240 * 1.4 + .6 * 1.4 ** 2)];
  assert.ok(Math.abs(upcomingAction(game).seconds - 1.4) < .001);
  assert.deepEqual(upcomingAction(game), upcomingAction(game));
});

test('a safe gate prevents premature switching for a later opposite gate', () => {
  const game = fixture();
  game.state.obstacles = [{ ...spike(250, 1), kind: 'gate' }, { ...spike(400, 0), kind: 'gate' }];
  assert.equal(upcomingAction(game)?.label, 'GATE · PASS');
});

test('safe gate cue remains until the whole runner clears it', () => {
  const game = fixture();
  game.state.obstacles = [{ ...spike(110, 1), kind: 'gate' }, { ...spike(400, 0), kind: 'gate' }];
  assert.equal(upcomingAction(game)?.label, 'GATE · PASS');
  game.state.distance = 37;
  assert.equal(upcomingAction(game)?.label, 'SWITCH TO VIOLET');
});

test('continuous crossing cues the next supporting platform edge', () => {
  const game = fixture();
  game.state.terrain = [
    { kind: 'gap', x: 332, width: 698, height: 0 },
    { kind: 'platform', x: 460, width: 170, height: 28 },
    { kind: 'platform', x: 760, width: 170, height: 18 },
  ];
  for (const [x, height, edge] of [[480, 28, 630], [780, 18, 930]]) {
    game.state.distance = x - game.state.runner.x;
    game.state.runner.y = game.config.groundY - height - game.state.runner.height;
    const cue = upcomingAction(game);
    assert.equal(cue.label, 'JUMP · GAP');
    assert.ok(Math.abs(cue.seconds - (edge - 40 - x) / 340) < .001);
    game.state.distance += edge - 40 - x;
    assert.equal(upcomingAction(game).seconds, 0, 'takeoff cue reaches zero near the ledge');
  }
});

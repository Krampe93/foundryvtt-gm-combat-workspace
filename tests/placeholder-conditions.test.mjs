import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionParticipants, conditionSourceChoices, setActorCondition, actorConditions, conditionRelations } from '../scripts/services/condition-operations.js';

test('actorless placeholders are encounter sources, persist conditions and expose both relation directions', async () => {
  globalThis.CONFIG = { statusEffects: [{ id: 'grappled', name: 'Grappled' }] };
  const make = (id, name) => ({ id, name, documentName: 'Combatant', uuid: `Combat.fight.Combatant.${id}`, flags: {},
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = structuredClone(value); } });
  const nova = make('nova', 'Nova'), orsik = make('orsik', 'Orsik');
  const base = { id: 'orsik-actor', uuid: 'Actor.orsik', name: 'Orsik', type: 'character' };
  const combat = { id: 'fight', turns: [nova, orsik], combatants: new Map([['nova', nova], ['orsik', orsik]]) };
  globalThis.game = { user: { isGM: true }, combat, actors: new Map([[base.id, base]]) };
  let participants = conditionParticipants(combat);
  assert.equal(participants.length, 2, 'Orsik world actor is not duplicated outside the encounter');
  assert.ok(participants.every(p => p.inCombat && p.placeholder));
  assert.equal(participants[1].actor, base);
  const sources = conditionSourceChoices(combat);
  assert.equal(sources[0].uuid, nova.uuid);
  await setActorCondition(nova, { statusId: 'grappled', active: true, sourceUuid: orsik.uuid }, sources);
  assert.equal(actorConditions(nova)[0].text, 'Gepackt von Orsik');
  const relation = conditionRelations(combat)[0];
  assert.equal(relation.source.combatantId, 'orsik');
  assert.equal(relation.target.combatantId, 'nova');
  assert.equal(relation.outgoingText, 'Packt gerade Nova');
  // A fresh participant resolution sees the persisted state after a rerender.
  participants = conditionParticipants(combat);
  assert.equal(actorConditions(participants[0].actor).length, 1);
  await setActorCondition(nova, { statusId: 'grappled', active: false }, sources);
  assert.equal(actorConditions(nova).length, 0);
  assert.equal(conditionRelations(combat).length, 0);
});

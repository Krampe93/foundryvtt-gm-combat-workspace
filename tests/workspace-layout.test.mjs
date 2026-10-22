import assert from "node:assert/strict";
import test from "node:test";
import { workspacePanelSizes } from "../scripts/services/workspace-layout.js";

test("fewer enemies free space for results without changing the baseline minimap size", () => {
  const base = { height: 930, gap: 8, utilityGap: 8 };
  const full = workspacePanelSizes({ ...base, enemyContentHeight: 800 });
  const six = workspacePanelSizes({ ...base, enemyContentHeight: 330 });
  const two = workspacePanelSizes({ ...base, enemyContentHeight: 166 });
  assert.equal(full.enemyHeight, full.enemyMaximum);
  assert.equal(six.enemyHeight, 330);
  assert.equal(two.enemyHeight, 166);
  assert.equal(two.minimapHeight, full.minimapHeight);
  assert.equal(six.minimapHeight, full.minimapHeight);
  const results = (sizes) => base.height - base.gap - sizes.enemyHeight - base.utilityGap - sizes.minimapHeight;
  assert.equal(results(two) - results(six), 164, "every freed pixel goes to the results panel");
});

test("panel limits follow viewport resizing and remain valid in a cramped window", () => {
  for (const height of [500, 768, 930, 1440]) {
    const sizes = workspacePanelSizes({ height, gap: 8, utilityGap: 8, enemyContentHeight: 1200 });
    assert.ok(sizes.enemyHeight <= (height - 8) * 0.47);
    assert.equal(sizes.minimapHeight, ((height - 8) * 0.53 - 8) * 0.7);
  }
  assert.equal(workspacePanelSizes({ height: 0, gap: 8, utilityGap: 8, enemyContentHeight: 0 }).minimapHeight, 0);
});

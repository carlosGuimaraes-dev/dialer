import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFeedBodyState } from "./feedState";

const settled = { textsLoading: false, historyLoading: false, textsError: null, historyError: null };

test("loading while either source is on its first load, even with items already", () => {
  assert.equal(resolveFeedBodyState({ ...settled, textsLoading: true, itemCount: 3 }), "loading");
  assert.equal(resolveFeedBodyState({ ...settled, historyLoading: true, itemCount: 3 }), "loading");
  assert.equal(resolveFeedBodyState({ ...settled, itemCount: 0 }), "empty");
});

test("a failed source reports error instead of looking empty", () => {
  assert.equal(resolveFeedBodyState({ ...settled, textsError: new Error("boom"), itemCount: 0 }), "error");
  assert.equal(resolveFeedBodyState({ ...settled, historyError: "no", itemCount: 2 }), "error");
});

test("settled sources with items show content", () => {
  assert.equal(resolveFeedBodyState({ ...settled, itemCount: 1 }), "content");
});

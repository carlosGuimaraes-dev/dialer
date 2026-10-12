import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createTwenty, deleteTwenty, getTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { CURRENT_VIEW, cleanFilters, cleanScope, mapFilterView, type FilterViewRecord } from "./helpers.js";

/*
 * Contact filters saved to the signed-in member's account (dialerFilterView in
 * Twenty), so a filter set follows the user to any browser instead of living
 * in one browser's localStorage. Each member has one auto-saved "current"
 * view per scope plus any named views they save.
 */

const router = Router();
router.use(authMiddleware);
const log = createLogger("filter-views");

const NOT_SET_UP = "Saved filters are not set up in Twenty yet. Run `bun run twenty:schema`.";

function fail(res: any, err: any, action: string) {
  const msg = String(err?.message ?? "");
  if (/dialerFilterView/i.test(msg) && /(404|400|not found|does not exist|Unknown|Cannot find)/i.test(msg)) {
    res.status(503).json({ error: NOT_SET_UP });
    return;
  }
  log.error(`${action} failed: ${msg}`);
  res.status(502).json({ error: `Failed to ${action}`, details: msg });
}

async function memberViews(memberId: string, scope: string): Promise<FilterViewRecord[]> {
  const rows = await listTwenty<FilterViewRecord>("dialerFilterViews", { limit: 200, filter: `memberId[eq]:"${memberId}"` });
  return rows.filter((r) => r.memberId === memberId && r.scope === scope);
}

function requireMember(req: AuthRequest, res: any): string | null {
  if (req.workspaceMemberId) return req.workspaceMemberId;
  res.status(400).json({ error: "Sign out and back in so your filters can be saved to your account." });
  return null;
}

/** GET /api/filter-views?scope=dock - the member's current filters and named views. */
router.get("/", async (req: AuthRequest, res) => {
  const memberId = requireMember(req, res);
  if (!memberId) return;
  try {
    const rows = await memberViews(memberId, cleanScope(req.query.scope));
    const current = rows.find((r) => r.name === CURRENT_VIEW);
    res.json({
      current: current ? mapFilterView(current).filters : null,
      views: rows.filter((r) => r.name !== CURRENT_VIEW).map(mapFilterView).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    fail(res, err, "load saved filters");
  }
});

/** PUT /api/filter-views/current { scope, filters } - remember the filters on screen. */
router.put("/current", async (req: AuthRequest, res) => {
  const memberId = requireMember(req, res);
  if (!memberId) return;
  const scope = cleanScope(req.body?.scope);
  const filters = cleanFilters(req.body?.filters);
  try {
    const existing = (await memberViews(memberId, scope)).find((r) => r.name === CURRENT_VIEW);
    const actor = await resolveActor(req);
    const saved = existing
      ? await updateTwenty<FilterViewRecord>("dialerFilterViews", existing.id, { filters }, actor)
      : await createTwenty<FilterViewRecord>("dialerFilterViews", { name: CURRENT_VIEW, scope, memberId, filters }, actor);
    res.json(mapFilterView(saved));
  } catch (err) {
    fail(res, err, "save the current filters");
  }
});

/** POST /api/filter-views { scope, name, filters } - a named filter set. */
router.post("/", async (req: AuthRequest, res) => {
  const memberId = requireMember(req, res);
  if (!memberId) return;
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  if (!name || name === CURRENT_VIEW) {
    res.status(400).json({ error: "Give the filter set a name." });
    return;
  }
  try {
    const created = await createTwenty<FilterViewRecord>(
      "dialerFilterViews",
      { name, scope: cleanScope(req.body?.scope), memberId, filters: cleanFilters(req.body?.filters) },
      await resolveActor(req),
    );
    res.status(201).json(mapFilterView(created));
  } catch (err) {
    fail(res, err, "save the filter set");
  }
});

/** DELETE /api/filter-views/:id - only the member's own views. */
router.delete("/:id", async (req: AuthRequest, res) => {
  const memberId = requireMember(req, res);
  if (!memberId) return;
  try {
    const view = await getTwenty<FilterViewRecord>("dialerFilterViews", req.params.id as string);
    if (view?.memberId !== memberId) {
      res.status(404).json({ error: "No such saved filter set." });
      return;
    }
    await deleteTwenty("dialerFilterViews", req.params.id as string);
    res.status(204).end();
  } catch (err) {
    fail(res, err, "delete the filter set");
  }
});

export default router;

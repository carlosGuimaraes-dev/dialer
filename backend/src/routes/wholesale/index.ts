import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { listTwenty } from "../../lib/twenty/client/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { mapBuilderMatch, mapBuybox, type BuilderMatchRecord, type BuyboxRecord } from "./helpers.js";

/**
 * The wholesale records a call sits between: a seller lot has builder matches
 * (buyboxes that fit the parcel), a builder has buyboxes (what it will buy).
 * Read-only: the matching pipeline owns the scores, the dialer only shows them.
 */
const router = Router();
router.use(authMiddleware);
const log = createLogger("wholesale");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/wholesale/matches?landOpportunityId=<uuid> */
router.get("/matches", async (req, res) => {
  const id = String(req.query.landOpportunityId ?? "");
  if (!UUID.test(id)) {
    res.status(400).json({ error: "Pass landOpportunityId" });
    return;
  }
  try {
    const rows = await listTwenty<BuilderMatchRecord>("builderMatches", {
      limit: 50,
      filter: `landOpportunityId[eq]:"${id}"`,
      // depth=1 brings the buybox and builder nested, so the panel needs no second call.
      query: { order_by: "matchScore[DescNullsLast]", depth: "1" },
    });
    res.json(rows.map(mapBuilderMatch));
  } catch (err) {
    // No matches is a normal state for a fresh lot: answer empty, not 5xx.
    log.info(`builder matches for ${id}: ${(err as Error).message}`);
    res.json([]);
  }
});

/** GET /api/wholesale/buyboxes?buyerId=<uuid> */
router.get("/buyboxes", async (req, res) => {
  const id = String(req.query.buyerId ?? "");
  if (!UUID.test(id)) {
    res.status(400).json({ error: "Pass buyerId" });
    return;
  }
  try {
    const rows = await listTwenty<BuyboxRecord>("buyboxes", { limit: 50, filter: `buyerId[eq]:"${id}"` });
    res.json(rows.map(mapBuybox));
  } catch (err) {
    log.info(`buyboxes for ${id}: ${(err as Error).message}`);
    res.json([]);
  }
});

export default router;

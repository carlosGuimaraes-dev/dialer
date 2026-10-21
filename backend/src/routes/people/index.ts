import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createTwenty, deleteTwenty, getTwenty, listTwenty, updateTwenty } from "../../lib/twenty/client/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { UUID, mapPerson, personPayload, type AgencyPersonRecord } from "./helpers.js";

/**
 * People in the workspace. A seller lot owns one through landOpportunity.ownerContact,
 * a buyer points at one through buyer.pointOfContact; the reverse relations
 * (person.ownedLandOpportunities, person.buyers) list them from the person's side.
 */
import { OBJECTS } from "../../lib/wholesale/objects.js";
const PERSON_OBJECT = OBJECTS.people as string;
const PROSPECT_OBJECT = OBJECTS.prospects as string;
const LEAD_OBJECT = OBJECTS.leads as string;
const router = Router();
router.use(authMiddleware);
const log = createLogger("people");

/** GET /api/people?prospectId=<uuid> or ?leadId=<uuid> */
router.get("/", async (req, res) => {
  const prospectId = String(req.query.prospectId ?? "");
  const leadId = String(req.query.leadId ?? "");
  try {
    if (UUID.test(prospectId)) {
      // Reverse relation: Twenty rejects a filter on a column the object lacks.
      const rows = await listTwenty<AgencyPersonRecord>(PERSON_OBJECT, {
        limit: 50,
        filter: `ownedLandOpportunities.id[eq]:"${prospectId}"`,
        // depth=1 so ownedLandOpportunities comes back and mapPerson can read the lot id.
        query: { depth: "1" },
      });
      res.json(rows.map(mapPerson));
      return;
    }
    if (UUID.test(leadId)) {
      const lead = await getTwenty<{ pointOfContactId?: string | null }>(LEAD_OBJECT, leadId);
      if (!lead?.pointOfContactId) {
        res.json([]);
        return;
      }
      res.json([mapPerson(await getTwenty<AgencyPersonRecord>(`${PERSON_OBJECT}/`, lead.pointOfContactId))]);
      return;
    }
    res.status(400).json({ error: "Pass prospectId or leadId" });
  } catch (err: any) {
    log.error(`load people failed: ${err?.message}`);
    res.status(502).json({ error: "Failed to load people", details: err?.message });
  }
});

/** POST /api/people { name, jobTitle?, role?, phone?, email?, linkedin?, prospectId? or leadId? } */
router.post("/", async (req: AuthRequest, res) => {
  const body = req.body ?? {};
  const payload = personPayload(body);
  if (!payload.name) {
    res.status(400).json({ error: "A name is required" });
    return;
  }
  const prospectId = String(body.prospectId ?? "");
  const leadId = String(body.leadId ?? "");
  try {
    const actor = await resolveActor(req);
    const created = await createTwenty<AgencyPersonRecord>(PERSON_OBJECT, payload, actor);
    // Attach the person from the side that owns the relation.
    if (UUID.test(prospectId)) await updateTwenty(PROSPECT_OBJECT, prospectId, { ownerContactId: created.id }, actor);
    if (UUID.test(leadId)) await updateTwenty(LEAD_OBJECT, leadId, { pointOfContactId: created.id }, actor);
    res.status(201).json(mapPerson(created));
  } catch (err: any) {
    log.error(`create person failed: ${err?.message}`);
    res.status(502).json({ error: "Failed to add the person", details: err?.message });
  }
});

/** PATCH /api/people/:id */
router.patch("/:id", async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const payload = personPayload(req.body ?? {});
  if (!UUID.test(id) || Object.keys(payload).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  try {
    const updated = await updateTwenty<AgencyPersonRecord>(PERSON_OBJECT, id, payload, await resolveActor(req));
    res.json(mapPerson(updated));
  } catch (err: any) {
    log.error(`update person failed: ${err?.message}`);
    res.status(502).json({ error: "Failed to update the person", details: err?.message });
  }
});

/** DELETE /api/people/:id. Twenty soft-deletes, so it can be restored there. */
router.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) {
    res.status(400).json({ error: "Bad id" });
    return;
  }
  try {
    await deleteTwenty(PERSON_OBJECT, id);
    res.status(204).end();
  } catch (err: any) {
    log.error(`delete person failed: ${err?.message}`);
    res.status(502).json({ error: "Failed to remove the person", details: err?.message });
  }
});

export default router;

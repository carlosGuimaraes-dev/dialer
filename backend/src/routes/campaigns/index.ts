import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwenty, createTwenty, updateTwenty, deleteTwenty, getTwenty } from "../../lib/twenty/client/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import type { AgencyCampaign } from "./types.js";
import { mapCampaign, mapCampaignType } from "./helpers/index.js";

import { OBJECTS } from "../../lib/wholesale/objects.js";
const CAMPAIGN_OBJECT = OBJECTS.campaigns as string;
const SCRIPT_OBJECT = OBJECTS.scripts as string;
const router = Router();
router.use(authMiddleware);

const log = createLogger('campaigns');

router.get("/", async (_req, res) => {
  try {
    log.info('Listing campaigns from Twenty CRM');
    const campaigns = await listTwenty<AgencyCampaign>(CAMPAIGN_OBJECT, 100);

    const mapped = campaigns.map(mapCampaign);

    log.info(`Returning ${mapped.length} campaigns`);
    res.json(mapped);
  } catch (err: any) {
    log.error("Failed to list campaigns:", err.message);
    res.status(500).json({ error: "Failed to fetch campaigns from Twenty", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    log.info(`Getting campaign ${req.params.id}`);
    const id = req.params.id as string;
    const campaign = await getTwenty<AgencyCampaign>(CAMPAIGN_OBJECT, id);

    const mapped = mapCampaign(campaign);

    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to get campaign ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Campaign not found" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, type, status, settings, utmSource, campaignType } = req.body;

    log.info(`Creating campaign: ${name}`);

    const payload: any = {
      name: name || "New Campaign",
      status: status || "ACTIVE",
      campaignType: campaignType || mapCampaignType(utmSource || type || "outbound"),
      note: settings ? JSON.stringify(settings) : undefined,
    };

    const result = await createTwenty<any>(CAMPAIGN_OBJECT, payload, await resolveActor(req));
    const campaign = result.data || result;

    const mapped = mapCampaign(campaign);

    log.info(`Created campaign ${campaign.id}`);
    res.status(201).json(mapped);
  } catch (err: any) {
    log.error("Failed to create campaign:", err.message);
    res.status(500).json({ error: "Failed to create campaign in Twenty", details: err.message });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { name, type, status, settings, utmSource, campaignType } = req.body;

    log.info(`Updating campaign ${req.params.id}`);
    const id = req.params.id as string;

    const payload: any = {};
    if (name !== undefined) payload.name = name;

    // Handle status - accept both frontend format and Twenty format
    if (status !== undefined) {
      const s = String(status).toUpperCase().replace("-", "_");
      // Frontend sends: active/paused/draft, Twenty stores: ACTIVE/INACTIVE/DRAFT
      const twentyStatus = s === "PAUSED" ? "INACTIVE" : s === "ACTIVE" ? "ACTIVE" : "DRAFT";
      payload.status = twentyStatus;
    }

    // Handle type - accept both Twenty format and frontend format
    if (campaignType !== undefined) {
      payload.campaignType = String(campaignType).toUpperCase().replace("-", "_");
    } else if (utmSource !== undefined || type !== undefined) {
      payload.campaignType = mapCampaignType(utmSource || type);
    }

    if (settings !== undefined) payload.note = JSON.stringify(settings);

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const result = await updateTwenty<any>(CAMPAIGN_OBJECT, id, payload, await resolveActor(req));
    const campaign = result.data || result;

    const mapped = mapCampaign(campaign);

    log.info(`Updated campaign ${campaign.id}`);
    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to update campaign ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to update campaign in Twenty", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    log.info(`Deleting campaign ${req.params.id}`);
    const id = req.params.id as string;

    await deleteTwenty(CAMPAIGN_OBJECT, id);

    log.info(`Deleted campaign ${id}`);
    res.status(204).end();
  } catch (err: any) {
    log.error(`Failed to delete campaign ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to delete campaign from Twenty", details: err.message });
  }
});

export default router;

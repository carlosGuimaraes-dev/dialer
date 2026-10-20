import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwenty, listTwentyAll, createTwenty, updateTwenty, deleteTwenty, getTwenty } from "../../lib/twenty/client/index.js";
import { guardContactStatus } from "../../lib/pipelines/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { broadcastNewLead, markLeadNotified } from "../../lib/leads/notify/index.js";
import type { AgencyCampaign, AgencyLead } from "./types.js";
import { mapLeadToFrontend, frontendStatusToTwenty, toTwentyPhone, toTwentyEmail, getLeadCallCounts } from "./helpers/index.js";
import { OBJECTS, contactRelationId } from "../../lib/wholesale/objects.js";
import { mapBuyerListItem, mapBuyerDetail, mapBuyerUpdateResult, frontendToBuyerPayload } from "../../lib/wholesale/buyer/map.js";
import { listTwentyAll as listAllRaw } from "../../lib/twenty/client/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('leads');

/** The Twenty object behind "lead" (buyers in the wholesale workspace). */
const LEAD_OBJECT = OBJECTS.leads as string;
const CALL_OBJECT = OBJECTS.calls as string;
const LEAD_RELATION_ID = contactRelationId("leads");
const isAgency = LEAD_OBJECT === "agencyLeads";

/** Point-of-contact phone/email for a buyer (lives on the person row). */
async function buyerContact(pointOfContactId?: string | null) {
  if (!pointOfContactId) return null;
  try {
    const person: any = await getTwenty("people", pointOfContactId);
    const phoneRaw = person?.phones;
    const phone = typeof phoneRaw === "object" && phoneRaw ? phoneRaw.primaryPhoneNumber : typeof phoneRaw === "string" ? phoneRaw : null;
    const emailRaw = person?.emails;
    const email = typeof emailRaw === "object" && emailRaw ? emailRaw.primaryEmail : typeof emailRaw === "string" ? emailRaw : null;
    return { phone: phone || null, email: email || null, name: person?.name ? [person.name.firstName, person.name.lastName].filter(Boolean).join(" ") : null };
  } catch {
    return null;
  }
}

/** Call counts for the current lead object (relation column follows it). */
async function leadCallCounts(): Promise<Map<string, number>> {
  if (isAgency) return getLeadCallCounts();
  try {
    const calls = await listAllRaw<Record<string, unknown>>(CALL_OBJECT);
    const counts = new Map<string, number>();
    for (const call of calls) {
      const owner = call[LEAD_RELATION_ID];
      if (typeof owner === "string") counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  } catch {
    return new Map();
  }
}

router.get("/", async (_req, res) => {
  try {
    log.info('Listing leads from Twenty CRM');
    const leads = await listTwentyAll<AgencyLead>(LEAD_OBJECT);

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    // Real per-lead call counts in one fetch (best-effort; see helper)
    const callCounts = await leadCallCounts();

    const mapped = isAgency
      ? leads.map((lead) => mapLeadToFrontend(lead, campaignMap, callCounts.get(lead.id) ?? 0))
      : leads.map((lead: any) => mapBuyerListItem(lead));

    log.info(`Returning ${mapped.length} leads`);
    res.json(mapped);
  } catch (err: any) {
    log.error("Failed to list leads:", err.message);
    res.status(500).json({ error: "Failed to fetch leads from Twenty", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    log.info(`Getting lead ${req.params.id}`);
    const id = req.params.id as string;
    const lead = await getTwenty<AgencyLead>(LEAD_OBJECT, id);

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    const mapped = isAgency
      ? mapLeadToFrontend(lead, campaignMap, (await leadCallCounts()).get(lead.id) ?? 0)
      : mapBuyerDetail(lead as any, await buyerContact((lead as any)?.pointOfContactId));

    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to get lead ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Lead not found" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      first_name, last_name, company, phone, email, website,
      address, city, state, zip, status, source, campaign_id,
      assigned_to, tags, notes, dnc,
    } = req.body;

    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    
    // Map our status to Twenty's coldCallStatus
    const coldCallStatus = frontendStatusToTwenty(status, dnc);

    log.info(`Creating lead: ${fullName}`);
    
    const payload: Record<string, unknown> = isAgency
      ? {
          contactName: fullName,
          email: toTwentyEmail(email),
          phone: toTwentyPhone(phone),
          company: company,
          status: coldCallStatus === "DO_NOT_CONTACT" ? "LOST" : "NEW",
          coldCallStatus,
          source: source,
          note: notes,
          outboundMessage: undefined,
          createdById: req.workspaceMemberId ?? req.twentyUserId,
        }
      : frontendToBuyerPayload({ first_name, last_name, status, source, notes });

    const result = await createTwenty<any>(LEAD_OBJECT, payload, await resolveActor(req));
    const lead = result.data || result;
    
    const mapped = isAgency
      ? {
          id: lead.id,
          first_name,
          last_name,
          company,
          phone,
          email,
          website,
          address,
          city,
          state,
          zip,
          status: coldCallStatus === "DO_NOT_CONTACT" ? "not_interested" : "new",
          source,
          campaign_id: campaign_id,
          assigned_to: req.workspaceMemberId ?? req.twentyUserId,
          tags: tags ? JSON.stringify(tags) : null,
          notes,
          dnc: Boolean(dnc),
          last_called_at: null,
          call_count: 0,
          sync_id: lead.outboundMessage || undefined,
          created_at: lead.createdAt || new Date().toISOString(),
          updated_at: lead.updatedAt || new Date().toISOString(),
        }
      : mapBuyerDetail(lead as any);

    log.info(`Created lead ${lead.id}`);
    // Global Bark broadcast to every member with a BARK_KEY.
    // Fire-and-forget: a push failure must never fail the lead creation.
    // Mark first so the Twenty webhook (agencyLead.created) dedupes this id.
    markLeadNotified(String(lead.id));
    void broadcastNewLead(req, {
      id: String(lead.id),
      contactName: fullName || null,
      company: company || null,
      phone: phone || null,
      email: email || null,
    }).catch((err: any) => log.error(`New-lead broadcast failed: ${err?.message || err}`));
    res.status(201).json(mapped);
  } catch (err: any) {
    log.error("Failed to create lead:", err.message);
    res.status(500).json({ error: "Failed to create lead in Twenty", details: err.message });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    log.info(`Updating lead ${req.params.id}`);
    
    const {
      first_name, last_name, company, phone, email, website,
      address, city, state, zip, status, source, campaign_id,
      assigned_to, tags, notes, dnc,
    } = req.body;

    const payload: any = {};
    
    if (first_name !== undefined || last_name !== undefined) {
      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
      if (fullName) payload.contactName = fullName;
    }
    
    if (company !== undefined) payload.company = company;
    // Empty phone/email means "no value": omit the key so Twenty keeps its
    // validated state instead of rejecting an empty composite.
    // Only the primary is sent: Twenty updates composite sub-fields
    // individually, so leaving out the additional list keeps the record's
    // extra numbers/addresses instead of wiping them on every edit.
    if (isAgency && phone !== undefined) {
      const twentyPhone = toTwentyPhone(phone);
      if (twentyPhone !== undefined) {
        const { additionalPhones: _keepExisting, ...primaryOnly } = twentyPhone;
        payload.phone = primaryOnly;
      }
    }
    if (isAgency && email !== undefined) {
      const twentyEmail = toTwentyEmail(email);
      if (twentyEmail !== undefined) payload.email = { primaryEmail: twentyEmail.primaryEmail };
    }
    if (isAgency && notes !== undefined) payload.note = notes;
    if (isAgency && source !== undefined) payload.source = source;

    // Handle campaign relation (agency objects only)
    if (isAgency && campaign_id !== undefined) {
      payload.campaignIdId = campaign_id || null;
    }
    
    // Status changes follow the contact pipeline (packages/shared
    // contact-status): a move it does not allow is refused with the reason.
    if (status !== undefined || dnc) {
      const guard = await guardContactStatus(LEAD_OBJECT, req.params.id as string, status, { dnc, reopen: req.body?.reopen === true });
      if (!guard.ok) {
        res.status(guard.status).json({ error: guard.reason, code: "INVALID_TRANSITION" });
        return;
      }
      payload.coldCallStatus = guard.to;
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const id = req.params.id as string;
    const result = await updateTwenty<any>(LEAD_OBJECT, id, payload, await resolveActor(req));
    const lead = result.data || result;

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>('agencyCampaigns', 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    // Return mapped response
    const mapped = isAgency
      ? mapLeadToFrontend(lead, campaignMap, (await leadCallCounts()).get(lead.id) ?? 0)
      : mapBuyerUpdateResult(lead as any);

    log.info(`Updated lead ${lead.id}`);
    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to update lead ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to update lead in Twenty", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    log.info(`Deleting lead ${req.params.id}`);
    const id = req.params.id as string;
    
    await deleteTwenty(LEAD_OBJECT, id);
    
    log.info(`Deleted lead ${id}`);
    res.status(204).end();
  } catch (err: any) {
    log.error(`Failed to delete lead ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to delete lead from Twenty", details: err.message });
  }
});

export default router;

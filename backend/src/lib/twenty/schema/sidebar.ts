/*
 * Which objects the workspace sidebar shows.
 *
 * The dialer added its own objects to the workspace (agencyCall, agencyPhone,
 * callCampaign, ...). They are infrastructure for the app, not things the team
 * browses, so they must not appear in Twenty's sidebar next to the business
 * objects the workspace already had (Land Opportunities, Buyers, Buyboxes,
 * Builder Matches).
 *
 * Twenty's sidebar is the `navigationMenuItems` table, one row per entry per
 * user. Hiding an object means removing its rows; the object, its fields and
 * its API stay exactly as they are, so the dialer keeps working and the change
 * is reversible (re-run with `--restore` and the saved rows).
 */
import { SCHEMA_OBJECTS } from "./manifest.js";
import type { MetadataRequest } from "./types.js";

/** The objects the workspace had before the dialer: these keep their sidebar entries. */
export const BUSINESS_OBJECTS = ["landOpportunity", "buyer", "buybox", "builderMatch"] as const;

/**
 * Objects an earlier version of the dialer created and the current manifest no
 * longer lists: prospects and leads became landOpportunity and buyer, and the
 * agency person/offer pair belongs to the agency funnel. They may still exist
 * in the workspace, and their sidebar rows are dialer leftovers either way.
 */
const LEGACY_INTERNAL_OBJECTS = ["agencyProspect", "agencyLead", "agencyPerson", "agencyOffer"] as const;

/** The dialer's own objects: hidden from the sidebar unless they are a business object. */
export function internalObjectNames(): string[] {
  const names = new Set<string>(LEGACY_INTERNAL_OBJECTS);
  for (const o of SCHEMA_OBJECTS) names.add(o.nameSingular);
  return [...names].filter((name) => !(BUSINESS_OBJECTS as readonly string[]).includes(name));
}

interface NavItem {
  id: string;
  type: string;
  name: string | null;
  position: number | null;
  targetObjectMetadataId: string | null;
  folderId: string | null;
  applicationId: string | null;
  userWorkspaceId: string | null;
}

interface ObjectRow {
  id: string;
  nameSingular: string;
  namePlural: string;
}

const NAV_ITEMS = `{ navigationMenuItems { id type name position targetObjectMetadataId folderId applicationId userWorkspaceId } }`;
const OBJECTS = `{ objects(paging: { first: 1000 }) { edges { node { id nameSingular namePlural } } } }`;
const DELETE_ITEM = `mutation DeleteNavItem($id: UUID!) { deleteNavigationMenuItem(id: $id) { id } }`;
const CREATE_ITEM = `mutation CreateNavItem($input: CreateOneNavigationMenuItemInput!) {
  createNavigationMenuItem(input: $input) { id } }`;

export interface SidebarChange {
  object: string;
  /** "hidden": the item was (or would be) removed. "restored": it was put back. */
  action: "hidden" | "restored";
  itemId: string | null;
  name: string | null;
  status: "done" | "planned" | "failed";
  note?: string;
}

export interface SidebarReport {
  changes: SidebarChange[];
  /** Objects the sidebar keeps: everything that is not internal. */
  visible: string[];
  /** Internal objects that had no sidebar entry to remove. */
  alreadyHidden: string[];
}

async function readState(request: MetadataRequest) {
  const [nav, objects] = await Promise.all([
    request<{ navigationMenuItems: NavItem[] }>(NAV_ITEMS),
    request<{ objects: { edges: { node: ObjectRow }[] } }>(OBJECTS),
  ]);
  return { items: nav.navigationMenuItems ?? [], objects: objects.objects.edges.map((e) => e.node) };
}

/**
 * Removes (or, with `restore`, re-creates) the sidebar entries of the dialer's
 * own objects. `dryRun` reports what it would do. Only navigation rows are
 * touched: no object, field or record is deleted.
 */
export async function hideInternalObjects(
  request: MetadataRequest,
  options: { dryRun?: boolean; restore?: SidebarItemBackup[] } = {},
): Promise<SidebarReport> {
  const { items, objects } = await readState(request);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const internal = new Set(internalObjectNames());
  const changes: SidebarChange[] = [];
  const alreadyHidden: string[] = [];
  const seen = new Set<string>();

  if (options.restore) {
    const draft: SidebarReport = { changes, visible: [], alreadyHidden };
    for (const saved of options.restore) {
      const target = objects.find((o) => o.nameSingular === saved.object);
      if (!target) {
        changes.push({ object: saved.object, action: "restored", itemId: null, name: saved.name, status: "failed", note: "no such object in this workspace" });
        continue;
      }
      if (options.dryRun) {
        changes.push({ object: saved.object, action: "restored", itemId: null, name: saved.name, status: "planned" });
        continue;
      }
      try {
        const created = await request<{ createNavigationMenuItem: { id: string } }>(CREATE_ITEM, {
          input: { type: saved.type, name: saved.name, position: saved.position, targetObjectMetadataId: target.id, folderId: saved.folderId, applicationId: saved.applicationId },
        });
        changes.push({ object: saved.object, action: "restored", itemId: created.createNavigationMenuItem.id, name: saved.name, status: "done" });
      } catch (err) {
        changes.push({ object: saved.object, action: "restored", itemId: null, name: saved.name, status: "failed", note: (err as Error).message.slice(0, 200) });
      }
    }
    draft.visible = objects.map((o) => o.nameSingular).filter((n) => !internal.has(n));
    return draft;
  }

  for (const item of items) {
    const object = item.targetObjectMetadataId ? byId.get(item.targetObjectMetadataId) : undefined;
    if (!object || !internal.has(object.nameSingular)) continue;
    seen.add(object.nameSingular);
    if (options.dryRun) {
      changes.push({ object: object.nameSingular, action: "hidden", itemId: item.id, name: item.name, status: "planned" });
      continue;
    }
    try {
      await request(DELETE_ITEM, { id: item.id });
      changes.push({ object: object.nameSingular, action: "hidden", itemId: item.id, name: item.name, status: "done" });
    } catch (err) {
      changes.push({ object: object.nameSingular, action: "hidden", itemId: item.id, name: item.name, status: "failed", note: (err as Error).message.slice(0, 200) });
    }
  }

  for (const name of internal) if (!seen.has(name)) alreadyHidden.push(name);
  return { changes, visible: objects.map((o) => o.nameSingular).filter((n) => !internal.has(n)), alreadyHidden };
}

/** A removed row, in the shape `hideInternalObjects({ restore })` takes. */
export interface SidebarItemBackup {
  object: string;
  type: string;
  name: string | null;
  position: number | null;
  folderId: string | null;
  applicationId: string | null;
}

/** The rows a run removed, so `--restore` can put them back. */
export async function readSidebarBackup(request: MetadataRequest): Promise<SidebarItemBackup[]> {
  const { items, objects } = await readState(request);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const internal = new Set(internalObjectNames());
  return items
    .filter((i) => i.targetObjectMetadataId && internal.has(byId.get(i.targetObjectMetadataId)?.nameSingular ?? ""))
    .map((i) => ({
      object: byId.get(i.targetObjectMetadataId!)!.nameSingular,
      type: i.type,
      name: i.name,
      position: i.position,
      folderId: i.folderId,
      applicationId: i.applicationId,
    }));
}

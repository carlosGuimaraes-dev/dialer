/*
 * The demo workspace: a small, fictional land acquisition team calling
 * absentee owners and builders. Every record is in the shape Twenty stores it,
 * so the same data seeds a fresh workspace (seed/seedDemo.ts) and feeds the
 * screenshot capture (scripts/screenshots), which maps it through the real
 * route helpers.
 *
 * Sellers are landOpportunities (the dialer's "prospect" role), builders are
 * buyers (the "lead" role): the same two objects the live workspace uses.
 *
 * Nothing here is real. Phone numbers are in the 555-01xx range reserved for
 * fiction, e-mail and web addresses use the .example domain, parcel numbers
 * follow no county's format, and ids are fixed so seeding twice updates rather
 * than duplicates.
 */

/** A fixed, valid UUID per record: group 1-9, n 1-999. Pure. */
export function demoId(group: number, n: number): string {
  return `de000000-0000-4000-a000-${String(group * 1000 + n).padStart(12, "0")}`;
}

export const DEMO_MEMBERS = [
  { id: demoId(1, 1), name: "Alex Rivera", email: "alex@agency.example" },
  { id: demoId(1, 2), name: "Sam Chen", email: "sam@agency.example" },
  { id: demoId(1, 3), name: "Jordan Patel", email: "jordan@agency.example" },
  { id: demoId(1, 4), name: "Taylor Brooks", email: "taylor@agency.example" },
] as const;

/** The signed-in member in the screenshots. */
export const DEMO_USER = DEMO_MEMBERS[0];

type Member = (typeof DEMO_MEMBERS)[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function actor(m: Member) {
  return { source: "MANUAL", workspaceMemberId: m.id, name: m.name, context: null };
}

function note(at: Date, author: Member, body: string): string {
  return `--- ${at.toISOString()} | ${author.name}\n${body}`;
}

const CAMPAIGNS = [
  { n: 1, name: "Travis County absentees", campaignType: "COLD_CALL", status: "ACTIVE", utmSource: "OUTBOUND", industryId: "VACANT_LOT", urlKey: "travis-absentees" },
  { n: 2, name: "Infill lots - Austin core", campaignType: "COLD_CALL", status: "ACTIVE", utmSource: "OUTBOUND", industryId: "INFILL_LOT", urlKey: "austin-infill" },
  { n: 3, name: "Builder outreach", campaignType: "OUTBOUND", status: "DRAFT", utmSource: "BLENDED", industryId: "BUILDABLE_LOT", urlKey: "builders" },
];

/**
 * [owner, parcel, street, city, state, zip, county, zoning, sqft, property type,
 *  asking price, seller stage, cold call status, campaign, phone]
 */
type SellerRow = [string, string, string, string, string, string, string, string, number, string, number, string, string, number, string];

const SELLERS: SellerRow[] = [
  ["Maria Lopez", "0451-2210", "1204 Cedar St", "Austin", "TX", "78702", "Travis", "SF-3", 8712, "INFILL_LOT", 145000, "INTERESTED", "INTERESTED", 1, "+15125550124"],
  ["Delia Marsh", "0451-3348", "3307 Cherry Ln", "Austin", "TX", "78703", "Travis", "SF-2", 10450, "TEARDOWN", 210000, "CONTACTED", "CALLBACK", 2, "+15125550131"],
  ["Robert Vance", "0463-8820", "912 Bluebonnet Rd", "Round Rock", "TX", "78664", "Williamson", "R-1", 15800, "VACANT_LOT", 96000, "READY_FOR_OUTREACH", "NEW", 1, "+15125550137"],
  ["Ana Ferreira", "0451-9917", "4801 Manor Rd", "Austin", "TX", "78723", "Travis", "SF-3-NP", 6230, "VACANT_LOT", 132000, "NOT_INTERESTED", "NOT_INTERESTED", 2, "+15125550144"],
  ["Charles Okonkwo", "0470-1187", "18 Hillview Ct", "San Marcos", "TX", "78666", "Hays", "R-1", 22600, "BUILDABLE_LOT", 88000, "NEW_LEAD", "NEW", 1, "+15125550152"],
  ["Bethany Cruz", "0451-5522", "4708 Duval St", "Austin", "TX", "78751", "Travis", "SF-3", 7920, "INFILL_LOT", 265000, "INTERESTED", "INTERESTED", 2, "+15125550158"],
  ["Priya Nair", "0488-7710", "2210 Wells Branch Pkwy", "Pflugerville", "TX", "78660", "Travis", "SF-1", 11900, "TEARDOWN", 118000, "CONTACTED", "CONTACTED", 1, "+15125550163"],
  ["Douglas Hale", "0451-6604", "705 Rosewood Ave", "Austin", "TX", "78702", "Travis", "SF-3", 6540, "INFILL_LOT", 189000, "READY_FOR_OUTREACH", "NEW", 2, "+15125550169"],
  ["Wilma Tucker", "0512-3301", "14900 Wells Port Dr", "Manor", "TX", "78653", "Travis", "R-1", 43560, "VACANT_LOT", 74000, "NEW_LEAD", "NEW", 1, "+15125550176"],
  ["R. Molina (estate)", "0512-4418", "3300 Old Highway 20", "Elgin", "TX", "78621", "Bastrop", "AG", 218000, "VACANT_LOT", 155000, "NO_RESPONSE", "CALLBACK", 1, "+15125550182"],
  ["Terrence Boyd", "0533-9902", "5510 Sendero Verde", "Austin", "TX", "78735", "Travis", "RR", 31200, "BUILDABLE_LOT", 410000, "INTERESTED", "INTERESTED", 2, "+15125550191"],
  ["Lorraine Kuhn", "0533-1218", "8601 Marsh Dr", "Austin", "TX", "78750", "Travis", "SF-2", 13800, "TEARDOWN", 227000, "DO_NOT_CONTACT", "DO_NOT_CONTACT", 2, "+15125550203"],
  ["Hector Salinas", "0467-5514", "1403 Pecan St", "Buda", "TX", "78610", "Hays", "R-1", 9600, "INFILL_LOT", 101000, "CONTACTED", "CONTACTED", 1, "+15125550211"],
  ["Gwen Alvarado", "0467-6621", "9 Spring Hollow", "Kyle", "TX", "78640", "Hays", "R-1", 17100, "VACANT_LOT", 89000, "READY_FOR_OUTREACH", "NEW", 1, "+15125550220"],
  ["Frank Delacroix", "0451-8830", "3602 Larry Ln", "Austin", "TX", "78702", "Travis", "SF-3", 7300, "INFILL_LOT", 174000, "CONTACT_ATTEMPTED", "CALLBACK", 2, "+15125550237"],
  ["Ivy Nakamura", "0551-2244", "12 Windmill Way", "Dripping Springs", "TX", "78620", "Hays", "R-R", 87120, "BUILDABLE_LOT", 289000, "NEW_LEAD", "NEW", 3, "+15125550245"],
  ["Owen Whitfield", "0551-3355", "990 Ranch Road 12", "Wimberley", "TX", "78676", "Hays", "R-R", 130680, "VACANT_LOT", 199000, "ON_HOLD", "CALLBACK", 3, "+15125550252"],
  ["Sonia Baptist", "0570-7788", "2208 E 12th St", "Austin", "TX", "78702", "Travis", "SF-3", 5980, "TEARDOWN", 236000, "INTERESTED", "INTERESTED", 2, "+15125550261"],
  ["Merle Ostrowski", "0570-8899", "1704 Greenwood Ave", "Austin", "TX", "78702", "Travis", "SF-3", 6250, "INFILL_LOT", 158000, "NEW_LEAD", "NEW", 2, "+15125550270"],
  ["Lena Chatsworth", "0591-1122", "4501 Avenue G", "Austin", "TX", "78751", "Travis", "SF-3", 7040, "VACANT_LOT", 205000, "CONTACTED", "CONTACTED", 2, "+15125550288"],
];

/** [builder firm, stage, source, notes, dial number] */
type BuilderRow = [string, string, string, string, string];

const BUILDERS: BuilderRow[] = [
  ["Ridgeline Homes", "ACTIVE_BUYER", "REFERRAL", "Buys 2-10 infill lots a quarter in 78702/78723. Cash, 14-day close.", "+15125550301"],
  ["Cedar & Stone Builders", "QUALIFIED", "WEBSITE", "Wants teardowns under 8,000 sq ft in Travis County, at least two a month.", "+15125550302"],
  ["Bluebonnet Custom Homes", "CONTACTED", "DIRECT_OUTREACH", "Prefers Hays County; asked for a buybox on buildable acreage.", "+15125550303"],
  ["Hill Country Holdings", "INSERTED", "IMPORT", "Imported from the county builder list; not contacted yet.", "+15125550304"],
  ["Vista Verde Development", "NOT_INTERESTED", "EVENT", "Met at the Austin land expo. Full pipeline through Q3.", "+15125550305"],
  ["Sandstone Capital", "ACTIVE_BUYER", "REFERRAL", "Does lot splits; interested in anything over 20,000 sq ft.", "+15125550306"],
];

const FEATURED_TRANSCRIPT = [
  "Alex: Hi, is this Maria? It's Alex with Cedar Ridge Land. I'm calling about the lot on Cedar Street.",
  "Maria: Yes, that's mine. My husband and I bought it years ago.",
  "Alex: The county still lists it as vacant. Are you holding it for a build, or would you consider selling?",
  "Maria: We were going to build, but that was before the kids moved away. We'd listen to an offer.",
  "Alex: Comps on that block are running about 145 to 160 for a lot that size. If I brought you something in that range with a cash close, would that be worth a look?",
  "Maria: It would. But I'd want to see the numbers in writing before I agree to anything.",
  "Alex: Of course. I'll put a written offer together and send it over today. Can I follow up Thursday at ten?",
  "Maria: Thursday at ten works. Talk then.",
].join("\n");

export interface DemoRecords {
  members: typeof DEMO_MEMBERS;
  agencyCampaigns: any[];
  agencyScripts: any[];
  agencyPhones: any[];
  sellers: any[];
  buyers: any[];
  agencyCalls: any[];
  agencyCallCampaigns: any[];
}

/** The whole demo workspace, with times relative to `now`. Pure. */
export function buildDemoRecords(now: Date = new Date()): DemoRecords {
  const t = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const [alex, sam, jordan] = DEMO_MEMBERS;
  const team: Member[] = [...DEMO_MEMBERS];

  const agencyCampaigns = CAMPAIGNS.map((c) => ({
    id: demoId(2, c.n),
    name: c.name,
    status: c.status,
    campaignType: c.campaignType,
    utmSource: c.utmSource,
    industryId: c.industryId,
    urlKey: c.urlKey,
    note: JSON.stringify({ dailyGoal: 60, callWindow: "09:00-17:00" }),
    createdAt: t(30 * DAY),
    updatedAt: t(2 * DAY),
  }));

  const agencyScripts = [
    {
      id: demoId(3, 1),
      name: "Absentee owner opener",
      campaignIdId: demoId(2, 1),
      scriptData: JSON.stringify({
        category: "cold_call",
        content: [
          "Hi, is this {{owner_name}}? It's {{agent}} with Cedar Ridge Land.",
          "I'm calling about the vacant lot on {{street}} - are you still holding it, or would you consider an offer?",
          "Comps on that block are running {{comp_low}} to {{comp_high}}. I buy for cash and close in two weeks.",
          "Would a written offer be worth ten minutes of your time?",
        ].join("\n\n"),
        objection_responses: {
          "We're going to build on it": { category: "timeline", response: "Most owners I call were, until the build slipped. If that day is more than a year out, cash now may beat holding." },
          "It's not for sale": { category: "price", response: "Fair enough. If you tell me your number I'll keep it on file and call only if I can meet it." },
          "How did you get my number": { category: "source", response: "It's on the county record for the parcel. I can take you off my list right now if you'd prefer." },
        },
      }),
      createdAt: t(20 * DAY),
      updatedAt: t(3 * DAY),
    },
    {
      id: demoId(3, 2),
      name: "Builder buybox follow-up",
      campaignIdId: demoId(2, 3),
      scriptData: JSON.stringify({
        category: "follow_up",
        content: [
          "Hi {{first_name}}, it's {{agent}} again about the infill lots in 78702.",
          "Two parcels fit the buybox you sent: both teardowns, both under eight thousand square feet.",
          "Would Tuesday or Wednesday suit for a ten-minute walk of the numbers?",
        ].join("\n\n"),
        objection_responses: {
          "Send it by email": { category: "follow_up", response: "Will do - I'll send both sheets now while we're on the phone." },
          "We're full this quarter": { category: "timing", response: "Understood. I'll hold them and check back the first week of next quarter." },
        },
      }),
      createdAt: t(12 * DAY),
      updatedAt: t(1 * DAY),
    },
  ];

  const agencyPhones = [
    { id: demoId(4, 1), name: "Austin main line", phoneNumber: "+15125550100", countryCode: "US", numberType: "LONG_CODE", state: "ACTIVE", callState: "IDLE", messagingProfileId: "demo-profile", tenDlcCampaignId: "demo-10dlc", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(2 * HOUR) },
    { id: demoId(4, 2), name: "Hays County line", phoneNumber: "+13035550100", countryCode: "US", numberType: "LONG_CODE", state: "ACTIVE", callState: "ACTIVE", claimedByMemberId: sam.id, claimedByEmail: sam.email, claimedAt: t(3 * MINUTE), lastHeartbeatAt: t(2_000), messagingProfileId: "demo-profile", tenDlcCampaignId: "demo-10dlc", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(3 * MINUTE) },
    { id: demoId(4, 3), name: "Builder line", phoneNumber: "+15035550100", countryCode: "US", numberType: "LONG_CODE", state: "PAUSED", callState: "IDLE", messagingProfileId: "demo-profile", tenDlcCampaignId: "demo-10dlc", lastSyncedAt: t(1 * DAY), createdAt: t(40 * DAY), updatedAt: t(1 * DAY) },
    { id: demoId(4, 4), name: "Toll-free", phoneNumber: "+18885550100", countryCode: "US", numberType: "TOLL_FREE", state: "ACTIVE", callState: "IDLE", messagingProfileId: "demo-profile", tenDlcCampaignId: "demo-10dlc", lastSyncedAt: t(2 * HOUR), createdAt: t(40 * DAY), updatedAt: t(2 * HOUR) },
  ];

  const sellers = SELLERS.map(([owner, parcel, street, city, state, zip, county, zoning, sqft, type, asking, sellerStage, status, campaign, phone], i) => {
    const member = team[i % team.length];
    return {
      id: demoId(5, i + 1),
      name: `${street} - ${city}`,
      ownerName: owner,
      parcelNumber: parcel,
      propertyAddress: street,
      city,
      state,
      zipCode: zip,
      county,
      zoning,
      lotSizeSqFt: sqft,
      propertyType: type,
      askingPrice: asking,
      estimatedValue: Math.round(asking * (0.9 + ((i * 7) % 25) / 100)),
      opportunityStatus: sellerStage === "INTERESTED" ? "QUALIFIED" : "RESEARCHING",
      sellerStage,
      leadSource: i % 4 === 0 ? "COUNTY_RECORDS" : i % 4 === 1 ? "DIRECT_MAIL" : i % 4 === 2 ? "DRIVING_FOR_DOLLARS" : "REFERRAL",
      coldCallStatus: status,
      phone,
      email: `owner${i + 1}@example.com`,
      notes: i === 0
        ? [
            note(new Date(now.getTime() - 26 * HOUR), alex, "Owner is Maria. Husband passed; open to a cash offer but wants the numbers in writing."),
            note(new Date(now.getTime() - 40 * MINUTE), alex, "Interested at 145-160. Written offer going out today, follow-up Thursday 10:00."),
          ].join("\n\n")
        : null,
      createdByMemberId: member.id,
      campaignIdId: demoId(2, campaign),
      createdAt: t((20 - (i % 15)) * DAY),
      updatedAt: t((i % 5) * HOUR + 30 * MINUTE),
    };
  });

  const buyers = BUILDERS.map(([firm, stage, source, notes, phone], i) => ({
    id: demoId(6, i + 1),
    name: firm,
    stage,
    source,
    coldCallStatus: stage === "ACTIVE_BUYER" ? "CONVERTED" : stage === "QUALIFIED" ? "INTERESTED" : stage === "NOT_INTERESTED" ? "NOT_INTERESTED" : stage === "CONTACTED" ? "CONTACTED" : "NEW",
    phone,
    notes,
    lastCallSummary: i < 2 ? "Confirmed the buybox and the monthly target." : null,
    lastCallAt: i < 2 ? t((3 + i * 2) * DAY) : null,
    createdAt: t((18 - i) * DAY),
    updatedAt: t((i % 4) * HOUR + 15 * MINUTE),
  }));

  const featured = sellers[0];

  const agencyCalls: any[] = [
    {
      id: demoId(8, 1),
      name: `Outbound call to ${featured.ownerName}`,
      direction: "OUTBOUND",
      status: "COMPLETED",
      disposition: "INTERESTED",
      notes: "Maria will review a written offer. Follow-up Thursday 10:00.",
      fromNumber: "+15125550100",
      toNumber: featured.phone,
      startedAt: t(45 * MINUTE),
      endedAt: t(45 * MINUTE - 222_000),
      durationSeconds: 222,
      telnyxCallId: "v3:demo-call-control-id",
      telnyxRecordingId: "demo-recording",
      transcript: FEATURED_TRANSCRIPT,
      transcriptionStatus: "READY",
      summary: "Maria owns the Cedar Street lot; her build plans lapsed and she is open to a cash offer. Written offer to follow, call booked for Thursday 10:00.",
      aiSummary: "Maria owns the Cedar Street lot; her build plans lapsed and she is open to a cash offer. Written offer to follow, call booked for Thursday 10:00.",
      aiSentiment: "POSITIVE",
      aiScore: 88,
      aiKeyPoints: JSON.stringify([
        "Confirmed ownership and that the parcel is still vacant.",
        "Owner's build plans lapsed; she is open to a cash offer.",
        "Quoted comps of 145-160 and she asked for the numbers in writing.",
        "Next step: written offer today, follow-up Thursday at 10:00.",
      ]),
      aiScores: JSON.stringify({ conversion: 5, politeness: 5, questioning: 4, engagement: 5, sentiment: 4 }),
      aiConfidence: 0.92,
      aiModel: "gpt-4o-mini",
      aiAnalyzedAt: t(40 * MINUTE),
      debugLog: "invite sent\n100 Trying\n180 Ringing\n200 OK (call control id captured)\nrecording started\nBYE sent by agent",
      meetingUrl: "https://meet.example/cedar-street-walkthrough",
      meetingProvider: "GOOGLE_MEET",
      meetingStatus: "SCHEDULED",
      meetingAt: new Date(now.getTime() + 2 * DAY).toISOString(),
      agencyPhoneId: demoId(4, 1),
      landOpportunityId: featured.id,
      createdByMemberId: alex.id,
      createdBy: actor(alex),
      createdAt: t(45 * MINUTE),
      updatedAt: t(40 * MINUTE),
    },
    {
      id: demoId(8, 2),
      name: `Outbound call to ${featured.ownerName}`,
      direction: "OUTBOUND",
      status: "NO_ANSWER",
      disposition: "VOICEMAIL",
      fromNumber: "+15125550100",
      toNumber: featured.phone,
      startedAt: t(26 * HOUR),
      endedAt: t(26 * HOUR - 31_000),
      durationSeconds: 31,
      transcriptionStatus: "NONE",
      agencyPhoneId: demoId(4, 1),
      landOpportunityId: featured.id,
      createdByMemberId: alex.id,
      createdBy: actor(alex),
      createdAt: t(26 * HOUR),
      updatedAt: t(26 * HOUR),
    },
  ];

  const DISPOSITIONS = ["INTERESTED", "NO_ANSWER", "VOICEMAIL", "CALLBACK", "NOT_INTERESTED", "NO_ANSWER", "GOOD_NUMBER", "APPOINTMENT_SET", "VOICEMAIL", "BAD_NUMBER", "NO_ANSWER", "CALLBACK"];
  const SUMMARIES: Record<string, string> = {
    INTERESTED: "Owner is open to an offer and asked for the numbers in writing.",
    CALLBACK: "Reached the household; asked for a call back later this week.",
    NOT_INTERESTED: "Owner is holding the lot for a family build.",
    APPOINTMENT_SET: "Booked a walk of the parcel and the comps for Tuesday.",
    GOOD_NUMBER: "Confirmed this is the owner's mobile; no decision yet.",
  };

  for (let i = 0; i < 46; i++) {
    const p = sellers[1 + (i * 7) % (sellers.length - 1)];
    const m = team[i % team.length];
    const disposition = DISPOSITIONS[i % DISPOSITIONS.length];
    const answered = !["NO_ANSWER", "VOICEMAIL", "BAD_NUMBER"].includes(disposition);
    const duration = answered ? 60 + ((i * 53) % 300) : disposition === "VOICEMAIL" ? 25 + (i % 20) : 0;
    const ago = 2 * HOUR + i * 7 * HOUR + (i % 3) * 13 * MINUTE;
    const phoneRow = p.county === "Hays" ? demoId(4, 2) : demoId(4, 1);
    const from = agencyPhones.find((x) => x.id === phoneRow)!.phoneNumber;
    // The AI score follows the outcome: a refusal never rates as a great call.
    const SCORE_BASE: Record<string, number> = { APPOINTMENT_SET: 78, INTERESTED: 70, GOOD_NUMBER: 55, CALLBACK: 45, NOT_INTERESTED: 18 };
    const score = answered ? (SCORE_BASE[disposition] ?? 50) + ((i * 37) % 18) : null;
    // Every fourth call is builder outreach, logged on a buyer instead of a seller.
    const buyer = i % 4 === 3 ? buyers[(i / 4) % buyers.length | 0] : null;
    agencyCalls.push({
      id: demoId(8, 3 + i),
      name: `Outbound call to ${buyer ? buyer.name : p.ownerName}`,
      direction: i % 11 === 5 ? "INBOUND" : "OUTBOUND",
      status: answered ? "COMPLETED" : disposition === "BAD_NUMBER" ? "FAILED" : "NO_ANSWER",
      disposition,
      fromNumber: from,
      toNumber: buyer ? buyer.phone : p.phone,
      startedAt: t(ago),
      endedAt: t(ago - duration * 1000),
      durationSeconds: duration,
      telnyxRecordingId: answered ? `demo-recording-${i}` : null,
      transcriptionStatus: answered ? "READY" : "NONE",
      summary: SUMMARIES[disposition] ?? null,
      aiSummary: SUMMARIES[disposition] ?? null,
      aiSentiment: answered ? (disposition === "NOT_INTERESTED" ? "NEGATIVE" : disposition === "CALLBACK" ? "NEUTRAL" : "POSITIVE") : null,
      aiScore: score,
      aiKeyPoints: answered ? JSON.stringify(["Reached the owner during business hours.", SUMMARIES[disposition] ?? "Conversation logged."]) : null,
      aiScores: answered ? JSON.stringify({ conversion: 2 + (i % 4), politeness: 4 + (i % 2), questioning: 2 + (i % 3), engagement: 3 + (i % 3), sentiment: 2 + (i % 4) }) : null,
      aiConfidence: answered ? 0.8 : null,
      aiModel: answered ? "gpt-4o-mini" : null,
      aiAnalyzedAt: answered ? t(ago - 5 * MINUTE) : null,
      agencyPhoneId: phoneRow,
      ...(buyer ? { buyerId: buyer.id } : { landOpportunityId: p.id }),
      createdByMemberId: m.id,
      createdBy: actor(m),
      createdAt: t(ago),
      updatedAt: t(ago - 5 * MINUTE),
    });
  }

  const agencyCallCampaigns = [
    { id: demoId(9, 1), name: "Travis County - morning block", status: "ACTIVE", contactIds: JSON.stringify(sellers.slice(0, 9).map((p) => p.id)), createdByMemberId: alex.id, ownerName: alex.name, createdAt: t(1 * DAY) },
    { id: demoId(9, 2), name: "Hays County sellers", status: "ACTIVE", contactIds: JSON.stringify(sellers.filter((p) => p.county === "Hays").map((p) => p.id)), createdByMemberId: sam.id, ownerName: sam.name, createdAt: t(3 * DAY) },
    { id: demoId(9, 3), name: "Builder buybox intros", status: "COMPLETED", contactIds: JSON.stringify(buyers.map((b) => b.id)), createdByMemberId: jordan.id, ownerName: jordan.name, createdAt: t(9 * DAY) },
  ];

  return { members: DEMO_MEMBERS, agencyCampaigns, agencyScripts, agencyPhones, sellers, buyers, agencyCalls, agencyCallCampaigns };
}

// GET /api/lp/corps
// Returns the supported LP-store corporations grouped for the UI dropdown.
// Single source of truth: the LP_CORPS map in `_corps.js`.
//
// Response:
//   { groups: [{ label, corps: [{ id, name, faction }] }] }

import { LP_CORPS } from "./_corps.js";

const GROUPS = [
  {
    label: "Main FW Militias",
    corpIds: [1000110, 1000179, 1000180, 1000182],
  },
  {
    label: "Pirate FW",
    corpIds: [1000436, 1000437],
  },
];

export function onRequestGet() {
  const groups = GROUPS.map(({ label, corpIds }) => ({
    label,
    corps: corpIds
      .filter((id) => LP_CORPS[id])
      .map((id) => ({
        id,
        name: LP_CORPS[id].name,
        faction: LP_CORPS[id].faction,
      })),
  }));

  return new Response(JSON.stringify({ groups }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

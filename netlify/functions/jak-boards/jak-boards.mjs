// Every 10 minutes: rebuild the Legend of Jak leaderboards and send any new accounts to the newsletter list.
import { getStore } from "@netlify/blobs";
import { rebuildBoards, syncNewsletter } from "../jak-api/core.mjs";

export default async function () {
  const store = getStore({ name: "jak-accounts", consistency: "strong" });
  try { await rebuildBoards(store); } catch (e) { console.error("jak-boards rebuild", e && e.message); }
  try { await syncNewsletter(store, process.env); } catch (e) { console.error("jak-boards newsletter", e && e.message); }
}

export const config = { schedule: "*/10 * * * *" };

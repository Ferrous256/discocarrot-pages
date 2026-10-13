import { getStore } from "@netlify/blobs";
import { makeHandler } from "./core.mjs";

export default makeHandler(() => getStore({ name: "jak-accounts", consistency: "strong" }));

export const config = { path: "/api/jak/*" };

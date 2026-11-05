import { getStore } from "@netlify/blobs";
import { makeHandler } from "./core.mjs";

export default makeHandler(() => getStore({ name: "jak-accounts", consistency: "strong" }), () => process.env);

export const config = { path: "/api/jak/*" };

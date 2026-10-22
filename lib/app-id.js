import { randomBytes } from "node:crypto";

export function generateAppId() {
  return `APP-${randomBytes(6).toString("hex").toUpperCase()}`;
}

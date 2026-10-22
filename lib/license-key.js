import { randomInt } from "node:crypto";
import { DEFAULT_KEY_FORMAT, fillKeyPattern } from "./key-format";

export function generateLicenseKey(format = DEFAULT_KEY_FORMAT) {
  return fillKeyPattern(format, (length) => randomInt(length));
}

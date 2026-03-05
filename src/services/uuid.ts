import { ulid } from "ulid";

export function generateItemId(): string {
  return `asset-id://${ulid()}`;
}
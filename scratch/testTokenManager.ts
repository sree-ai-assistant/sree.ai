
import { TokenManager } from "./backend/src/utils/tokenManager";

const messages = [
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'Hello' }
];

try {
  const pruned = TokenManager.pruneMessages(messages, 1000);
  console.log("Pruned success", pruned.length);
} catch (e) {
  console.error("Pruned error", e);
}

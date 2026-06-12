// Normalize + sanitize a chat message. Shared by client (pre-send) and server
// (defense-in-depth). Messages are rendered as plain text (React escapes), so
// this focuses on stripping control characters and collapsing empty newlines.

// Remove control chars U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+007F
// (keeps tab U+0009 and newline U+000A). Built from a string to avoid embedding
// raw control characters in source.
const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g"
);

export function sanitizeChatBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n") // normalize line endings
    .replace(CONTROL_CHARS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "")) // trailing whitespace per line
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
    .trim();
}

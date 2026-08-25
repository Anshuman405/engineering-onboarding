const assert = require("node:assert/strict");
const test = require("node:test");
const {
  downloadDiscordAttachment,
  eosCommand,
  githubRelationFromUrl,
  handleDocs,
  handleDocument,
  parseDocumentTags,
} = require("../src/eos/commands");

function interaction(values = {}, attachment = null) {
  const replies = [];
  return {
    user: { id: "400000000000000001" },
    options: {
      getString: (name, required) => values[name] ?? (required ? (() => { throw new Error(`missing ${name}`); })() : null),
      getAttachment: () => attachment,
    },
    editReply: async (value) => { replies.push(value); return value; },
    replies,
  };
}

test("registers create/upload/link documentation and search workflows", () => {
  const command = eosCommand.toJSON();
  const document = command.options.find((option) => option.name === "document");
  const docs = command.options.find((option) => option.name === "docs");
  assert.ok(document);
  assert.ok(docs);
  assert.deepEqual(document.options.find((option) => option.name === "action").choices.map((choice) => choice.value), ["create", "upload", "link"]);
  assert.ok(document.options.find((option) => option.name === "file"));
});

test("normalizes tags and typed GitHub relationships", () => {
  assert.deepEqual(parseDocumentTags("Setup, setup, Venu"), ["setup", "venu"]);
  assert.equal(githubRelationFromUrl("https://github.com/RoboBearLLC/VenuAI/issues/42")[0].type, "ISSUE");
  assert.equal(githubRelationFromUrl("https://github.com/RoboBearLLC/VenuAI/pull/19")[0].type, "PULL_REQUEST");
  assert.throws(() => githubRelationFromUrl("https://example.com/x"), /github.com/);
});

test("/eos document creates and links through authenticated EOS APIs", async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) });
    return { data: { id: "doc-1", title: "Registration", category: "Architecture", sourceType: path.endsWith("link") ? "DRIVE" : "EOS_NATIVE", externalUrl: "https://docs.google.com/document/d/doc-1/edit", extractedContent: "indexed" } };
  };
  const create = interaction({ action: "create", title: "Registration", category: "Architecture", content: "State tracking", tags: "Registration, State", github: "https://github.com/RoboBearLLC/VenuAI/issues/42" });
  await handleDocument(create, request);
  assert.equal(calls[0].path, "/api/documents");
  assert.equal(calls[0].body.creatorDiscordUserId, create.user.id);
  assert.equal(calls[0].body.githubRelations[0].type, "ISSUE");
  assert.equal(create.replies[0].embeds[0].toJSON().title, "Documentation saved");

  const link = interaction({ action: "link", title: "Runbook", category: "Setup", url: "https://docs.google.com/document/d/runbook/edit" });
  await handleDocument(link, request);
  assert.equal(calls[1].path, "/api/documents/link");
});

test("/eos document uploads only bounded Discord-hosted attachments as multipart", async () => {
  const attachment = { url: "https://cdn.discordapp.com/attachments/1/2/guide.md", size: 12, name: "guide.md", contentType: "text/markdown" };
  const target = interaction({ action: "upload", title: "Guide", category: "Setup" }, attachment);
  let requestBody;
  await handleDocument(target, async (path, options) => {
    assert.equal(path, "/api/documents/upload");
    assert.ok(options.body instanceof FormData);
    requestBody = options.body;
    return { data: { id: "doc-upload", title: "Guide", category: "Setup", sourceType: "UPLOAD", externalUrl: "https://drive.google.com/file/d/doc-upload/view", extractedContent: "hello" } };
  }, async () => new Response(Buffer.from("hello world!"), { status: 200 }));
  assert.equal(requestBody.get("creatorDiscordUserId"), target.user.id);
  assert.equal(requestBody.get("file").name, "guide.md");
});

test("attachment download rejects arbitrary hosts, oversize files, and failures", async () => {
  await assert.rejects(() => downloadDiscordAttachment({ url: "https://example.com/a.txt", size: 1 }, fetch), /hosted by Discord/);
  await assert.rejects(() => downloadDiscordAttachment({ url: "https://cdn.discordapp.com/a.txt", size: 20_000_000 }, fetch), /no larger/);
  await assert.rejects(() => downloadDiscordAttachment({ url: "https://cdn.discordapp.com/a.txt", size: 1 }, async () => new Response("no", { status: 503 })), /503/);
});

test("attachment download refuses redirects and documentation replies suppress mentions", async () => {
  let options;
  const target = interaction({ action: "create", title: "@everyone runbook", category: "Other", content: "safe" });
  await handleDocument(target, async () => ({ data: { id: "doc-safe", title: "@everyone runbook", category: "Other", sourceType: "EOS_NATIVE", extractedContent: "safe" } }));
  assert.deepEqual(target.replies[0].allowedMentions, { parse: [] });
  await downloadDiscordAttachment(
    { url: "https://cdn.discordapp.com/a.txt", size: 1 },
    async (_url, requestOptions) => { options = requestOptions; return new Response("ok", { status: 200 }); }
  );
  assert.equal(options.redirect, "error");
});

test("/eos document validates action-specific fields before API calls", async () => {
  let calls = 0;
  const request = async () => { calls += 1; };
  const create = interaction({ action: "create", title: "Missing", category: "Other" });
  await handleDocument(create, request);
  const link = interaction({ action: "link", title: "Missing", category: "Other" });
  await handleDocument(link, request);
  const upload = interaction({ action: "upload", title: "Missing", category: "Other" });
  await handleDocument(upload, request);
  assert.equal(calls, 0);
  assert.match(create.replies[0].content, /content/);
  assert.match(link.replies[0].content, /url/);
  assert.match(upload.replies[0].content, /Attach/);
});

test("/eos docs searches EOS and returns source links without database access", async () => {
  const target = interaction({ query: "registration status", category: "Architecture" });
  const calls = [];
  await handleDocs(target, async (path) => {
    calls.push(path);
    if (path === "/api/documents/sync") return { data: { created: 1 } };
    assert.match(path, /^\/api\/documents\/search\?/);
    assert.match(path, /category=Architecture/);
    return { data: [{ title: "Registration status", category: "Architecture", description: "State transitions", externalUrl: "https://docs.google.com/document/d/1/edit" }] };
  });
  const embed = target.replies[0].embeds[0].toJSON();
  assert.equal(embed.title, "EOS documentation search");
  assert.match(embed.description, /docs.google.com/);
  assert.equal(calls[0], "/api/documents/sync");
  assert.match(calls[1], /^\/api\/documents\/search\?/);
});

test("/eos docs still searches durable knowledge when Drive is temporarily unavailable", async () => {
  const target = interaction({ query: "cached runbook" });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    await handleDocs(target, async (path) => {
      if (path === "/api/documents/sync") throw new Error("Drive unavailable");
      return { data: [{ title: "Cached runbook", category: "Setup", externalUrl: "https://docs.google.com/document/d/cached/edit" }] };
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.match(target.replies[0].embeds[0].toJSON().description, /Cached runbook/);
});

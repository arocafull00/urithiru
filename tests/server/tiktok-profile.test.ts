import test from "node:test";
import assert from "node:assert/strict";
import { listTikTokProfile } from "../../src/lib/tiktok";
import { tiktokProfileHandle } from "../../src/lib/tiktok-profile";
import { HttpError } from "../../src/lib/http";

test("TikTok: detecta enlaces de perfil y no de vídeo", () => {
  assert.equal(tiktokProfileHandle("https://www.tiktok.com/@estefaniamarketing"), "estefaniamarketing");
  assert.equal(tiktokProfileHandle(" https://tiktok.com/@user.name_1/?lang=es "), "user.name_1");
  for (const url of [
    "https://www.tiktok.com/@user/video/7400000000000000000",
    "https://vm.tiktok.com/ZMabc/",
    "http://www.tiktok.com/@user",
    "https://tiktok.com.evil.test/@user",
    "@user",
  ])
    assert.equal(tiktokProfileHandle(url), null);
});

function profilePage(user: object) {
  const data = { __DEFAULT_SCOPE__: { "webapp.user-detail": { userInfo: { user } } } };
  return `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script>`;
}

const item = (id: number, extra = {}) => ({ id: String(id), createTime: id, desc: `v${id}`, ...extra });

test("TikTok: pagina el perfil, quita duplicados y fotos y respeta el límite", async () => {
  const pages = [
    { itemList: [item(900), item(800), item(700, { imagePost: {} })], hasMorePrevious: true },
    { itemList: [item(700, { imagePost: {} }), item(600), item(500)], hasMorePrevious: true },
    { itemList: [item(400), item(300)], hasMorePrevious: false },
  ];
  const cursors: string[] = [];
  const fetcher = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/@creadora")
      return new Response(profilePage({ uniqueId: "creadora", nickname: "Creadora", secUid: "SEC" }));
    assert.equal(url.searchParams.get("secUid"), "SEC");
    cursors.push(url.searchParams.get("cursor")!);
    return Response.json(pages[cursors.length - 1]);
  }) as typeof fetch;

  const result = await listTikTokProfile("creadora", 4, fetcher);
  assert.equal(result.authorName, "Creadora");
  assert.deepEqual(result.videos.map((v) => v.id), ["900", "800", "600", "500"]);
  assert.equal(result.videos[0].url, "https://www.tiktok.com/@creadora/video/900");
  assert.deepEqual(cursors.slice(1), ["700000"]);

  cursors.length = 0;
  const all = await listTikTokProfile("creadora", 50, fetcher);
  assert.equal(all.videos.length, 6);
  assert.equal(cursors.length, 3);
});

test("TikTok: perfiles privados, inexistentes o bloqueados dan error claro", async () => {
  const page = (user: object, list?: Response) =>
    (async (input: string | URL) =>
      new URL(String(input)).pathname.startsWith("/@")
        ? new Response(profilePage(user))
        : list ?? new Response("")) as typeof fetch;
  await assert.rejects(listTikTokProfile("x", 5, page({ secUid: "S", privateAccount: true })), (e) => e instanceof HttpError && e.status === 403);
  await assert.rejects(listTikTokProfile("x", 5, page({})), (e) => e instanceof HttpError && e.status === 404);
  await assert.rejects(listTikTokProfile("x", 5, page({ secUid: "S" })), (e) => e instanceof HttpError && e.status === 502);
});

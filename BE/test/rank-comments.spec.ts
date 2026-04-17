import { rankComments } from "../src/comments/rank-comments";

describe("rankComments", () => {
  it("orders by likes desc, replies desc, createdAt desc", () => {
    const sorted = rankComments([
      { id: "old", likes: [1, 2], replies: [1], createdAt: new Date("2026-01-01") },
      { id: "new", likes: [1, 2], replies: [1], createdAt: new Date("2026-02-01") },
      { id: "reply-win", likes: [1, 2], replies: [1, 2], createdAt: new Date("2026-01-15") },
      { id: "like-win", likes: [1, 2, 3], replies: [], createdAt: new Date("2026-01-10") }
    ]);

    expect(sorted.map((x) => x.id)).toEqual(["like-win", "reply-win", "new", "old"]);
  });
});

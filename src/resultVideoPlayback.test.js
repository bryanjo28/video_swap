import test from "node:test";
import assert from "node:assert/strict";

import {
  startResultVideo,
  restartResultVideo,
} from "./resultVideoPlayback.js";

test("result video starts at 2 seconds when metadata is loaded", () => {
  const video = { currentTime: 0 };

  startResultVideo(video);

  assert.equal(video.currentTime, 2);
});

test("result video restarts at 2 seconds after it ends", async () => {
  let playCalls = 0;
  const video = {
    currentTime: 10,
    play: async () => {
      playCalls += 1;
    },
  };

  await restartResultVideo(video);

  assert.equal(video.currentTime, 2);
  assert.equal(playCalls, 1);
});

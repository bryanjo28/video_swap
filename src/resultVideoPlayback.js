export const RESULT_VIDEO_START_SECONDS = 2;

export const startResultVideo = (video) => {
  video.currentTime = RESULT_VIDEO_START_SECONDS;
};

export const restartResultVideo = async (video) => {
  startResultVideo(video);
  await video.play();
};

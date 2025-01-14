import kaboom from "kaboom";
import { loadSongsList, cancelStage } from "../www/assets/modules/mania.js";

const INNER_WIDTH = window.innerWidth;
const INNER_HEIGHT = window.innerHeight;

const getMainCanvas = document.getElementById("mainCanvas");
kaboom({
  background: [36, 36, 36],
  canvas: getMainCanvas,
});

loadSongsList();

// Exists out of stage
onKeyPress("escape", async () => {
  const isActive = await cancelStage();
  if (isActive) {
    loadSongsList();
  }
});

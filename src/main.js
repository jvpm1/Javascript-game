import kaboom from "kaboom";
import {
  getSongsData,
  renderSongsList,
  cancelStage,
} from "../www/assets/modules/mania.js";

const listContainer = document.getElementById("listContainer");

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

kaboom({
  background: [36, 36, 36],
  width: windowWidth,
  height: windowHeight,
  stretch: true,
  letterbox: true,
});

renderSongsList();

onKeyPress("escape", async () => {
  const isActive = await cancelStage();
  if (isActive) {
    renderSongsList();
  }
});

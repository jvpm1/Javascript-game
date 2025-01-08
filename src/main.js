import kaboom from "kaboom";
import { getSongsData, renderSongsList } from "../www/assets/modules/mania.js";

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

import kaboom from "kaboom";
import { getSongsData } from "../www/assets/modules/song.js";

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

kaboom({
  background: [36, 36, 36],
  width: windowWidth,
  height: windowHeight,
  stretch: true,
  letterbox: true,
});

async function renderSongsList() {
  const songsData = await getSongsData();
  console.log(songsData);
}

renderSongsList();

import kaboom from "kaboom";
import {
  loadSongsList,
  cancelStage,
  loadSettingsWindow,
  loadSettingsToStorage,
} from "./assets/modules/mania.js";

// const INNER_WIDTH = window.innerWidth;
// const INNER_HEIGHT = window.innerHeight;
//
const getMainCanvas = document.getElementById("mainCanvas");
const settingsBtn = document.getElementById("settingsBtn");

kaboom({
  background: [32, 32, 32],
  canvas: getMainCanvas,
});

loadSettingsToStorage();
loadSongsList();

// Exists out of stage
onKeyPress("escape", async () => {
  const isActive = await cancelStage();
  if (isActive) {
    loadSongsList();
  }
});

settingsBtn.addEventListener("click", loadSettingsWindow);

// Imports
import kaboom from "kaboom";
const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

kaboom({
  background: [36, 36, 36],
  width: windowWidth,
  height: windowHeight,
  stretch: true,
  letterbox: true,
});

// Game States
let SCORE = 0;
let COMBO = 0;
let NOTES_QUEUE = [];
let GAME_START_TIME = 0;
let IS_PLAYING = false;

// Values
let hitWindow = 120;
let hitWindowRounding = 3;
let hitLine = height() - 100;
let NOTE_SPEED = 300; // Pixels per second

// Score table
const scoreTable = {
  [0]: {
    procent: 1.0,
    text: "Awesome",
  },
  [1]: {
    procent: 0.9,
    text: "Perfect",
  },
  [2]: {
    procent: 0.6,
    text: "Good",
  },
  [3]: {
    procent: 0,
    text: "Bad",
  },
};

const SCORE_LENGTH = Object.keys(scoreTable).length;

// UI Elements
const scoreLabel = add([
  text("Score: 0p"),
  pos(width() / 2, windowHeight * 0.1),
  anchor("center"),
  fixed(),
  { value: 0 },
]);

const comboLabel = add([
  text("Combo: 0x"),
  pos(width() / 2, windowHeight * 0.1 + 35),
  anchor("center"),
  fixed(),
  { value: 0 },
]);

add([rect(width(), 4), pos(0, hitLine), color(200, 200, 200)]);

// MIDI handling
function handleMIDIFile(midiData) {
  const tracks = midiData.track;
  const ticksPerBeat = midiData.timeDivision;
  let tempo = 500000; // Default tempo (120 BPM)
  NOTES_QUEUE = [];

  // Process all tracks
  tracks.forEach((track) => {
    let currentTime = 0;

    track.event.forEach((event) => {
      currentTime += event.deltaTime;

      // Handle tempo changes
      if (event.type === 0xff && event.metaType === 0x51) {
        tempo = event.data;
      }

      // Handle note on events
      if (event.type === 0x09) {
        const timeInSeconds = (currentTime * tempo) / (ticksPerBeat * 1000000);
        NOTES_QUEUE.push({
          time: timeInSeconds,
          note: event.data[0],
          velocity: event.data[1],
        });
      }
    });
  });

  // Sort notes by time
  NOTES_QUEUE.sort((a, b) => a.time - b.time);

  // Start the game
  startGame();
}

// Game Functions
function spawnNote(xOffset = 0) {
  add([
    circle(20),
    pos(width() / 2, xOffset),
    color(255, 100, 100),
    "note",
    {
      speed: NOTE_SPEED,
    },
  ]);
}

function startGame() {
  GAME_START_TIME = time();
  IS_PLAYING = true;
  SCORE = 0;
  COMBO = 0;
  scoreLabel.text = "Score: 0p";
  comboLabel.text = "Combo: 0x";
}

function notfi(_text, _color) {
  add([
    text(_text),
    pos(width() / 2, height() / 2),
    _color || color(255, 255, 255),
    anchor("center"),
    lifespan(0.5),
    move(UP, 100),
  ]);
}

function checkWhichScoreTable(hitProcent) {
  let num = 0;
  while (num < SCORE_LENGTH) {
    const data = scoreTable[num];
    if (data.procent < hitProcent) {
      return data;
    }
    num++;
  }
  return null;
}

// Game Loop
onUpdate(() => {
  if (!IS_PLAYING) return;

  const currentTime = time() - GAME_START_TIME;

  // Spawn notes based on MIDI timing
  while (
    NOTES_QUEUE.length > 0 &&
    NOTES_QUEUE[0].time <= currentTime + hitLine / NOTE_SPEED
  ) {
    const note = NOTES_QUEUE.shift();
    const xOffset = (note.note - 60) * 10; // Spread notes horizontally based on pitch
    spawnNote(xOffset);
  }
});

onUpdate("note", (note) => {
  note.move(0, note.speed);

  if (note.pos.y > height()) {
    destroy(note);
    COMBO = 0;
    comboLabel.text = `Combo: ${COMBO}x`;
  }
});

// Input handling
onKeyPress("space", () => {
  const notes = get("note");
  const closest = notes.sort((a, b) => {
    return Math.abs(a.pos.y - hitLine) - Math.abs(b.pos.y - hitLine);
  })[0];

  if (closest) {
    const distance = Math.abs(closest.pos.y - hitLine);

    if (distance < hitWindow) {
      COMBO++;
      const accuracy = 1 - distance / hitWindow;
      const data = checkWhichScoreTable(accuracy);
      const points = Math.floor(data.procent * (COMBO + 1)) * 100;

      SCORE += points;
      scoreLabel.text = `Score: ${SCORE}p`;
      comboLabel.text = `Combo: ${COMBO}x`;
      notfi(data.text);
      destroy(closest);
      return;
    }

    COMBO = 0;
    notfi("Miss", color(255, 100, 100));
  }
});

// File input handling
const fileInput = document.getElementById("fileInput");
fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const midiData = MidiParser.parse(new Uint8Array(e.target.result));
    handleMIDIFile(midiData);
  };

  reader.readAsArrayBuffer(file);
});

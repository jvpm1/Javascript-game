// Imports
import kaboom from "kaboom";

// Windows value
const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

// Kaboom init
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

// Values
let hitWindow = 100;
let hitWindowRounding = 3;
let hitLine = height() - 100;

// Objects
const scoreTable = [
  {
    procent: 0.6,
    multipier: 0.1,
    text: "Bad",
  },
  {
    procent: 0.4,
    multipier: 0.5,

    text: "Good",
  },
  {
    procent: 0.2,
    multipier: 0.8,

    text: "Perfect",
  },
  {
    procent: 0.0,
    multipier: 1,
    text: "Awesome",
  },
];

// Cache
const SCORE_LENGHT = scoreTable.length;

// Elements
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

const hitLineRect = add([
  rect(width(), 4),
  pos(0, hitLine),
  color(200, 200, 200),
]);

// Game Functions
const spawnNote = (xOffset) => {
  add([
    circle(20),
    pos(width() / 2 + 20, xOffset || 0),
    color(255, 100, 100),
    "note",
    {
      speed: 300,
    },
  ]);

  wait(rand(1, 2), spawnNote);
};

const notfi = (_text, _color) =>
  add([
    text(_text),
    pos(width() / 2, height() / 2),
    _color || color(255, 255, 255),
    lifespan(0.5),
    move(UP, 100),
  ]);

// Functions
function roundToDecimals(number, decimals) {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(number * multiplier) / multiplier;
}

const checkWhichScoreTable = (hitProcent) => {
  let num = 0;

  while (num < SCORE_LENGHT) {
    const data = scoreTable[num];

    if (data.procent > hitProcent) {
      return data;
    }

    num++;
  }

  return null;
};

// Events
onUpdate("note", (note) => {
  note.move(0, note.speed);

  if (note.pos.y > height()) {
    destroy(note);
    COMBO = 0;
    comboLabel.text = `Combo: ${COMBO}x`;
  }
});

onKeyPress("space", () => {
  const notes = get("note");
  const closest = notes.sort((a, b) => {
    return Math.abs(a.pos.y - hitLine) - Math.abs(b.pos.y - hitLine);
  })[0];

  if (closest) {
    const distance = Math.abs(closest.pos.y - hitLine);

    if (distance < hitWindow) {
      const accuracy = 1 - distance / hitWindow;
      const points = Math.floor(100 * accuracy) * (COMBO + 1);

      const data = checkWhichScoreTable(accuracy);

      console.log(data, accuracy);

      SCORE += points;
      COMBO++;

      // Update displays
      scoreLabel.text = `Score: ${SCORE}p`;
      comboLabel.text = `Combo: ${COMBO}x`;

      // Visual feedback
      notfi("e");

      destroy(closest);

      return;
    }

    COMBO = 0;
    notfi("Miss", color(255, 100, 100));
  }
});

// Main
spawnNote(Math.random());
console.log(checkWhichScoreTable(0.7));

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const API_BASE = "/api/v1";

const GAME_SLUG = "doi-dac-nhiem-nhi";

const GAME_DURATION = 60;

const MAX_ITEMS = 26;

const ITEM_SIZE = 64;

/*
 * Server giới hạn trung bình khoảng 8 action/giây.
 *
 * Client gửi tối đa khoảng 7 action/giây
 * để tránh chạm giới hạn khi mạng rất nhanh.
 */
const MIN_ACTION_GAP_MS = 140;

/*
 * Không cho hàng đợi quá dài.
 */
const MAX_PENDING_ACTIONS = 30;

/*
 * Timeout:
 * START    = 15s
 * ACTION   = 20s
 * SUBMIT   = 20s
 * GET      = 10s
 */
const START_TIMEOUT_MS = 15000;
const ACTION_TIMEOUT_MS = 20000;
const SUBMIT_TIMEOUT_MS = 20000;
const GET_TIMEOUT_MS = 10000;


/* =========================================================
   DOM
   ========================================================= */

const playArea =
  document.getElementById("playArea");

const scoreValue =
  document.getElementById("scoreValue");

const comboValue =
  document.getElementById("comboValue");

const livesValue =
  document.getElementById("livesValue");

const timerValue =
  document.getElementById("timerValue");

const flash =
  document.getElementById("flash");

const startOverlay =
  document.getElementById("startOverlay");

const endOverlay =
  document.getElementById("endOverlay");

const startButton =
  document.getElementById("startButton");

const restartButton =
  document.getElementById("restartButton");

const nicknameInput =
  document.getElementById("nicknameInput");

const loadingText =
  document.getElementById("loadingText");

const finalScore =
  document.getElementById("finalScore");

const resultMessage =
  document.getElementById("resultMessage");

const leaderboardRows =
  document.getElementById("leaderboardRows");


/* =========================================================
   GAME STATE
   ========================================================= */

const state = {

  playing: false,

  ending: false,

  nickname: "",

  sessionToken: null,

  sessionId: null,

  serverScore: 0,

  goodHits: 0,

  mistakes: 0,

  /*
   * Sequence cuối cùng đã được SERVER xác nhận.
   *
   * Không tăng khi click.
   */
  actionSequence: 0,

  /*
   * Hàng đợi action.
   *
   * Chỉ một request action được gửi
   * tại một thời điểm.
   */
  actionQueue: Promise.resolve(),

  /*
   * Số action đang chờ hoặc đang gửi.
   */
  pendingActions: 0,

  /*
   * Action đầu tiên lỗi thì dừng queue.
   */
  actionError: null,

  /*
   * Thời điểm action gần nhất được gửi.
   */
  lastActionSentAt: 0,

  combo: 0,

  lives: 3,

  timeLeft: GAME_DURATION,

  items: [],

  spawnInterval: 900,

  lastSpawn: 0,

  lastFrame: 0,

  animId: null,

  timerId: null,

  areaW: 0,

  areaH: 0,

  startedAt: null,

  serverDuration: 0,

  lastBurstAt: 0,

  difficultyStage: 0,

  /*
   * Chống submit nhiều lần.
   */
  submitStarted: false,

  /*
   * Cho phép restart chỉ khi lượt cũ
   * đã hoàn tất hoàn toàn.
   */
  canRestart: false,

  /*
   * Lý do kết thúc.
   */
  gameEndReason: null
};


/* =========================================================
   GAME ITEMS
   ========================================================= */

const GOOD_ITEMS = [

  {
    emoji: "🍎",
    name: "Quả táo",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "🍊",
    name: "Quả cam",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "🍇",
    name: "Chùm nho",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "🥕",
    name: "Cà rốt",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "🍌",
    name: "Quả chuối",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "📚",
    name: "Quyển sách",
    itemKey: "toy",
    answer: "safe"
  },

  {
    emoji: "⚽",
    name: "Quả bóng",
    itemKey: "toy",
    answer: "safe"
  },

  {
    emoji: "🎨",
    name: "Bút màu",
    itemKey: "toy",
    answer: "safe"
  },

  {
    emoji: "🥛",
    name: "Sữa",
    itemKey: "food",
    answer: "safe"
  },

  {
    emoji: "🎒",
    name: "Cặp sách",
    itemKey: "toy",
    answer: "safe"
  },

  {
    emoji: "🏀",
    name: "Bóng rổ",
    itemKey: "toy",
    answer: "safe"
  },

  {
    emoji: "💧",
    name: "Nước uống của mình",
    itemKey: "food",
    answer: "safe"
  }

];


const BAD_ITEMS = [

  {
    emoji: "🍬",
    name: "Kẹo không rõ nguồn gốc",
    itemKey: "unknown-package",
    answer: "unsafe"
  },

  {
    emoji: "🍭",
    name: "Kẹo người lạ đưa",
    itemKey: "unknown-package",
    answer: "unsafe"
  },

  {
    emoji: "🚬",
    name: "Thuốc lá",
    itemKey: "unknown-package",
    answer: "unsafe"
  },

  {
    emoji: "💊",
    name: "Thuốc không rõ nguồn gốc",
    itemKey: "medicine",
    answer: "unsafe"
  },

  {
    emoji: "🍫",
    name: "Đồ ăn người lạ đưa",
    itemKey: "unknown-package",
    answer: "unsafe"
  },

  {
    emoji: "🧪",
    name: "Chất không rõ nguồn gốc",
    itemKey: "unknown-bottle",
    answer: "unsafe"
  },

  {
    emoji: "🥤",
    name: "Nước uống không rõ nguồn gốc",
    itemKey: "unknown-bottle",
    answer: "unsafe"
  },

  {
    emoji: "💉",
    name: "Vật sắc nhọn / dụng cụ y tế bỏ lại",
    itemKey: "medicine",
    answer: "unsafe"
  },

  {
    emoji: "🚭",
    name: "Sản phẩm chứa nicotine",
    itemKey: "unknown-package",
    answer: "unsafe"
  },

  {
    emoji: "⚠️",
    name: "Vật không rõ nguồn gốc",
    itemKey: "unknown-package",
    answer: "unsafe"
  }

];


/* =========================================================
   API HELPER
   ========================================================= */

async function apiRequest(
  path,
  options = {}
) {

  const timeoutMs =
    options.timeoutMs ||
    15000;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {

    const fetchOptions = {
      ...options
    };

    /*
     * Không gửi timeoutMs xuống fetch.
     */
    delete fetchOptions.timeoutMs;

    fetchOptions.headers = {

      "Content-Type":
        "application/json",

      ...(options.headers || {})

    };

    fetchOptions.signal =
      controller.signal;

    const response =
      await fetch(
        API_BASE + path,
        fetchOptions
      );

    let data = null;

    try {

      data =
        await response.json();

    } catch {

      data = null;

    }

    if (!response.ok) {

      const error =
        data?.error ||
        `HTTP_${response.status}`;

      const err =
        new Error(error);

      err.status =
        response.status;

      err.data =
        data;

      throw err;
    }

    return data;

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      const err =
        new Error(
          "REQUEST_TIMEOUT"
        );

      err.original =
        error;

      throw err;
    }

    throw error;

  } finally {

    clearTimeout(timeout);

  }
}


/* =========================================================
   SLEEP
   ========================================================= */

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* =========================================================
   ACTION RATE CONTROL
   ========================================================= */

async function waitForActionSlot() {

  const now =
    performance.now();

  const elapsed =
    now -
    state.lastActionSentAt;

  const wait =
    Math.max(
      0,
      MIN_ACTION_GAP_MS -
        elapsed
    );

  if (wait > 0) {

    await sleep(wait);

  }

  state.lastActionSentAt =
    performance.now();

}


/* =========================================================
   NORMALIZE NICKNAME
   ========================================================= */

function normalizeNickname(value) {

  return String(value || "")

    .normalize("NFC")

    .replace(/\s+/g, " ")

    .trim();

}


/* =========================================================
   VALIDATE NICKNAME
   ========================================================= */

function validNickname(value) {

  if (
    value.length < 2 ||
    value.length > 20
  ) {

    return false;

  }

  /*
   * Cho phép:
   * - chữ tiếng Việt
   * - chữ cái Unicode
   * - số
   * - khoảng trắng
   * - _
   * - .
   * - -
   */

  return /^[\p{L}\p{N} _.-]+$/u.test(
    value
  );

}


/* =========================================================
   UI
   ========================================================= */

function updateHUD() {

  if (scoreValue) {

    scoreValue.textContent =
      String(
        state.serverScore
      );

  }

  if (comboValue) {

    comboValue.textContent =
      String(
        state.combo
      );

  }

  if (livesValue) {

    livesValue.textContent =
      "❤️".repeat(
        Math.max(
          0,
          state.lives
        )
      );

  }

  if (timerValue) {

    timerValue.textContent =
      String(
        Math.max(
          0,
          state.timeLeft
        )
      );

  }

}


/* =========================================================
   FLASH
   ========================================================= */

function showFlash(type) {

  if (!flash) {

    return;

  }

  flash.className = "";

  void flash.offsetWidth;

  flash.className =
    type === "good"
      ? "good"
      : "bad";

}


/* =========================================================
   FLOATING TEXT
   ========================================================= */

function floatingText(
  text,
  x,
  y,
  type
) {

  if (!playArea) {

    return;

  }

  const el =
    document.createElement(
      "div"
    );

  el.className =
    `floating-text ${type}`;

  el.textContent =
    text;

  el.style.left =
    `${x}px`;

  el.style.top =
    `${y}px`;

  playArea.appendChild(
    el
  );

  setTimeout(
    () => {

      el.remove();

    },
    900
  );

}


/* =========================================================
   RANDOM
   ========================================================= */

function random(
  min,
  max
) {

  return (
    Math.random() *
      (max - min) +
    min
  );

}


/* =========================================================
   ELAPSED TIME
   ========================================================= */

function getElapsed() {

  return Math.max(
    0,
    Math.min(
      GAME_DURATION,
      GAME_DURATION -
        state.timeLeft
    )
  );

}


/* =========================================================
   DIFFICULTY STAGE
   ========================================================= */

function getDifficultyStage() {

  const elapsed =
    getElapsed();

  if (
    elapsed < 10
  ) {

    return 0;

  }

  if (
    elapsed < 20
  ) {

    return 1;

  }

  if (
    elapsed < 30
  ) {

    return 2;

  }

  if (
    elapsed < 40
  ) {

    return 3;

  }

  if (
    elapsed < 50
  ) {

    return 4;

  }

  return 5;

}


/* =========================================================
   DIFFICULTY NAME
   ========================================================= */

function getDifficultyName() {

  switch (
    getDifficultyStage()
  ) {

    case 0:
      return "KHỞI ĐỘNG";

    case 1:
      return "TĂNG TỐC";

    case 2:
      return "NHIỆM VỤ KHÓ";

    case 3:
      return "BÁO ĐỘNG";

    case 4:
      return "ĐẶC NHIỆM";

    case 5:
      return "60 GIÂY CUỐI";

    default:
      return "NHIỆM VỤ";

  }

}


/* =========================================================
   PICK ITEM
   ========================================================= */

function pickItem() {

  const isBad =
    Math.random() <
    getBadChance();

  const list =
    isBad
      ? BAD_ITEMS
      : GOOD_ITEMS;

  const item =
    list[
      Math.floor(
        Math.random() *
          list.length
      )
    ];

  return {

    ...item,

    isBad,

    tapped: false

  };

}


/* =========================================================
   BAD ITEM CHANCE
   ========================================================= */

function getBadChance() {

  const elapsed =
    getElapsed();

  const progress =
    elapsed /
    GAME_DURATION;

  return Math.min(
    0.50,
    0.27 +
      progress * 0.23
  );

}


/* =========================================================
   ITEM SPEED
   ========================================================= */

function getItemSpeed() {

  const elapsed =
    getElapsed();

  const baseSpeed =
    115 +
    elapsed * 3.6;

  const comboBonus =
    Math.min(
      45,
      state.combo * 1.5
    );

  const randomBonus =
    random(
      0,
      65
    );

  const stageBonus =
    getDifficultyStage() *
    8;

  return Math.min(
    380,
    baseSpeed +
      comboBonus +
      randomBonus +
      stageBonus
  );

}


/* =========================================================
   SPAWN INTERVAL
   ========================================================= */

function getSpawnInterval() {

  const elapsed =
    getElapsed();

  const interval =
    900 -
    elapsed * 10.5;

  return Math.max(
    260,
    interval
  );

}


/* =========================================================
   MAX ACTIVE ITEMS
   ========================================================= */

function getDynamicMaxItems() {

  const elapsed =
    getElapsed();

  if (
    elapsed < 10
  ) {

    return 8;

  }

  if (
    elapsed < 20
  ) {

    return 11;

  }

  if (
    elapsed < 30
  ) {

    return 14;

  }

  if (
    elapsed < 40
  ) {

    return 18;

  }

  if (
    elapsed < 50
  ) {

    return 22;

  }

  return MAX_ITEMS;

}


/* =========================================================
   SHOULD BURST
   ========================================================= */

function shouldBurst(
  timestamp
) {

  const elapsed =
    getElapsed();

  if (
    elapsed < 35
  ) {

    return false;

  }

  let interval;

  if (
    elapsed < 45
  ) {

    interval = 5000;

  } else if (
    elapsed < 50
  ) {

    interval = 3500;

  } else {

    interval = 2200;

  }

  if (
    timestamp -
      state.lastBurstAt <
    interval
  ) {

    return false;

  }

  let chance;

  if (
    elapsed < 45
  ) {

    chance = 0.35;

  } else if (
    elapsed < 50
  ) {

    chance = 0.55;

  } else {

    chance = 0.75;

  }

  if (
    Math.random() <
    chance
  ) {

    state.lastBurstAt =
      timestamp;

    return true;

  }

  return false;

}


/* =========================================================
   BURST SPAWN
   ========================================================= */

function spawnBurst() {

  if (
    !state.playing ||
    state.ending
  ) {

    return;

  }

  const maxItems =
    getDynamicMaxItems();

  const available =
    Math.max(
      0,
      maxItems -
        state.items.length
    );

  if (
    available <= 0
  ) {

    return;

  }

  const elapsed =
    getElapsed();

  let count;

  if (
    elapsed < 45
  ) {

    count = 2;

  } else if (
    elapsed < 50
  ) {

    count =
      2 +
      Math.floor(
        Math.random() * 2
      );

  } else {

    count =
      3 +
      Math.floor(
        Math.random() * 2
      );

  }

  count =
    Math.min(
      count,
      available
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {

    spawnItem();

  }

}


/* =========================================================
   SPAWN ITEM
   ========================================================= */

function spawnItem() {

  if (
    !state.playing ||
    state.ending
  ) {

    return;

  }

  const maxItems =
    getDynamicMaxItems();

  if (
    state.items.length >=
    maxItems
  ) {

    return;

  }

  const item =
    pickItem();

  const el =
    document.createElement(
      "div"
    );

  el.className =
    `falling-item ${
      item.isBad
        ? "bad"
        : "good"
    }`;

  el.textContent =
    item.emoji;

  el.setAttribute(
    "aria-label",
    item.name
  );

  const maxX =
    Math.max(
      0,
      state.areaW -
        ITEM_SIZE
    );

  const x =
    random(
      8,
      Math.max(
        8,
        maxX - 8
      )
    );

  const y =
    -ITEM_SIZE -
    random(
      10,
      60
    );

  item.el =
    el;

  item.x =
    x;

  item.y =
    y;

  item.speed =
    getItemSpeed();

  item.spawnedAt =
    performance.now();

  el.style.left =
    `${x}px`;

  el.style.top =
    `${y}px`;

  el.addEventListener(
    "pointerdown",
    event => {

      event.preventDefault();

      handleTap(item);

    },
    {
      passive: false
    }
  );

  playArea.appendChild(
    el
  );

  state.items.push(
    item
  );

}


/* =========================================================
   REMOVE ITEM
   ========================================================= */

function removeItem(
  item,
  animate = false
) {

  const index =
    state.items.indexOf(
      item
    );

  if (
    index !== -1
  ) {

    state.items.splice(
      index,
      1
    );

  }

  if (
    animate &&
    item.el
  ) {

    item.el.classList.add(
      "pop"
    );

    setTimeout(
      () => {

        item.el?.remove();

      },
      140
    );

  } else {

    item.el?.remove();

  }

}


/* =========================================================
   PROCESS ONE ACTION
   ========================================================= */

async function processAction(
  item
) {

  if (
    !state.sessionToken
  ) {

    throw new Error(
      "NO_SESSION"
    );

  }

  if (
    state.actionError
  ) {

    return;

  }

  /*
   * Nếu mạng quá nhanh,
   * chờ khoảng cách an toàn giữa 2 action.
   */
  await waitForActionSlot();

  /*
   * Sequence được lấy NGAY TRƯỚC khi gửi.
   *
   * Vì queue chỉ chạy một action tại một thời điểm,
   * sequence luôn chính xác.
   */
  const sequence =
    state.actionSequence +
    1;

  console.log(
    "[ACTION SEND]",
    {
      sequence,
      itemKey:
        item.itemKey,
      pending:
        state.pendingActions
    }
  );

  const data =
    await apiRequest(
      `/games/${encodeURIComponent(
        GAME_SLUG
      )}/action`,
      {
        method: "POST",

        timeoutMs:
          ACTION_TIMEOUT_MS,

        body:
          JSON.stringify({

            sessionToken:
              state.sessionToken,

            itemKey:
              item.itemKey,

            /*
             * Server hiện tại chỉ nhận catch.
             */
            answer:
              "catch",

            sequence

          })
      }
    );

  /*
   * Kiểm tra response.
   */
  if (
    !data?.action ||
    !data?.session
  ) {

    throw new Error(
      "INVALID_ACTION_RESPONSE"
    );

  }

  /*
   * CHỈ cập nhật sequence
   * sau khi server xác nhận.
   */
  state.actionSequence =
    Number(
      data.action.sequence
    );

  /*
   * SERVER AUTHORITATIVE.
   */
  state.serverScore =
    Number(
      data.session.goodHits
    );

  state.goodHits =
    Number(
      data.session.goodHits
    );

  state.mistakes =
    Number(
      data.session.mistakes
    );

  if (
    data.action.correct
  ) {

    handleCorrect(
      item
    );

  } else {

    handleWrong(
      item
    );

  }

  updateHUD();

  /*
   * Chỉ remove sau khi server xác nhận.
   */
  removeItem(
    item,
    true
  );

  console.log(
    "[ACTION OK]",
    {
      sequence:
        state.actionSequence,

      correct:
        data.action.correct,

      score:
        state.serverScore
    }
  );

}


/* =========================================================
   HANDLE TAP
   ========================================================= */
/* =========================================================
   HANDLE CORRECT
   ========================================================= */

function handleCorrect(item) {

  state.combo++;

  showFlash("good");

  let text = "ĐÚNG!";

  if (state.combo >= 5) {
    text = `ĐÚNG! COMBO x${state.combo}`;
  } else if (state.combo >= 3) {
    text = `TỐT LẮM! x${state.combo}`;
  }

  floatingText(
    text,
    item.x,
    item.y,
    "good"
  );

}


/* =========================================================
   HANDLE WRONG
   ========================================================= */

function handleWrong(item) {

  state.combo = 0;

  state.lives =
    Math.max(
      0,
      state.lives - 1
    );

  showFlash("bad");

  floatingText(
    "SAI!",
    item.x,
    item.y,
    "bad"
  );

  /*
   * Hết mạng thì không nhận thêm click mới.
   * Các action đã nằm trong queue vẫn được xử lý.
   */
  if (
    state.lives <= 0
  ) {

    state.playing = false;

  }

}
function handleTap(
  item
) {

  if (
    !state.playing ||
    state.ending ||
    state.actionError ||
    !item ||
    item.tapped
  ) {

    return;

  }

  /*
   * Không cho queue vô hạn.
   */
  if (
    state.pendingActions >=
    MAX_PENDING_ACTIONS
  ) {

    floatingText(
      "Đang xử lý...",
      item.x,
      item.y,
      "bad"
    );

    return;

  }

  /*
   * Chặn click cùng item nhiều lần.
   */
  item.tapped =
    true;

  if (
    item.el
  ) {

    item.el.classList.add(
      "pending"
    );

  }

  state.pendingActions++;

  /*
   * Thêm action vào queue.
   */
  const job =
    state.actionQueue.then(
      async () => {

        /*
         * Nếu action trước đã lỗi,
         * không gửi action tiếp theo.
         */
        if (
          state.actionError
        ) {

          item.tapped =
            false;

          item.el?.classList.remove(
            "pending"
          );

          return;

        }

        try {

          await processAction(
            item
          );

        } catch (error) {

          console.error(
            "[ACTION ERROR]",
            error
          );

          state.actionError =
            error;

          item.tapped =
            false;

          item.el?.classList.remove(
            "pending"
          );

          /*
           * Dừng gameplay.
           */
          state.playing =
            false;

          state.gameEndReason =
            "NETWORK_ERROR";

          if (
            state.animId
          ) {

            cancelAnimationFrame(
              state.animId
            );

            state.animId =
              null;

          }

          if (
            state.timerId
          ) {

            clearInterval(
              state.timerId
            );

            state.timerId =
              null;

          }

        }

      }
    );

  /*
   * Queue luôn resolve.
   */
  state.actionQueue =
    job.catch(
      error => {

        console.error(
          "[QUEUE ERROR]",
          error
        );

      }
    );

  /*
   * Khi action hoàn thành.
   */
  job.finally(
    () => {

      state.pendingActions =
        Math.max(
          0,
          state.pendingActions - 1
        );

      /*
       * Nếu action lỗi và queue đã hết,
       * mới endGame.
       */
      if (
        state.actionError &&
        !state.ending &&
        state.pendingActions === 0
      ) {

        setTimeout(
          () => {

            if (
              !state.ending
            ) {

              endGame(
                "NETWORK_ERROR"
              );

            }

          },
          0
        );

        return;

      }

      /*
       * Nếu hết mạng sống,
       * chờ queue hoàn tất rồi end.
       */
      if (
        state.lives <= 0 &&
        !state.ending &&
        state.pendingActions === 0
      ) {

        setTimeout(
          () => {

            if (
              !state.ending
            ) {

              endGame(
                "NO_LIVES"
              );

            }

          },
          0
        );

      }

    }
  );

}


/* =========================================================
   UPDATE ITEMS
   ========================================================= */

function updateItems(
  delta
) {

  for (
    let i =
      state.items.length - 1;
    i >= 0;
    i--
  ) {

    const item =
      state.items[i];

    if (
      !item
    ) {

      continue;

    }

    /*
     * Item pending đứng yên
     * trong lúc chờ server.
     */
    if (
      !item.tapped
    ) {

      item.y +=
        item.speed *
        delta;

    }

    if (
      item.el
    ) {

      item.el.style.left =
        `${item.x}px`;

      item.el.style.top =
        `${item.y}px`;

    }

    /*
     * Rơi khỏi màn hình.
     */
    if (
      item.y >
      state.areaH +
        ITEM_SIZE
    ) {

      removeItem(
        item
      );

    }

  }

}


/* =========================================================
   UPDATE DIFFICULTY
   ========================================================= */

function updateDifficulty() {

  const stage =
    getDifficultyStage();

  if (
    stage ===
    state.difficultyStage
  ) {

    return;

  }

  state.difficultyStage =
    stage;

  console.log(
    "[DIFFICULTY]",
    getDifficultyName()
  );

}


/* =========================================================
   GAME LOOP
   ========================================================= */

function gameLoop(
  timestamp
) {

  if (
    !state.playing ||
    state.ending
  ) {

    return;

  }

  if (
    !state.lastFrame
  ) {

    state.lastFrame =
      timestamp;

  }

  const delta =
    Math.min(
      0.05,
      (
        timestamp -
        state.lastFrame
      ) / 1000
    );

  state.lastFrame =
    timestamp;

  updateDifficulty();

  /*
   * Spawn.
   */
  if (
    timestamp -
      state.lastSpawn >=
    state.spawnInterval
  ) {

    spawnItem();

    state.lastSpawn =
      timestamp;

    state.spawnInterval =
      getSpawnInterval();

  }

  /*
   * Burst.
   */
  if (
    shouldBurst(
      timestamp
    )
  ) {

    spawnBurst();

  }

  /*
   * Move.
   */
  updateItems(
    delta
  );

  state.animId =
    requestAnimationFrame(
      gameLoop
    );

}


/* =========================================================
   CLEAR ITEMS
   ========================================================= */

function clearItems() {

  for (
    const item of state.items
  ) {

    item.el?.remove();

  }

  state.items =
    [];

}


/* =========================================================
   TIMER
   ========================================================= */

function startTimer() {

  clearInterval(
    state.timerId
  );

  state.timerId =
    setInterval(
      () => {

        if (
          !state.playing ||
          state.ending
        ) {

          return;

        }

        state.timeLeft =
          Math.max(
            0,
            state.timeLeft - 1
          );

        updateHUD();

        if (
          state.timeLeft <= 0
        ) {

          /*
           * Không nhận click mới.
           *
           * endGame sẽ chờ queue.
           */
          state.playing =
            false;

          endGame(
            "TIME_UP"
          );

        }

      },
      1000
    );

}


/* =========================================================
   RESET STATE
   ========================================================= */

function resetState() {

  if (
    state.animId
  ) {

    cancelAnimationFrame(
      state.animId
    );

  }

  if (
    state.timerId
  ) {

    clearInterval(
      state.timerId
    );

  }

  clearItems();

  state.playing =
    false;

  state.ending =
    false;

  state.nickname =
    "";

  state.sessionToken =
    null;

  state.sessionId =
    null;

  state.serverScore =
    0;

  state.goodHits =
    0;

  state.mistakes =
    0;

  state.actionSequence =
    0;

  state.actionQueue =
    Promise.resolve();

  state.pendingActions =
    0;

  state.actionError =
    null;

  state.lastActionSentAt =
    0;

  state.submitStarted =
    false;

  state.canRestart =
    false;

  state.combo =
    0;

  state.lives =
    3;

  state.timeLeft =
    GAME_DURATION;

  state.items =
    [];

  state.spawnInterval =
    900;

  state.lastSpawn =
    0;

  state.lastFrame =
    0;

  state.animId =
    null;

  state.timerId =
    null;

  state.startedAt =
    null;

  state.serverDuration =
    0;

  state.lastBurstAt =
    0;

  state.difficultyStage =
    0;

  state.gameEndReason =
    null;

  updateHUD();

}


/* =========================================================
   RESIZE
   ========================================================= */

function resizePlayArea() {

  if (
    !playArea
  ) {

    return;

  }

  const rect =
    playArea.getBoundingClientRect();

  state.areaW =
    rect.width;

  state.areaH =
    rect.height;

}


/* =========================================================
   WAIT FOR ACTION QUEUE
   ========================================================= */

async function waitForActionQueue() {

  /*
   * Chờ toàn bộ queue.
   */
  try {

    await state.actionQueue;

  } catch (error) {

    console.error(
      "[QUEUE WAIT ERROR]",
      error
    );

  }

  /*
   * Đợi callback finally cập nhật pendingActions.
   */
  let guard = 0;

  while (
    state.pendingActions > 0 &&
    guard < 1500
  ) {

    await sleep(20);

    guard++;

  }

}


/* =========================================================
   START GAME
   ========================================================= */

async function startGame() {

  if (
    state.playing ||
    state.ending
  ) {

    return;

  }

  if (
    !nicknameInput
  ) {

    console.error(
      "Không tìm thấy #nicknameInput"
    );

    return;

  }

  /*
   * Đọc trực tiếp từ input.
   */
  const nickname =
    normalizeNickname(
      nicknameInput.value
    );

  console.log(
    "[NICKNAME]",
    nickname
  );

  /*
   * Không nhập tên.
   */
  if (!nickname) {

    if (
      loadingText
    ) {

      loadingText.textContent =
        "Em hãy nhập tên trước nhé.";

    }

    nicknameInput.focus();

    return;

  }

  /*
   * Tên không hợp lệ.
   */
  if (
    !validNickname(
      nickname
    )
  ) {

    if (
      loadingText
    ) {

      loadingText.textContent =
        "Tên phải từ 2–20 ký tự, không chứa ký tự đặc biệt.";

    }

    nicknameInput.focus();

    return;

  }

  startButton.disabled =
    true;

  nicknameInput.disabled =
    true;

  loadingText.textContent =
    "Đang khởi tạo nhiệm vụ...";

  try {

    resetState();

    state.nickname =
      nickname;

    const data =
      await apiRequest(
        `/games/${encodeURIComponent(
          GAME_SLUG
        )}/start`,
        {
          method: "POST",

          timeoutMs:
            START_TIMEOUT_MS,

          body:
            JSON.stringify({
              nickname
            })
        }
      );

    if (
      !data?.success ||
      !data?.session?.token
    ) {

      throw new Error(
        "INVALID_START_RESPONSE"
      );

    }

    state.sessionToken =
      data.session.token;

    state.sessionId =
      data.session.id;

    state.startedAt =
      data.session.startedAt ||
      Date.now();

    state.playing =
      true;

    state.ending =
      false;

    state.submitStarted =
      false;

    state.actionSequence =
      0;

    state.pendingActions =
      0;

    state.actionError =
      null;

    state.actionQueue =
      Promise.resolve();

    state.lastActionSentAt =
      0;

    state.canRestart =
      false;

    state.gameEndReason =
      null;

    startOverlay.classList.add(
      "hidden"
    );

    endOverlay.classList.add(
      "hidden"
    );

    loadingText.textContent =
      "";

    resizePlayArea();

    updateHUD();

    /*
     * Item đầu tiên.
     */
    spawnItem();

    /*
     * Item thứ hai.
     */
    setTimeout(
      () => {

        if (
          state.playing &&
          !state.ending &&
          state.timeLeft > 0
        ) {

          spawnItem();

        }

      },
      450
    );

    state.lastSpawn =
      performance.now();

    state.lastFrame =
      performance.now();

    state.lastBurstAt =
      performance.now();

    state.spawnInterval =
      getSpawnInterval();

    state.animId =
      requestAnimationFrame(
        gameLoop
      );

    startTimer();

  } catch (error) {

    console.error(
      "[START ERROR]",
      error
    );

    state.playing =
      false;

    state.sessionToken =
      null;

    loadingText.textContent =
      getFriendlyError(
        error
      );

  } finally {

    startButton.disabled =
      false;

    nicknameInput.disabled =
      false;

  }

}


/* =========================================================
   END GAME
   ========================================================= */

async function endGame(
  reason
) {

  /*
   * Không endGame 2 lần.
   */
  if (
    state.ending ||
    state.submitStarted
  ) {

    return;

  }

  state.ending =
    true;

  state.playing =
    false;

  state.gameEndReason =
    reason;

  /*
   * Dừng gameplay.
   */
  if (
    state.animId
  ) {

    cancelAnimationFrame(
      state.animId
    );

    state.animId =
      null;

  }

  if (
    state.timerId
  ) {

    clearInterval(
      state.timerId
    );

    state.timerId =
      null;

  }

  /*
   * Không cho click item mới.
   */
  for (
    const item of state.items
  ) {

    item.tapped =
      true;

    item.el?.remove();

  }

  state.items =
    [];

  /*
   * QUAN TRỌNG:
   *
   * Chờ toàn bộ action đã click
   * được server xử lý xong.
   */
  await waitForActionQueue();

  /*
   * Nếu một action lỗi,
   * tuyệt đối không submit session.
   */
  if (
    state.actionError
  ) {

    const error =
      state.actionError;

    console.error(
      "[GAME ACTION FAILED]",
      error
    );

    let message =
      "Kết nối máy chủ bị gián đoạn. Lượt chơi chưa thể chốt điểm.";

    if (
      error?.message ===
      "REQUEST_TIMEOUT"
    ) {

      message =
        "Mạng đang quá chậm nên máy chủ chưa xác nhận được lượt chơi. Em hãy thử lại.";

    }

    if (
      error?.message ===
      "INVALID_SEQUENCE"
    ) {

      message =
        "Kết nối bị gián đoạn trong lúc ghi nhận lượt chơi. Em hãy thử lại.";

    }

    if (
      error?.message ===
      "SESSION_EXPIRED"
    ) {

      message =
        "Phiên chơi đã hết hạn. Em hãy thử lại.";

    }

    showEndScreenLocal(
      message
    );

    state.canRestart =
      true;

    return;

  }

  /*
   * Không có session.
   */
  if (
    !state.sessionToken
  ) {

    showEndScreenLocal(
      "Không tìm thấy phiên chơi."
    );

    state.canRestart =
      true;

    return;

  }

  /*
   * Submit chỉ một lần.
   */
  state.submitStarted =
    true;

  if (
    resultMessage
  ) {

    resultMessage.textContent =
      "Đang chốt kết quả với máy chủ...";

  }

  if (
    finalScore
  ) {

    finalScore.textContent =
      String(
        state.serverScore
      );

  }

  if (
    endOverlay
  ) {

    endOverlay.classList.remove(
      "hidden"
    );

  }

  try {

    /*
     * CHỈ gửi sessionToken.
     */
    const submitData =
      await apiRequest(
        `/games/${encodeURIComponent(
          GAME_SLUG
        )}/submit`,
        {
          method: "POST",

          timeoutMs:
            SUBMIT_TIMEOUT_MS,

          body:
            JSON.stringify({

              sessionToken:
                state.sessionToken

            })
        }
      );

    if (
      !submitData?.success ||
      !submitData?.score
    ) {

      throw new Error(
        "INVALID_SUBMIT_RESPONSE"
      );

    }

    /*
     * SERVER AUTHORITATIVE.
     */
    state.serverScore =
      Number(
        submitData.score.score
      );

    state.goodHits =
      Number(
        submitData.score.goodHits
      );

    state.mistakes =
      Number(
        submitData.score.mistakes
      );

    state.serverDuration =
      Number(
        submitData.score.duration
      );

    if (
      finalScore
    ) {

      finalScore.textContent =
        String(
          state.serverScore
        );

    }

    if (
      resultMessage
    ) {

      resultMessage.innerHTML =
        buildResultMessage(
          reason
        );

    }

    /*
     * Leaderboard lỗi không làm mất điểm.
     */
    try {

      await loadLeaderboard();

    } catch (
      leaderboardError
    ) {

      console.warn(
        "[LEADERBOARD ERROR]",
        leaderboardError
      );

    }

  } catch (error) {

    console.error(
      "[SUBMIT ERROR]",
      error
    );

    let message =
      "Không thể chốt điểm với máy chủ. Hãy kiểm tra kết nối rồi thử lại.";

    if (
      error?.message ===
      "REQUEST_TIMEOUT"
    ) {

      message =
        "Máy chủ phản hồi quá chậm. Hãy thử lại sau.";

    } else if (
      error?.message ===
      "SESSION_FLAGGED"
    ) {

      message =
        "Lượt chơi đã bị máy chủ đánh dấu cần kiểm tra.";

    } else if (
      error?.message ===
      "SESSION_EXPIRED"
    ) {

      message =
        "Phiên chơi đã hết hạn.";

    } else if (
      error?.message ===
      "ALREADY_SUBMITTED"
    ) {

      message =
        "Lượt chơi này đã được chốt trước đó.";

    }

    if (
      resultMessage
    ) {

      resultMessage.textContent =
        message;

    }

  } finally {

    /*
     * Từ đây mới cho restart.
     */
    state.canRestart =
      true;

  }

}


/* =========================================================
   LOCAL END SCREEN
   ========================================================= */

function showEndScreenLocal(
  message
) {

  if (
    finalScore
  ) {

    finalScore.textContent =
      String(
        state.serverScore
      );

  }

  if (
    resultMessage
  ) {

    resultMessage.textContent =
      message;

  }

  if (
    endOverlay
  ) {

    endOverlay.classList.remove(
      "hidden"
    );

  }

}


/* =========================================================
   BUILD RESULT MESSAGE
   ========================================================= */

function buildResultMessage(
  reason
) {

  if (
    reason ===
    "NO_LIVES"
  ) {

    return `

      Hết mạng rồi!

      <br>

      Đúng: ${state.goodHits}

      · Sai: ${state.mistakes}

    `;

  }

  if (
    reason ===
    "NETWORK_ERROR"
  ) {

    return `

      Có lỗi kết nối máy chủ.

      <br>

      Vui lòng thử lại.

    `;

  }

  return `

    Nhiệm vụ hoàn thành!

    <br>

    Đúng: ${state.goodHits}

    · Sai: ${state.mistakes}

    · Thời gian: ${state.serverDuration}s

  `;

}


/* =========================================================
   END SCREEN
   ========================================================= */

function showEndScreen(
  score,
  reason
) {

  if (
    finalScore
  ) {

    finalScore.textContent =
      String(
        score?.score || 0
      );

  }

  if (
    resultMessage
  ) {

    resultMessage.innerHTML =
      buildResultMessage(
        reason
      );

  }

  if (
    endOverlay
  ) {

    endOverlay.classList.remove(
      "hidden"
    );

  }

}


/* =========================================================
   LEADERBOARD
   ========================================================= */

async function loadLeaderboard() {

  if (
    !leaderboardRows
  ) {

    return;

  }

  leaderboardRows.innerHTML = `

    <div class="empty-board">

      Đang tải bảng xếp hạng...

    </div>

  `;

  const data =
    await apiRequest(
      `/games/${encodeURIComponent(
        GAME_SLUG
      )}/leaderboard`,
      {
        method: "GET",

        timeoutMs:
          GET_TIMEOUT_MS
      }
    );

  const rows =
    Array.isArray(
      data?.leaderboard
    )
      ? data.leaderboard
      : Array.isArray(data)
        ? data
        : [];

  if (
    rows.length === 0
  ) {

    leaderboardRows.innerHTML = `

      <div class="empty-board">

        Chưa có người chơi.

      </div>

    `;

    return;

  }

  leaderboardRows.innerHTML =
    rows
      .slice(
        0,
        10
      )
      .map(
        (
          row,
          index
        ) => {

          const nickname =
            row?.nickname ??
            row?.player?.nickname ??
            "Ẩn danh";

          const score =
            Number(
              row?.score ?? 0
            );

          const duration =
            Number(
              row?.duration ?? 0
            );

          const rank =
            Number(
              row?.rank ??
              index + 1
            );

          const isMe =
            normalizeNickname(
              nickname
            ).toLowerCase() ===
            normalizeNickname(
              state.nickname
            ).toLowerCase();

          return `

            <div class="rank-row ${
              isMe
                ? "me"
                : ""
            }">

              <div class="rank-number">

                ${rank}

              </div>

              <div class="rank-name">

                ${escapeHtml(
                  nickname
                )}

              </div>

              <div class="rank-score">

                ${score}

              </div>

              <div class="rank-duration">

                ${duration}

              </div>

            </div>

          `;

        }
      )
      .join("");

  /*
   * Hạng cá nhân lỗi không ảnh hưởng leaderboard.
   */
  try {

    await loadMyRank();

  } catch (
    error
  ) {

    console.warn(
      "[MY RANK ERROR]",
      error
    );

  }

}


/* =========================================================
   MY RANK
   ========================================================= */

async function loadMyRank() {

  if (
    !state.nickname
  ) {

    return;

  }

  const data =
    await apiRequest(
      `/games/${encodeURIComponent(
        GAME_SLUG
      )}/leaderboard/${encodeURIComponent(
        state.nickname
      )}`,
      {
        method: "GET",

        timeoutMs:
          GET_TIMEOUT_MS
      }
    );

  const rank =
    data?.rank ??
    data?.player?.rank ??
    null;

  if (
    rank !== null &&
    resultMessage
  ) {

    resultMessage.innerHTML += `

      <br>

      Hạng hiện tại:

      <strong>${escapeHtml(
        rank
      )}</strong>

    `;

  }

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(
  value
) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   FRIENDLY ERROR
   ========================================================= */

function getFriendlyError(
  error
) {

  const code =
    error?.message ||
    "";

  switch (
    code
  ) {

    case "START_RATE_LIMITED":

      return "Em đã bắt đầu quá nhiều lần. Hãy chờ một chút rồi thử lại.";

    case "TOO_MANY_ACTIVE_SESSIONS":

      return "Đang có quá nhiều nhiệm vụ chưa hoàn thành trên thiết bị này.";

    case "GAME_NOT_ACTIVE":

      return "Trò chơi hiện đang tạm đóng.";

    case "GAME_NOT_FOUND":

      return "Không tìm thấy trò chơi.";

    case "INVALID_NICKNAME":

      return "Tên không hợp lệ. Hãy nhập tên từ 2–20 ký tự.";

    case "REQUEST_TIMEOUT":

      return "Mạng đang chậm. Không kết nối được máy chủ.";

    case "Failed to fetch":

      return "Không kết nối được máy chủ. Hãy kiểm tra mạng.";

    default:

      return "Không thể bắt đầu trò chơi. Vui lòng thử lại.";

  }

}


/* =========================================================
   RESTART
   ========================================================= */

function restartGame() {

  /*
   * Tuyệt đối không reset khi action
   * hoặc submit cũ chưa hoàn tất.
   */
  if (
    state.ending &&
    !state.canRestart
  ) {

    if (
      resultMessage
    ) {

      resultMessage.textContent =
        "Đang hoàn tất lượt chơi, em chờ một chút nhé.";

    }

    return;

  }

  if (
    state.pendingActions > 0
  ) {

    if (
      resultMessage
    ) {

      resultMessage.textContent =
        "Đang chờ máy chủ hoàn tất lượt chơi.";

    }

    return;

  }

  const oldNickname =
    normalizeNickname(
      nicknameInput?.value ||
      state.nickname
    );

  if (
    endOverlay
  ) {

    endOverlay.classList.add(
      "hidden"
    );

  }

  resetState();

  state.nickname =
    oldNickname;

  if (
    nicknameInput
  ) {

    nicknameInput.disabled =
      false;

    nicknameInput.value =
      oldNickname;

  }

  if (
    startButton
  ) {

    startButton.disabled =
      false;

  }

  if (
    startOverlay
  ) {

    startOverlay.classList.remove(
      "hidden"
    );

  }

  if (
    loadingText
  ) {

    loadingText.textContent =
      "";

  }

  setTimeout(
    () => {

      nicknameInput?.focus();

    },
    100
  );

}


/* =========================================================
   EVENTS
   ========================================================= */

if (
  startButton
) {

  startButton.addEventListener(
    "click",
    startGame
  );

}


if (
  restartButton
) {

  restartButton.addEventListener(
    "click",
    restartGame
  );

}


if (
  nicknameInput
) {

  nicknameInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        startGame();

      }

    }
  );

}


window.addEventListener(
  "resize",
  resizePlayArea
);


/* =========================================================
   INITIALIZE
   ========================================================= */

resetState();

resizePlayArea();

setTimeout(
  () => {

    nicknameInput?.focus();

  },
  200
);


console.log(
  "Đội Đặc Nhiệm Nhí - JS loaded"
);

console.log(
  "API:",
  API_BASE
);

console.log(
  "GAME:",
  GAME_SLUG
);

console.log(
  "ACTION QUEUE: ENABLED"
);

console.log(
  "ACTION RATE:",
  `${1000 / MIN_ACTION_GAP_MS} actions/sec max`
);
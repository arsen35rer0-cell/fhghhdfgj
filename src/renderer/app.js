"use strict";

const SAVE_KEY = "imba-clicker-save-v1";

const UPGRADES = [
  {
    id: "clickPower",
    name: "Импульс клика",
    desc: "+1 к силе клика за уровень.",
    icon: "⚡",
    baseCost: 15,
    growth: 1.15
  },
  {
    id: "autoClick",
    name: "Нано-дрон",
    desc: "+1 монета в секунду за уровень.",
    icon: "🛰️",
    baseCost: 60,
    growth: 1.18
  },
  {
    id: "critChance",
    name: "Критический контур",
    desc: "+2% шанс критического клика.",
    icon: "🎯",
    baseCost: 180,
    growth: 1.25,
    max: 25
  },
  {
    id: "critMult",
    name: "Усилитель крита",
    desc: "+25% к множителю критического клика.",
    icon: "💥",
    baseCost: 420,
    growth: 1.3
  },
  {
    id: "globalMult",
    name: "Полировка ядра",
    desc: "+5% ко всему доходу за уровень.",
    icon: "🌌",
    baseCost: 900,
    growth: 1.35
  },
  {
    id: "combo",
    name: "Комбо-двигатель",
    desc: "Каждые 10 быстрых кликов дают бонус. Уровень увеличивает бонус.",
    icon: "🔥",
    baseCost: 1500,
    growth: 1.4,
    max: 10
  }
];

const BUFFS = [
  {
    id: "x2",
    type: "multiplier",
    name: "Двойной поток",
    desc: "Весь доход x2 на 30 секунд.",
    icon: "✨",
    baseCost: 500,
    growth: 1.22,
    duration: 30,
    value: 2
  },
  {
    id: "x5",
    type: "multiplier",
    name: "Квантовый шторм",
    desc: "Весь доход x5 на 12 секунд.",
    icon: "🌪️",
    baseCost: 5200,
    growth: 1.25,
    duration: 12,
    value: 5
  },
  {
    id: "autoFrenzy",
    type: "cps",
    name: "Авто-френзи",
    desc: "Автодоход x3 на 20 секунд.",
    icon: "🤖",
    baseCost: 2600,
    growth: 1.24,
    duration: 20,
    value: 3
  },
  {
    id: "lucky",
    type: "crit",
    name: "Кристальная удача",
    desc: "+25% шанс крита на 25 секунд.",
    icon: "🍀",
    baseCost: 1400,
    growth: 1.23,
    duration: 25,
    value: 25
  },
  {
    id: "instant",
    type: "instant",
    name: "Мгновенный буст",
    desc: "Сразу получает 60 секунд автодохода и 50 сил клика.",
    icon: "🚀",
    baseCost: 900,
    growth: 1.2,
    duration: 0,
    value: 0
  }
];

let state = defaultState();
let activeTab = "upgrades";
let displayedCoins = 0;
let lastFrame = performance.now();
let lastBuffUi = 0;
let lastAutoSave = performance.now();
let toastTimer = null;
let particles = [];

const clickCombo = {
  count: 0,
  last: 0
};

const els = {};

function defaultState() {
  const upgrades = {};
  const buffBuys = {};

  UPGRADES.forEach((item) => {
    upgrades[item.id] = 0;
  });

  BUFFS.forEach((item) => {
    buffBuys[item.id] = 0;
  });

  return {
    coins: 0,
    totalCoins: 0,
    clicks: 0,
    upgrades,
    buffBuys,
    activeBuffs: {},
    lastSaved: Date.now(),
    settings: {
      offlineEarnings: true
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    const fresh = defaultState();

    state = {
      ...fresh,
      ...data,
      upgrades: {
        ...fresh.upgrades,
        ...(data.upgrades || {})
      },
      buffBuys: {
        ...fresh.buffBuys,
        ...(data.buffBuys || {})
      },
      activeBuffs: {
        ...(data.activeBuffs || {})
      },
      settings: {
        ...fresh.settings,
        ...(data.settings || {})
      }
    };
  } catch (error) {
    console.warn("Не удалось загрузить сохранение:", error);
    state = defaultState();
  }
}

function saveState() {
  state.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function clearExpiredBuffs() {
  const now = Date.now();

  for (const id of Object.keys(state.activeBuffs)) {
    if (state.activeBuffs[id] <= now) {
      delete state.activeBuffs[id];
    }
  }
}

function formatNumber(value) {
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

  if (!Number.isFinite(value)) return "∞";
  if (value < 0) return `-${formatNumber(-value)}`;
  if (value < 1000) return Math.floor(value).toString();

  let unit = 0;
  let v = value;

  while (v >= 1000 && unit < units.length - 1) {
    v /= 1000;
    unit += 1;
  }

  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)}${units[unit]}`;
}

function getUpgrade(id) {
  return UPGRADES.find((item) => item.id === id);
}

function getBuff(id) {
  return BUFFS.find((item) => item.id === id);
}

function getLevel(id) {
  return state.upgrades[id] || 0;
}

function getUpgradeCost(id) {
  const item = getUpgrade(id);
  return Math.floor(item.baseCost * Math.pow(item.growth, getLevel(id)));
}

function isUpgradeMaxed(id) {
  const item = getUpgrade(id);
  return item.max ? getLevel(id) >= item.max : false;
}

function getBuffCost(id) {
  const item = getBuff(id);
  return Math.floor(item.baseCost * Math.pow(item.growth, state.buffBuys[id] || 0));
}

function isBuffActive(id) {
  return (state.activeBuffs[id] || 0) > Date.now();
}

function getBuffRemaining(id) {
  return Math.max(0, ((state.activeBuffs[id] || 0) - Date.now()) / 1000);
}

function getGlobalMult() {
  return 1 + getLevel("globalMult") * 0.05;
}

function getActiveMultiplier() {
  let mult = 1;

  for (const buff of BUFFS) {
    if (buff.type === "multiplier" && isBuffActive(buff.id)) {
      mult *= buff.value;
    }
  }

  return mult;
}

function getCpsBuffMult() {
  const buff = getBuff("autoFrenzy");
  return buff && isBuffActive(buff.id) ? buff.value : 1;
}

function getBuffCritBonus() {
  const buff = getBuff("lucky");
  return buff && isBuffActive(buff.id) ? buff.value : 0;
}

function getCps() {
  return (
    getLevel("autoClick") *
    getGlobalMult() *
    getActiveMultiplier() *
    getCpsBuffMult()
  );
}

function getBaseClickPower() {
  return 1 + getLevel("clickPower");
}

function getClickPower() {
  return getBaseClickPower() * getGlobalMult() * getActiveMultiplier();
}

function getCritChance() {
  return Math.min(
    0.8,
    0.02 + getLevel("critChance") * 0.02 + getBuffCritBonus() / 100
  );
}

function getCritMult() {
  return 2 + getLevel("critMult") * 0.25;
}

function getImbaLevel() {
  const totalUpgrades = Object.values(state.upgrades).reduce((sum, level) => sum + level, 0);
  return 1 + totalUpgrades + Math.floor(state.totalCoins / 50000);
}

function addCoins(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.coins += amount;
  state.totalCoins += amount;
}

function buyUpgrade(id) {
  if (isUpgradeMaxed(id)) return;

  const cost = getUpgradeCost(id);
  if (state.coins < cost) return;

  state.coins -= cost;
  state.upgrades[id] += 1;

  renderShop();
  updateHUD();
  saveState();
  showToast(`Куплено: ${getUpgrade(id).name}`);
}

function buyBuff(id) {
  const item = getBuff(id);
  const cost = getBuffCost(id);

  if (state.coins < cost) return;

  state.coins -= cost;
  state.buffBuys[id] += 1;

  if (item.type === "instant") {
    const amount = getCps() * 60 + getClickPower() * 50;
    addCoins(amount);
    spawnCenterBurst();
    showToast(`Мгновенный буст: +${formatNumber(amount)}`);
  } else {
    const now = Date.now();
    const current = state.activeBuffs[id] || 0;
    const base = Math.max(current, now);
    state.activeBuffs[id] = base + item.duration * 1000;
    showToast(`Бафф активирован: ${item.name}`);
  }

  renderShop();
  updateHUD();
  saveState();
}

function registerCombo() {
  const now = performance.now();

  if (now - clickCombo.last < 1200) {
    clickCombo.count += 1;
  } else {
    clickCombo.count = 1;
  }

  clickCombo.last = now;

  if (clickCombo.count >= 10) {
    clickCombo.count = 0;

    const comboLevel = getLevel("combo");

    if (comboLevel > 0) {
      const bonus = getClickPower() * (10 + comboLevel * 5);
      addCoins(bonus);

      const rect = els.clickButton.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      showFloating(`Комбо +${formatNumber(bonus)}`, x, y, "combo");
      particleBurst(x, y, 40, "#ffd166");
    }
  }
}

function doClick(x, y) {
  registerCombo();

  let amount = getClickPower();
  let crit = false;

  if (Math.random() < getCritChance()) {
    crit = true;
    amount *= getCritMult();
  }

  addCoins(amount);
  state.clicks += 1;

  showFloating(`+${formatNumber(amount)}`, x, y, crit ? "crit" : "normal");
  particleBurst(x, y, crit ? 34 : 16, crit ? "#ff70a6" : "#7dd3fc");

  els.clickButton.classList.remove("clicked");
  void els.clickButton.offsetWidth;
  els.clickButton.classList.add("clicked");

  updateHUD();
}

function showFloating(text, x, y, mode = "normal") {
  const el = document.createElement("div");
  el.className = `floating ${mode}`;
  el.textContent = text;

  if (x == null || y == null) {
    const rect = els.clickButton.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const jitterX = Math.random() * 56 - 28;
  const jitterY = Math.random() * 24 - 12;

  el.style.left = `${x + jitterX}px`;
  el.style.top = `${y + jitterY}px`;

  if (els.floatingLayer.childElementCount > 80) {
    els.floatingLayer.firstChild.remove();
  }

  els.floatingLayer.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function resizeCanvas() {
  els.canvas.width = window.innerWidth;
  els.canvas.height = window.innerHeight;
}

function particleBurst(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 260;
    const life = 0.65 + Math.random() * 0.35;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      life,
      maxLife: life,
      size: 2 + Math.random() * 4,
      color
    });
  }

  if (particles.length > 700) {
    particles.splice(0, particles.length - 700);
  }
}

function spawnCenterBurst() {
  const rect = els.clickButton.getBoundingClientRect();
  particleBurst(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    50,
    "#a78bfa"
  );
}

function drawParticles(dt) {
  els.ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  els.ctx.globalCompositeOperation = "lighter";

  particles = particles.filter((p) => p.life > 0);

  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 260 * dt;
    p.vx *= 0.985;

    const alpha = Math.max(0, p.life / p.maxLife);

    els.ctx.beginPath();
    els.ctx.fillStyle = p.color;
    els.ctx.globalAlpha = alpha;
    els.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    els.ctx.fill();
  }

  els.ctx.globalAlpha = 1;
  els.ctx.globalCompositeOperation = "source-over";
}

function updateHUD() {
  els.coinsText.textContent = formatNumber(displayedCoins);
  els.clickPowerText.textContent = formatNumber(getClickPower());
  els.cpsText.textContent = formatNumber(getCps());
  els.critText.textContent = `${Math.round(getCritChance() * 100)}%`;
  els.totalClicksText.textContent = formatNumber(state.clicks);
  els.totalCoinsText.textContent = formatNumber(state.totalCoins);
  els.imbaLevelText.textContent = formatNumber(getImbaLevel());
}

function updateBuffsUI() {
  clearExpiredBuffs();

  const active = BUFFS.filter((buff) => isBuffActive(buff.id));

  if (active.length) {
    els.activeBuffs.innerHTML = active
      .map((buff) => {
        const rem = getBuffRemaining(buff.id);
        const pct = Math.max(0, Math.min(100, (rem / buff.duration) * 100));

        return `
          <div class="buff-chip" title="${buff.name}">
            <span>${buff.icon}</span>
            <div class="buff-chip-progress">
              <span style="width:${pct}%"></span>
            </div>
            <small>${rem.toFixed(1)}s</small>
          </div>
        `;
      })
      .join("");
  } else {
    els.activeBuffs.innerHTML = `<div class="buff-empty">Баффы не активны</div>`;
  }

  if (activeTab === "buffs") {
    for (const buff of BUFFS) {
      const card = els.shopContent.querySelector(`[data-buff-card="${buff.id}"]`);
      if (!card) continue;

      const activeBuff = isBuffActive(buff.id);
      card.classList.toggle("active", activeBuff);

      const timeEl = card.querySelector(".buff-time");
      const barEl = card.querySelector(".buff-progress span");

      if (activeBuff && buff.duration) {
        const rem = getBuffRemaining(buff.id);
        timeEl.textContent = `${rem.toFixed(1)} сек`;
        barEl.style.width = `${Math.max(0, Math.min(100, (rem / buff.duration) * 100))}%`;
      } else if (buff.type === "instant") {
        timeEl.textContent = "Мгновенный эффект";
        barEl.style.width = "0%";
      } else {
        timeEl.textContent = "Не активен";
        barEl.style.width = "0%";
      }
    }
  }

  updateShopAffordability();
}

function upgradeCardHTML(item) {
  const level = getLevel(item.id);
  const maxed = isUpgradeMaxed(item.id);
  const cost = getUpgradeCost(item.id);

  const buttonLabel = maxed ? "MAX" : `Купить<br>${formatNumber(cost)}`;

  return `
    <article class="shop-card" data-upgrade-card="${item.id}">
      <div class="shop-icon">${item.icon}</div>

      <div>
        <h3 class="shop-title">${item.name}</h3>
        <p class="shop-desc">${item.desc}</p>

        <div class="shop-meta">
          <span class="badge">Уровень: ${level}${item.max ? `/${item.max}` : ""}</span>
        </div>
      </div>

      <button
        class="buy-button"
        data-buy-upgrade="${item.id}"
        ${maxed ? "disabled" : ""}
      >
        ${buttonLabel}
      </button>
    </article>
  `;
}

function buffCardHTML(item) {
  const cost = getBuffCost(item.id);
  const active = isBuffActive(item.id);
  const rem = getBuffRemaining(item.id);

  const pct =
    active && item.duration
      ? Math.max(0, Math.min(100, (rem / item.duration) * 100))
      : 0;

  const time = active
    ? `${rem.toFixed(1)} сек`
    : item.type === "instant"
      ? "Мгновенный эффект"
      : "Не активен";

  return `
    <article class="shop-card buff-card ${active ? "active" : ""}" data-buff-card="${item.id}">
      <div class="shop-icon">${item.icon}</div>

      <div>
        <h3 class="shop-title">${item.name}</h3>
        <p class="shop-desc">${item.desc}</p>

        <div class="shop-meta">
          <span class="badge">Покупок: ${state.buffBuys[item.id] || 0}</span>
        </div>
      </div>

      <button class="buy-button" data-buy-buff="${item.id}">
        Купить<br>${formatNumber(cost)}
      </button>

      <div class="buff-progress">
        <span style="width:${pct}%"></span>
      </div>

      <div class="buff-time">${time}</div>
    </article>
  `;
}

function settingsHTML() {
  return `
    <article class="shop-card settings-card">
      <h3>Сохранение</h3>
      <p>
        Игра автоматически сохраняется в localStorage каждые 10 секунд,
        а также при закрытии окна.
      </p>
      <button class="danger-button" id="resetButton" type="button">
        Сбросить прогресс
      </button>
    </article>

    <article class="shop-card settings-card">
      <h3>Горячие клавиши</h3>
      <p>
        Пробел — клик.<br />
        Быстрые клики заполняют комбо. Комбо работает, если куплен «Комбо-двигатель».
      </p>
    </article>
  `;
}

function renderShop() {
  if (activeTab === "upgrades") {
    els.shopContent.innerHTML = UPGRADES.map(upgradeCardHTML).join("");
  } else if (activeTab === "buffs") {
    els.shopContent.innerHTML = BUFFS.map(buffCardHTML).join("");
  } else {
    els.shopContent.innerHTML = settingsHTML();
  }

  updateShopAffordability();
}

function updateShopAffordability() {
  if (activeTab === "upgrades") {
    els.shopContent.querySelectorAll("[data-upgrade-card]").forEach((card) => {
      const id = card.dataset.upgradeCard;
      const button = card.querySelector("[data-buy-upgrade]");
      const cost = getUpgradeCost(id);
      const maxed = isUpgradeMaxed(id);

      button.disabled = maxed || state.coins < cost;
    });
  }

  if (activeTab === "buffs") {
    els.shopContent.querySelectorAll("[data-buff-card]").forEach((card) => {
      const id = card.dataset.buffCard;
      const button = card.querySelector("[data-buy-buff]");
      const cost = getBuffCost(id);

      button.disabled = state.coins < cost;
    });
  }
}

function bindShopEvents() {
  els.shopContent.addEventListener("click", (event) => {
    const upgradeButton = event.target.closest("[data-buy-upgrade]");

    if (upgradeButton) {
      buyUpgrade(upgradeButton.dataset.buyUpgrade);
      return;
    }

    const buffButton = event.target.closest("[data-buy-buff]");

    if (buffButton) {
      buyBuff(buffButton.dataset.buyBuff);
      return;
    }

    if (event.target.id === "resetButton") {
      const confirmed = confirm("Точно сбросить весь прогресс?");

      if (confirmed) {
        localStorage.removeItem(SAVE_KEY);
        state = defaultState();
        displayedCoins = 0;

        renderShop();
        updateHUD();
        saveState();
        showToast("Прогресс сброшен");
      }
    }
  });
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;

      document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });

      renderShop();
    });
  });
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}

function applyOfflineEarnings() {
  if (!state.settings.offlineEarnings) return;

  const now = Date.now();
  const elapsed = (now - (state.lastSaved || now)) / 1000;

  if (elapsed < 10) return;

  const cps = getCps();
  if (cps <= 0) return;

  const capped = Math.min(elapsed, 7200);
  const amount = cps * capped * 0.5;

  if (amount > 0) {
    addCoins(amount);
    showToast(`С возвращением! Оффлайн доход: +${formatNumber(amount)}`);
  }
}

function gameLoop(timestamp) {
  const dt = Math.min(0.1, (timestamp - lastFrame) / 1000);
  lastFrame = timestamp;

  const cps = getCps();
  if (cps > 0) {
    addCoins(cps * dt);
  }

  const target = state.coins;
  const diff = target - displayedCoins;

  if (Math.abs(diff) > 0.01) {
    displayedCoins += diff * Math.min(1, dt * 14);
  } else {
    displayedCoins = target;
  }

  updateHUD();
  drawParticles(dt);

  if (timestamp - lastBuffUi > 250) {
    lastBuffUi = timestamp;
    updateBuffsUI();
  }

  if (timestamp - lastAutoSave > 10000) {
    lastAutoSave = timestamp;
    saveState();
  }

  requestAnimationFrame(gameLoop);
}

function cacheDom() {
  els.coinsText = document.getElementById("coinsText");
  els.clickPowerText = document.getElementById("clickPowerText");
  els.cpsText = document.getElementById("cpsText");
  els.critText = document.getElementById("critText");
  els.totalClicksText = document.getElementById("totalClicksText");
  els.totalCoinsText = document.getElementById("totalCoinsText");
  els.imbaLevelText = document.getElementById("imbaLevelText");

  els.clickButton = document.getElementById("clickButton");
  els.activeBuffs = document.getElementById("activeBuffs");
  els.shopContent = document.getElementById("shopContent");
  els.floatingLayer = document.getElementById("floatingLayer");
  els.toast = document.getElementById("toast");

  els.canvas = document.getElementById("fxCanvas");
  els.ctx = els.canvas.getContext("2d");
}

function bindEvents() {
  els.clickButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    doClick(event.clientX, event.clientY);
  });

  window.addEventListener("keydown", (event) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";

    if (event.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA") {
      event.preventDefault();

      const rect = els.clickButton.getBoundingClientRect();
      doClick(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", saveState);

  bindTabs();
  bindShopEvents();
}

function init() {
  cacheDom();
  loadState();
  clearExpiredBuffs();
  applyOfflineEarnings();

  resizeCanvas();
  bindEvents();

  renderShop();
  updateBuffsUI();

  displayedCoins = state.coins;
  updateHUD();

  requestAnimationFrame(gameLoop);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/**
 * cards.js — Système de cartes de commandement
 * Dépend de window.GameAPI exposé par game.html
 */

// ========================================
// DONNÉES
// ========================================

let CARD_DEFINITIONS = {};

// Icônes de fallback si l'illustration est manquante
const CARD_FALLBACK_ICONS = {
  area_damage:   "💣",
  spawn_unit:    "🪖",
  free_move:     "🏃",
  reduce_cost:   "⭐",
  shield:        "🛡️",
  double_attack: "⚔️",
};

// État du ciblage en cours
let cardTargetingState = null;
// { cardId, cardDef, mapCardData, step, selectedHex }

// ========================================
// INITIALISATION
// ========================================

async function initCards() {
  try {
    const response = await fetch("cards.json");
    CARD_DEFINITIONS = await response.json();
  } catch (e) {
    console.error("[Cards] Impossible de charger cards.json", e);
    return;
  }

  // Initialiser l'état des cartes dans gameState depuis map.json
  const state = window.GameAPI.getState();
  const mapCards = window.GameAPI.getMapCards();

  if (mapCards) {
    for (const side of ["allies", "axis"]) {
      state.cards[side] = (mapCards[side] || []).map((c, i) => ({
        id: c.id,
        uid: `${c.id}_${i}`,   // ← identifiant unique même si id dupliqué
        illustration: c.illustration || null,
        reusable: c.reusable !== undefined ? c.reusable : false,
        cooldown: c.cooldown || 0,
        used: false,
        turnsUntilAvailable: 0,
      }));
    }
  }
  _buildUI();
  _refreshBar();
}

// ========================================
// UI — CONSTRUCTION
// ========================================

function _buildUI() {
  // Barre du bas
  if (!document.getElementById("cards-bar")) {
    const bar = document.createElement("div");
    bar.id = "cards-bar";
    bar.innerHTML = `
      <button id="cards-bar-toggle" title="Cartes de commandement">
        🃏 Cartes
        <span class="cards-count" id="cards-bar-count">0</span>
      </button>
    `;
    document.body.appendChild(bar);
    document.getElementById("cards-bar-toggle").onclick = _openOverlay;
  }

  // Overlay
  if (!document.getElementById("cards-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "cards-overlay";
    overlay.innerHTML = `
      <div id="cards-panel">
        <button id="cards-close">✕</button>
        <h2>🃏 Cartes de commandement</h2>
        <div class="cards-subtitle" id="cards-subtitle"></div>
        <div id="cards-grid"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("cards-close").onclick = _closeOverlay;
    // Clic en dehors du panel pour fermer
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _closeOverlay();
    });
  }

  // Bannière de ciblage
  if (!document.getElementById("card-targeting-banner")) {
    const banner = document.createElement("div");
    banner.id = "card-targeting-banner";
    document.body.appendChild(banner);
  }
}

function _openOverlay() {
  _renderCards();
  document.getElementById("cards-overlay").classList.add("visible");
}

function _closeOverlay() {
  document.getElementById("cards-overlay").classList.remove("visible");
}

function _renderCards() {
  const state = window.GameAPI.getState();
  const side = state.currentPlayer;
  const cards = state.cards[side] || [];
  const cooldown = state.cardCooldown[side];
  const playedThisTurn = state.cardPlayedThisTurn[side];
  const currentPA = state.currentActions[side];

  const grid = document.getElementById("cards-grid");
  const subtitle = document.getElementById("cards-subtitle");
  grid.innerHTML = "";

  // Sous-titre
  if (cooldown > 0) {
    subtitle.innerHTML = `<span class="cd-warning">⏳ Cartes bloquées — ${cooldown} tour(s) restant(s)</span>`;
  } else if (playedThisTurn) {
    subtitle.innerHTML = `<span class="cd-warning">✋ Une carte déjà jouée ce tour</span>`;
  } else {
    subtitle.innerHTML = `PA disponibles : <strong>${currentPA}</strong>`;
  }

  if (cards.length === 0) {
    grid.innerHTML = `<p style="color:#8b7355;text-align:center;font-family:'Courier Prime',monospace">Aucune carte disponible pour ce scénario.</p>`;
    return;
  }

  for (const cardData of cards) {
    const def = CARD_DEFINITIONS[cardData.id];
    if (!def) continue;

    const isUsed = cardData.used && !cardData.reusable;
    const isOnCooldown = cooldown > 0;
    const alreadyPlayedTurn = playedThisTurn;
    const notEnoughPA = currentPA < def.cost;
    const isDisabled = isUsed || isOnCooldown || alreadyPlayedTurn || notEnoughPA;

    const card = document.createElement("div");
    card.className = `card-item${isUsed ? " card-used" : isDisabled ? " card-disabled" : ""}`;
    card.dataset.cardId = cardData.uid;

    // Illustration
    const illus = document.createElement("div");
    illus.className = "card-illustration";
    const illusFile = cardData.illustration || cardData.id;
    const img = document.createElement("img");
    img.src = `units/cards/${illusFile}.png`;
    img.alt = def.name;
    img.onerror = () => {
      illus.innerHTML = `<span class="card-fallback-icon">${CARD_FALLBACK_ICONS[def.effect] || "🃏"}</span>`;
    };
    illus.appendChild(img);
    card.appendChild(illus);

    // Corps
    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="card-name">${def.name}</div>
      <div class="card-description">${def.description}</div>
      <div class="card-footer">
        <span class="card-cost">${def.cost} PA</span>
        ${cardData.cooldown > 0 ? `<span class="card-cooldown-badge">🕐${cardData.cooldown}</span>` : ''}
        <span class="card-type-badge">${cardData.reusable ? "♻" : "✦"}</span>
      </div>
    `;
    card.appendChild(body);

    // Overlay cooldown
    if (isOnCooldown && !isUsed) {
      const cdOverlay = document.createElement("div");
      cdOverlay.className = "card-cooldown-overlay";
      cdOverlay.innerHTML = `
        <span class="cd-icon">⏳</span>
        <span class="cd-text">${cooldown} tour${cooldown > 1 ? "s" : ""}</span>
      `;
      card.appendChild(cdOverlay);
    }

    if (!isDisabled) {
      card.addEventListener("click", () => _onCardClick(cardData.uid));
    } else if (!isUsed) {
      // Tooltip raison
      if (notEnoughPA) card.title = `Pas assez de PA (coût : ${def.cost})`;
      else if (isOnCooldown) card.title = `Bloqué — ${cooldown} tour(s) restant(s)`;
      else if (alreadyPlayedTurn) card.title = "Une carte a déjà été jouée ce tour";
    }

    grid.appendChild(card);
  }
}

function _refreshBar(forceSide = null) {
  const state = window.GameAPI.getState();
  const side = forceSide || state.currentPlayer;
  const cards = state.cards[side] || [];
  const cooldown = state.cardCooldown[side];
  const playedTurn = state.cardPlayedThisTurn[side];

  const countEl = document.getElementById("cards-bar-count");
  const toggle = document.getElementById("cards-bar-toggle");
  if (!countEl || !toggle) return;

  // Compter les cartes jouables
  const playable = cards.filter(c => {
    if (c.used && !c.reusable) return false;
    const def = CARD_DEFINITIONS[c.id];
    if (!def) return false;
    return cooldown === 0 && !playedTurn && state.currentActions[side] >= def.cost;
  }).length;

  countEl.textContent = playable;
  countEl.style.background = playable > 0 ? "#8b3a3a" : "#444";

  // Indicateur cooldown
  const existingCd = toggle.querySelector(".cooldown-indicator");
  if (existingCd) existingCd.remove();
  if (cooldown > 0) {
    const cdSpan = document.createElement("span");
    cdSpan.className = "cooldown-indicator";
    cdSpan.textContent = `⏳${cooldown}`;
    toggle.appendChild(cdSpan);
  }
}

// ========================================
// JOUER UNE CARTE
// ========================================

function _onCardClick(cardId) {
  const state = window.GameAPI.getState();
  const side = state.currentPlayer;
  const mapCardData = state.cards[side].find(c => c.uid === cardId);
  
  if (!mapCardData) return;
  const def = CARD_DEFINITIONS[mapCardData.id];
  if (!def) return;

  // Vérifications
  if (state.cardPlayedThisTurn[side]) {
    window.GameAPI.log("Une carte a déjà été jouée ce tour !");
    return;
  }
  if (state.cardCooldown[side] > 0) {
    window.GameAPI.log(`Cartes bloquées — ${state.cardCooldown[side]} tour(s) restant(s)`);
    return;
  }
  if (state.currentActions[side] < def.cost) {
    window.GameAPI.log(`Pas assez de PA pour jouer ${def.name} (coût : ${def.cost})`);
    return;
  }

  // Validation pré-effet (pour effets immédiats)
  if (def.effect === "spawn_unit") {
    if (!_canSpawnUnit(def.params)) {
      window.GameAPI.log("Impossible de placer les renforts : bord de carte plein !");
      _closeOverlay();
      return;
    }
  }
  // Pour les effets avec ciblage, la validation se fait dans handleHexClick

  // Fermer l'overlay
  _closeOverlay();

  // Déduire le coût
  state.currentActions[side] -= def.cost;

  // Marquer comme jouée ce tour
  state.cardPlayedThisTurn[side] = true;

  // Mettre à jour la carte (usage unique)
  if (!mapCardData.reusable) {
    mapCardData.used = true;
  }

  // Appliquer le cooldown global
  if (mapCardData.cooldown > 0) {
    state.cardCooldown[side] = mapCardData.cooldown;
  }

  console.log(`[Cards] ${side} joue "${def.name}" (coût: ${def.cost} PA, cooldown: ${mapCardData.cooldown})`);
  window.GameAPI.log(`🃏 ${def.name} jouée !`);

  // Déclencher l'effet
  _executeEffect(cardId, def, mapCardData);

  _refreshBar();
  window.GameAPI.refresh();
  window.GameAPI.updatePanel();
}

// ========================================
// EFFETS
// ========================================

function _executeEffect(cardId, def, mapCardData) {
  const state = window.GameAPI.getState();
  const side = state.currentPlayer;

  switch (def.effect) {
    case "area_damage":
      _startTargeting(cardId, def, mapCardData, "Choisissez une case cible pour le " + def.name);
      break;

    case "spawn_unit":
      _executeSpawnUnit(def.params);
      break;

    case "free_move":
      _startTargeting(cardId, def, mapCardData, "Choisissez une unité alliée à déplacer gratuitement");
      break;

    case "reduce_cost":
      _executeReduceCost(def.params);
      break;

    case "shield":
      _startTargeting(cardId, def, mapCardData, "Choisissez une unité alliée à protéger");
      break;

    case "double_attack":
      _startTargeting(cardId, def, mapCardData, "Choisissez une unité alliée pour une frappe éclair");
      break;

    default:
      console.warn("[Cards] Effet inconnu :", def.effect);
  }
}

// --- Mode ciblage ---

function _startTargeting(cardId, def, mapCardData, message) {
  const state = window.GameAPI.getState();
  state.actionMode = "card-targeting";
  state.availableActions = [];

  cardTargetingState = {
    cardId,
    def,
    mapCardData,
    step: "select-target",
    selectedHex: null,
  };

  // Surligner les cibles valides
  _highlightTargets();

  // Vérifier s'il y a des cibles
  if (state.availableActions.length === 0) {
    window.GameAPI.log(`Aucune cible disponible pour ${def.name} !`);
    cancelCardTargeting();
    return;
  }

  // Bannière
  const banner = document.getElementById("card-targeting-banner");
  banner.textContent = `🃏 ${message} — Clic droit ou Échap pour annuler`;
  banner.classList.add("visible");

  window.GameAPI.refresh();
  document.addEventListener("keydown", _onEscCancel, { once: true });
}

function _highlightTargets() {
  const state = window.GameAPI.getState();
  const side = state.currentPlayer;
  const def = cardTargetingState.def;

  // On passe les cibles via availableActions (même système que le jeu)
  const targets = [];

  switch (def.effect) {
    case "area_damage":
      // Toutes les cases avec au moins une unité ennemie à portée max + rayon
      for (let y = 0; y < window.GameAPI.CONFIG.HEIGHT; y++) {
        for (let x = 0; x < window.GameAPI.CONFIG.WIDTH; x++) {
          targets.push({ x, y, type: "card-target" });
        }
      }
      break;

    case "free_move":
    case "double_attack":
    case "shield":
      // Cases avec unité alliée non épuisée
      for (let y = 0; y < window.GameAPI.CONFIG.HEIGHT; y++) {
        for (let x = 0; x < window.GameAPI.CONFIG.WIDTH; x++) {
          const cell = state.map[y][x];
          if (cell.unit && cell.unit.side === side) {
            targets.push({ x, y, type: "card-target" });
          }
        }
      }
      break;
  }

  state.availableActions = targets;
}

function _onEscCancel(e) {
  if (e.key === "Escape") cancelCardTargeting();
}

function cancelCardTargeting() {
  const state = window.GameAPI.getState();

  if (cardTargetingState) {
    // Rembourser le coût et annuler les effets de jeu
    const side = state.currentPlayer;
    const def = cardTargetingState.def;
    state.currentActions[side] += def.cost;
    state.cardPlayedThisTurn[side] = false;

    // Annuler cooldown si appliqué
    const mapCardData = cardTargetingState.mapCardData;
    if (mapCardData.cooldown > 0) {
      state.cardCooldown[side] = 0;
    }
    // Annuler usage unique
    if (!mapCardData.reusable) {
      mapCardData.used = false;
    }

    cardTargetingState = null;
  }

  state.actionMode = null;
  state.availableActions = [];

  const banner = document.getElementById("card-targeting-banner");
  if (banner) banner.classList.remove("visible");

  _refreshBar();
  window.GameAPI.refresh();
  window.GameAPI.updatePanel();
  window.GameAPI.log("Carte annulée.");
}

// --- Gestionnaire de clic sur hex (appelé depuis game.html) ---

function handleHexClick(x, y) {
  if (!cardTargetingState) return;

  const def = cardTargetingState.def;
  const state = window.GameAPI.getState();

  // Vérifier que c'est une cible valide
  const isValid = state.availableActions.some(a => a.x === x && a.y === y);
  if (!isValid) return;

  const banner = document.getElementById("card-targeting-banner");
  if (banner) banner.classList.remove("visible");
  document.removeEventListener("keydown", _onEscCancel);

  state.actionMode = null;
  state.availableActions = [];

  switch (def.effect) {
    case "area_damage":
      _applyAreaDamage(x, y, def.params);
      break;
    case "free_move":
      _applyFreeMove(x, y);
      break;
    case "shield":
      _applyShield(x, y, def.params);
      break;
    case "double_attack":
      _applyDoubleAttack(x, y);
      break;
  }

  cardTargetingState = null;
  _refreshBar();
  window.GameAPI.refresh();
  window.GameAPI.updatePanel();
}

// ========================================
// EFFETS — IMPLÉMENTATIONS
// ========================================

// --- area_damage ---
function _applyAreaDamage(centerX, centerY, params) {
  const state = window.GameAPI.getState();
  const side = state.currentPlayer;
  const enemySide = side === "allies" ? "axis" : "allies";
  const radius = params.radius;
  const minDmg = params.minDamage;
  const maxDmg = params.maxDamage;

  let hits = [];

  for (let y = 0; y < window.GameAPI.CONFIG.HEIGHT; y++) {
    for (let x = 0; x < window.GameAPI.CONFIG.WIDTH; x++) {
      const dist = window.GameAPI.getDistance(centerX, centerY, x, y);
      if (dist > radius) continue;

      const cell = state.map[y][x];
      if (!cell.unit) continue;

      const isEnemy = cell.unit.side === enemySide;
      const isFriendly = cell.unit.side === side;

      if (isEnemy && params.targetsEnemy) {
        hits.push({ x, y, unit: cell.unit });
      } else if (isFriendly && params.targetsFriendly) {
        hits.push({ x, y, unit: cell.unit });
      }
    }
  }

  if (hits.length === 0) {
    window.GameAPI.log("Aucune cible dans la zone !");
    return;
  }

  let messages = [];
  for (const hit of hits) {
    let damage;
    if (params.damageProbs && params.damageProbs.length > 0) {
      const roll = Math.random() * 100;
      let cumulative = 0;
      for (let i = 0; i < params.damageProbs.length; i++) {
        cumulative += params.damageProbs[i];
        if (roll < cumulative) {
          damage = minDmg + i;
          break;
        }
      }
      if (damage === undefined) damage = maxDmg;
    } else {
      damage = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
    }
    hit.damage = damage; // ← stocker pour l'animation
    hit.unit.currentHp -= damage;
    messages.push(`${hit.unit.name} : -${damage} HP`);

    if (hit.unit.currentHp <= 0) {
      const killerSide = hit.unit.side === enemySide ? side : null;
      window.GameAPI.destroyUnit(hit.unit, killerSide);
      state.map[hit.y][hit.x].unit = null;
      messages.push(`${hit.unit.name} détruite !`);
    }
  }

  if (window.AnimSystem) {
    // hits contient déjà les dégâts calculés juste avant
    const animHits = hits.map(h => ({ x: h.x, y: h.y, damage: h.damage }));
    AnimSystem.playAreaDamageAnimation(centerX, centerY, params.radius, animHits, null);
  }

  window.GameAPI.log(`💣 Barrage : ${messages.join(" | ")}`);
  window.GameAPI.updateScore();
}

// --- spawn_unit : validation ---
function _canSpawnUnit(params) {
  const state = window.GameAPI.getState();
  const spawnSide = params.side || state.currentPlayer;
  const unitType = params.unitType || "infantry";
  const edge = params.spawnEdge || (spawnSide === "allies" ? "bottom" : "top");

  const H = window.GameAPI.CONFIG.HEIGHT;
  const W = window.GameAPI.CONFIG.WIDTH;
  const rowY = edge === "bottom" ? H - 1 : 0;

  for (let x = 0; x < W; x++) {
    const cell = state.map[rowY][x];
    if (!cell.unit) {
      const unitTemplate = window.GameAPI.UNIT_TYPES[unitType];
      if (unitTemplate) {
        const terrainKey = window.GameAPI.getTerrainType(cell.terrain);
        const cannotCross = unitTemplate.cannotCross || [];
        if (!cannotCross.includes(terrainKey)) {
          return true; // Au moins une case valide
        }
      }
    }
  }
  return false; // Aucune case disponible
}

// --- spawn_unit ---
function _executeSpawnUnit(params) {
  const state = window.GameAPI.getState();
  const spawnSide = params.side || state.currentPlayer;
  const unitType = params.unitType || "infantry";
  const cssClass = params.cssClass || null;
  const blason = params.blason || null;
  const edge = params.spawnEdge || (spawnSide === "allies" ? "bottom" : "top");

  const H = window.GameAPI.CONFIG.HEIGHT;
  const W = window.GameAPI.CONFIG.WIDTH;

  // Cases candidates sur le bord
  const candidates = [];
  const rowY = edge === "bottom" ? H - 1 : 0;

  for (let x = 0; x < W; x++) {
    const cell = state.map[rowY][x];
    if (!cell.unit) {
      // Vérifier que l'unité peut traverser ce terrain
      const unitTemplate = window.GameAPI.UNIT_TYPES[unitType];
      if (unitTemplate) {
        const terrainKey = window.GameAPI.getTerrainType(cell.terrain);
        const cannotCross = unitTemplate.cannotCross || [];
        if (!cannotCross.includes(terrainKey)) {
          candidates.push(x);
        }
      } else {
        candidates.push(x);
      }
    }
  }

  if (candidates.length === 0) {
    window.GameAPI.log("Impossible de placer les renforts : bord de carte plein !");
    return;
  }

  // Choisir une case au hasard
  const spawnX = candidates[Math.floor(Math.random() * candidates.length)];
  window.GameAPI.placeUnit(spawnX, rowY, unitType, spawnSide, cssClass, blason);

  // Mettre à jour les compteurs
  const gs = window.GameAPI.getState();
  gs.unitCount[spawnSide]++;
  gs.unitCountMax[spawnSide]++;
  window.GameAPI.updateScore();

  if (window.AnimSystem) {
    setTimeout(() => AnimSystem.playSpawnAnimation(spawnX, rowY), 100);
  }
  window.GameAPI.log(`🪖 Renforts ! Une unité ${unitType} apparaît en (${spawnX}, ${rowY})`);
}

// --- free_move ---
function _applyFreeMove(x, y) {
  const state = window.GameAPI.getState();
  const cell = state.map[y][x];
  if (!cell.unit) return;

  // Donner un jeton de mouvement gratuit
  cell.unit.freeMoveToken = true;
  cell.unit.hasMoved = false;

  state.selectedHex = { x, y };
  window.GameAPI.log(`🏃 ${cell.unit.name} peut se déplacer gratuitement ce tour !`);
}

// --- reduce_cost ---
function _executeReduceCost(params) {
  const state = window.GameAPI.getState();
  const reduction = params.reduction || 1;
  // Stocker le bonus dans gameState pour que consumeActionPoints le prenne en compte
  state.cardCostReduction = (state.cardCostReduction || 0) + reduction;
  if (window.AnimSystem) {
    const side = state.currentPlayer;
    state.map.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.unit && cell.unit.side === side) {
        AnimSystem.playReduceCostAnimation(x, y);
      }
    }));
  }
  window.GameAPI.log(`⭐ Commandement renforcé ! Coût des unités réduit de ${reduction} PA ce tour.`);
}

// --- shield ---
function _applyShield(x, y, params) {
  const state = window.GameAPI.getState();
  const cell = state.map[y][x];
  if (!cell.unit) return;

  cell.unit.shieldBonus = (cell.unit.shieldBonus || 0) + (params.bonus || 2);
  cell.unit.shieldTurns = params.duration || 1;
  window.GameAPI.log(`🛡️ ${cell.unit.name} est protégée (+${params.bonus} défense pour ${params.duration} tour(s)) !`);
}

// --- double_attack ---
function _applyDoubleAttack(x, y) {
  const state = window.GameAPI.getState();
  const cell = state.map[y][x];
  if (!cell.unit) return;

  // Permettre seulement une attaque supplémentaire, pas de mouvement
  cell.unit.hasAttacked = false;
  cell.unit.hasMoved = true; // Bloquer le mouvement
  cell.unit.canDoubleAttack = true;
  window.GameAPI.log(`⚔️ ${cell.unit.name} peut attaquer une seconde fois !`);
}

// ========================================
// FIN DE TOUR
// ========================================

function onTurnEnd(endingSide) {
  const state = window.GameAPI.getState();

  // Réinitialiser "jouée ce tour" pour le camp qui vient de jouer
  state.cardPlayedThisTurn[endingSide] = false;

  // Décrémenter le cooldown global du camp qui vient de jouer
  if (state.cardCooldown[endingSide] > 0) {
    state.cardCooldown[endingSide]--;
  }

  // Réinitialiser réduction de coût de carte
  state.cardCostReduction = 0;

  // Décrémenter les boucliers des unités
  for (let y = 0; y < window.GameAPI.CONFIG.HEIGHT; y++) {
    for (let x = 0; x < window.GameAPI.CONFIG.WIDTH; x++) {
      const unit = state.map[y][x].unit;
      if (unit && unit.shieldTurns > 0) {
        unit.shieldTurns--;
        if (unit.shieldTurns <= 0) {
          unit.shieldBonus = 0;
        }
      }
      if (unit) {
        unit.canDoubleAttack = false;
        unit.freeMoveToken = false; // Nettoyer les jetons de mouvement gratuit
      }
      
    }
  }

  // Rafraîchir la barre pour le NOUVEAU joueur actif (qui vient de changer dans game.html)
  const newSide = window.GameAPI.getState().currentPlayer;
  _refreshBar(newSide);
}

// ========================================
// API PUBLIQUE
// ========================================

window.CardsAPI = {
  init:               initCards,
  onTurnEnd:          onTurnEnd,
  handleHexClick:     handleHexClick,
  cancelTargeting:    cancelCardTargeting,
  refreshBar:         _refreshBar,
};

/**
 * objectives.js — Système de conditions de victoire
 * Dépend de window.GameAPI
 */

window.ObjectivesSystem = (function () {

  let _objectives = [];      // Liste des objectifs de la carte
  let _victoryThresholds = { allies: 7, axis: 7 }; // Médailles pour gagner
  let _controlTrackers = {}; // { obj_id: { side, consecutiveTurns } }
  let _surviveTurn = 0;      // Tour actuel global
  let _gameOver = false;
  let _battleContinued = false; // true si le joueur a cliqué "Continuer la bataille"
  let _campaignPlayerSide = null;

  // ─── Initialisation ────────────────────────────────────────────────────────

  function init(mapMeta) {
    _gameOver = false;
    _objectives = [];
    _controlTrackers = {};
    _surviveTurn = 0;

    if (!mapMeta || !mapMeta.victory) return;

    const v = mapMeta.victory;

    // Seuils de victoire
    if (v.medals) {
      _victoryThresholds.allies = v.medals.allies ?? 7;
      _victoryThresholds.axis   = v.medals.axis   ?? 7;
    }

    // Objectifs
    _objectives = (v.objectives || []).map(obj => ({
      ...obj,
      completed: false,
      completedBy: null,
    }));

    // Init trackers de contrôle de tuile
    _objectives.forEach(obj => {
      if (obj.type === 'control_tile') {
        _controlTrackers[obj.id] = { side: null, consecutiveTurns: 0 };
      }
    });

    // Récupérer le playerSide de la campagne
    if (window.CampaignSystem) {
      const { campaignId } = CampaignSystem.readUrlParams();
      if (campaignId) {
        CampaignSystem.loadCampaign(`campaigns/${campaignId}.json`)
          .then(c => { _campaignPlayerSide = c.playerSide || null; });
      }
    }

    renderObjectivesPanel();
    _renderObjectiveBadges();
    console.log('[Objectives] Initialisé :', _objectives.length, 'objectifs');
  }

  // ─── Vérifications ─────────────────────────────────────────────────────────

  /** Appelé après chaque destruction d'unité */
  function onUnitKilled(unit, killerSide) {
    if (_gameOver) return;
    _objectives.forEach(obj => {
      if (obj.completed || obj.type !== 'kill_unit') return;

      const matchClass = obj.targetCssClass && unit.cssClass === obj.targetCssClass;
      const matchType  = obj.targetType     && unit.type    === obj.targetType;

      if (matchClass || matchType) {
        // Vérifier que c'est bien le bon camp qui tue
        if (obj.side && killerSide !== obj.side) return;

        _completeObjective(obj, killerSide || obj.side);
      }
    });
  }

  /** Appelé en fin de chaque tour (après changement de joueur) */
  function onTurnEnd(turnNumber, endingSide) {
    if (_gameOver) return;
    _surviveTurn = turnNumber;

    const state = window.GameAPI.getState();

    _objectives.forEach(obj => {
      if (obj.completed) return;

      // --- control_tile ---
      if (obj.type === 'control_tile') {
        const tracker = _controlTrackers[obj.id];
        const cell    = state.map[obj.y][obj.x];
        const unit    = cell ? cell.unit : null;
        const holder  = unit ? unit.side : null;

        if (holder === obj.side) {
          // Bonne faction sur la tuile
          if (tracker.side === holder) {
            tracker.consecutiveTurns++;
          } else {
            tracker.side = holder;
            tracker.consecutiveTurns = 1;
          }

          if (tracker.consecutiveTurns >= obj.turns) {
            _completeObjective(obj, holder);
          }
        } else {
          // Tuile perdue ou vide → reset
          tracker.consecutiveTurns = 0;
          tracker.side = holder;
        }
      }

      // --- evacuation ---
      if (obj.type === 'evacuation') {
        const cell = state.map[obj.y][obj.x];
        const unit = cell ? cell.unit : null;

        if (unit && unit.side === obj.side) {
          _completeObjective(obj, obj.side);
          // Supprimer l'unité (évacuée)
          cell.unit = null;
          gameState.unitCount[unit.side] = Math.max(0, gameState.unitCount[unit.side] - 1);
          window.GameAPI.log(`${unit.cssClass} a été évacuée !`);
          if (window.AnimSystem) AnimSystem.playSpawnAnimation(obj.x, obj.y);
          refreshDisplay();
        }
      }

      // --- survive_turns ---
      if (obj.type === 'survive_turns') {
        if (turnNumber >= obj.turns) {
          _completeObjective(obj, obj.side);
        }
      }
    });

    renderObjectivesPanel();
    _checkVictory();
  }

  /** Appelé après chaque action qui peut changer le score */
  function checkMedalVictory() {
    if (_gameOver) return;
    _checkVictory();
  }

  // ─── Complétion d'objectif ─────────────────────────────────────────────────

  function _completeObjective(obj, side) {
    obj.completed  = true;
    obj.completedBy = side;

    // Donner les médailles
    const state = window.GameAPI.getState();
    state.medals[side] = (state.medals[side] || 0) + obj.reward;
    window.GameAPI.updateScore();

    const sideLabel = side === 'allies' ? '🔵 Alliés' : '🔴 Axe';
    window.GameAPI.log(`🎯 Objectif accompli : "${obj.label}" ! +${obj.reward} médaille(s) pour ${sideLabel}`);

    renderObjectivesPanel();
    _checkVictory();
    _renderObjectiveBadges();
    console.log(`[Objectives] "${obj.label}" complété par ${side} → +${obj.reward} médailles`);
  }

  // ─── Vérification victoire ─────────────────────────────────────────────────

  function _checkVictory() {
    if (_gameOver) return;
    const state = window.GameAPI.getState();

    for (const side of ['allies', 'axis']) {
      if ((state.medals[side] || 0) >= _victoryThresholds[side]) {
        _triggerVictory(side, state);
        return;
      }
    }
  }

  function _triggerVictory(winningSide, state) {
    _gameOver = true;
    _battleContinued = false;
    // Sauvegarder dans localStorage si on est en mode campagne
    if (window.CampaignSystem) {
      const { campaignId, battleId } = CampaignSystem.readUrlParams();
      if (campaignId && battleId) {
        const completedIds = _objectives.filter(o => o.completed).map(o => o.id);
        const loserSide = winningSide === 'allies' ? 'axis' : 'allies';
        CampaignSystem.loadCampaign(`campaigns/${campaignId}.json`).then(campaign => {
          CampaignSystem.saveBattleResult(
            campaignId, campaign, battleId,
            (() => {
              const { campaignId } = CampaignSystem.readUrlParams();
              // playerSide est passé via URL ou on le lit depuis la campagne déjà chargée
              // On le stocke dans campaignPlayerSide au moment du chargement
              return winningSide === _campaignPlayerSide ? 'victory' : 'defeat';
            })(),
            { allies: state.medals.allies || 0, axis: state.medals.axis || 0 },
            completedIds
          );
        });
      }
    }
    const winnerLabel = winningSide === 'allies' ? '🔵 Alliés' : '🔴 Axe';
    const loserLabel  = winningSide === 'allies' ? '🔴 Axe'    : '🔵 Alliés';
    const loserSide   = winningSide === 'allies' ? 'axis'       : 'allies';

    // Récap des objectifs complétés
    const completedLines = _objectives
      .filter(o => o.completed)
      .map(o => {
        const by = o.completedBy === 'allies' ? '🔵' : '🔴';
        return `${by} ${o.label} (+${o.reward} 🏅)`;
      });

    const completedText = completedLines.length > 0
      ? completedLines.join('\n')
      : 'Aucun objectif spécial accompli.';

    // Scores finaux
    const scoreWinner = state.medals[winningSide] || 0;
    const scoreLoser  = state.medals[loserSide]   || 0;

    _showVictoryPopup(winnerLabel, loserLabel, scoreWinner, scoreLoser, completedText);
  }

  // ─── UI — Médailles repères ────────────────────────────────────────────────
  function _renderObjectiveBadges() {
    // Nettoyer les anciens badges
    document.querySelectorAll('.obj-badge').forEach(b => b.remove());

    _objectives.forEach(obj => {
      if (obj.completed) return;

      if (obj.type === 'control_tile') {
        const wrapper = document.querySelector(`.hex-wrapper[data-x="${obj.x}"][data-y="${obj.y}"]`);
        if (!wrapper) return;
        const badge = document.createElement('div');
        badge.className = 'obj-badge obj-badge-tile';
        badge.textContent = '🎖️';
        badge.title = obj.label;
        wrapper.appendChild(badge);
      }

      if (obj.type === 'evacuation') {
        const wrapper = document.querySelector(`.hex-wrapper[data-x="${obj.x}"][data-y="${obj.y}"]`);
        if (!wrapper) return;
        const badge = document.createElement('div');
        badge.className = 'obj-badge obj-badge-tile';
        badge.textContent = '➡️';
        badge.title = obj.label;
        wrapper.appendChild(badge);
      }

      if (obj.type === 'kill_unit') {
        const state = window.GameAPI.getState();
        for (let y = 0; y < state.map.length; y++) {
          for (let x = 0; x < state.map[y].length; x++) {
            const unit = state.map[y][x]?.unit;
            if (!unit) continue;
            const matchClass = obj.targetCssClass && unit.cssClass === obj.targetCssClass;
            const matchType  = obj.targetType     && unit.type    === obj.targetType;
            if (!matchClass && !matchType) continue;
            const wrapper = document.querySelector(`.hex-wrapper[data-x="${x}"][data-y="${y}"]`);
            if (!wrapper) continue;
            const badge = document.createElement('div');
            badge.className = 'obj-badge obj-badge-unit';
            badge.textContent = '🎯';
            badge.title = obj.label;
            wrapper.appendChild(badge);
          }
        }
      }
    });
  }
  // ─── UI — Panneau objectifs ────────────────────────────────────────────────
function renderObjectivesPanel() {
    let panel = document.getElementById('objectives-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'objectives-panel';
      const hexSection = document.getElementById('info-panel')
        ?.querySelector('.info-section');
      if (hexSection && hexSection.parentNode) {
        hexSection.parentNode.insertBefore(panel, hexSection.nextSibling);
      }
    }

    if (_objectives.length === 0 && !_victoryThresholds) {
      panel.style.display = 'none';
      return;
    }

    const state = window.GameAPI.getState();

    let html = `
      <div class="obj-header">
        🎯 Objectifs de victoire
        ${_battleContinued ? `<button id="obj-end-battle-btn" title="Terminer la partie">🏁</button>` : ''}
      </div>
      <div class="obj-thresholds">
        <span class="obj-side-allies">🔵 Alliés : ${state.medals.allies || 0}/${_victoryThresholds.allies} 🏅</span>
        <span class="obj-side-axis">🔴 Axe : ${state.medals.axis || 0}/${_victoryThresholds.axis} 🏅</span>
      </div>
    `;

    if (_objectives.length > 0) {
      html += `<div class="obj-list">`;
      _objectives.forEach(obj => {
        const done     = obj.completed;
        const sideIcon = obj.side === 'allies' ? '🔵' : '🔴';
        let progress   = '';

        if (!done && obj.type === 'control_tile') {
          const tracker = _controlTrackers[obj.id] || {};
          const current = tracker.consecutiveTurns || 0;
          progress = ` (${current}/${obj.turns} tours)`;
        }
        if (!done && obj.type === 'survive_turns') {
          progress = ` (tour ${_surviveTurn}/${obj.turns})`;
        }

        html += `
          <div class="obj-item ${done ? 'obj-done' : ''}">
            <span class="obj-icon">${done ? '✅' : '⬜'}</span>
            <span class="obj-label">${sideIcon} ${obj.label}${progress}</span>
            <span class="obj-reward">+${obj.reward}🏅</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    panel.innerHTML = html;

    // Brancher le bouton "Finir la partie" s'il est affiché
    const endBtn = document.getElementById('obj-end-battle-btn');
    if (endBtn) {
      endBtn.onclick = () => {
        const state = window.GameAPI.getState();
        // Déterminer le vainqueur actuel par médailles
        const alliesScore = state.medals.allies || 0;
        const axisScore   = state.medals.axis   || 0;
        let winningSide, losingSide;
        if (alliesScore >= axisScore) {
          winningSide = 'allies'; losingSide = 'axis';
        } else {
          winningSide = 'axis';   losingSide = 'allies';
        }
        const winnerLabel = winningSide === 'allies' ? '🔵 Alliés' : '🔴 Axe';
        const loserLabel  = winningSide === 'allies' ? '🔴 Axe'    : '🔵 Alliés';
        const completedLines = _objectives
          .filter(o => o.completed)
          .map(o => `${o.completedBy === 'allies' ? '🔵' : '🔴'} ${o.label} (+${o.reward} 🏅)`);
        _showVictoryPopup(
          winnerLabel, loserLabel,
          alliesScore, axisScore,
          completedLines.length > 0 ? completedLines.join('\n') : 'Aucun objectif spécial.',
          true // forceShow : ne pas bloquer avec _gameOver
        );
      };
    }
    _renderObjectiveBadges(); 
  }

  // ─── UI — Popup de victoire ────────────────────────────────────────────────
function _showVictoryPopup(winner, loser, scoreW, scoreL, objectivesText) {
    const overlay = document.createElement('div');
    overlay.id = 'victory-overlay';

    const { campaignId } = window.CampaignSystem ? CampaignSystem.readUrlParams() : { campaignId: null };
    const replayLabel = campaignId ? "Bataille suivante" : "↩ Rejouer";

    overlay.innerHTML = `
      <div id="victory-popup">
        <div id="victory-title">🏆 VICTOIRE !</div>
        <div id="victory-winner">${winner}</div>
        <div id="victory-scores">
          <span class="vs-winner">${winner} : ${scoreW} 🏅</span>
          <span class="vs-loser">${loser} : ${scoreL} 🏅</span>
        </div>
        <div id="victory-objectives-title">Objectifs accomplis</div>
        <div id="victory-objectives">${objectivesText.replace(/\n/g, '<br>')}</div>
        <div id="victory-buttons">
          <button id="victory-continue-btn">⚔️ Continuer la bataille</button>
          <button id="victory-replay-btn">${replayLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('victory-continue-btn').onclick = () => {
      overlay.remove();
      _gameOver = false; // Permet de continuer à jouer
      _battleContinued = true;       // ← activer le bouton "Finir la partie"
      renderObjectivesPanel();      // ← rafraîchir pour afficher le bouton
    };

    document.getElementById('victory-replay-btn').onclick = () => {
      if (campaignId) {
        window.location.href = 'campaign.html';
      } else {
        window.location.reload();
      }
    };
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  return {
    init,
    onUnitKilled,
    onTurnEnd,
    checkMedalVictory,
    renderObjectivesPanel,
  };

})();

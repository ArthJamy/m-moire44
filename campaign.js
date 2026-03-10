/**
 * campaign.js — Système de campagne
 * Gère : chargement des campagnes, localStorage, modificateurs, navigation
 */

window.CampaignSystem = (function () {

  const STORAGE_PREFIX = 'campaign_progress_';

  // ─── Lecture / écriture localStorage ───────────────────────────────────────

  function _loadProgress(campaignId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + campaignId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('[Campaign] Erreur lecture localStorage', e);
      return null;
    }
  }

  function _saveProgress(campaignId, progress) {
    try {
      localStorage.setItem(STORAGE_PREFIX + campaignId, JSON.stringify(progress));
    } catch (e) {
      console.error('[Campaign] Erreur écriture localStorage', e);
    }
  }

  function _initProgress(campaign) {
    const firstBattle = campaign.battles[0];
    return {
      currentBattle: firstBattle.id,
      unlockedBattles: [firstBattle.id],
      results: {},
      cumulativeModifiers: {
        medals:      { allies: 0, axis: 0 },
        actions:     { allies: 0, axis: 0 },
        addCards:    { allies: [], axis: [] },
        removeCards: { allies: [], axis: [] },
        addUnits:    { allies: [], axis: [] },
        removeUnits: { allies: [], axis: [] },
      },
    };
  }

  function resetProgress(campaignId) {
    localStorage.removeItem(STORAGE_PREFIX + campaignId);
  }

  // ─── Chargement d'une campagne JSON ────────────────────────────────────────

  async function loadCampaign(campaignFile) {
    const resp = await fetch(campaignFile);
    if (!resp.ok) throw new Error(`Impossible de charger ${campaignFile}`);
    return await resp.json();
  }

  // ─── Résoudre la prochaine bataille ────────────────────────────────────────
  function resolveNextBattle(campaign, battleId, outcome, completedObjectiveIds) {
    const battle = campaign.battles.find(b => b.id === battleId);
    if (!battle || !battle.outcomes) return null;

    // Résoudre le next de base (victoire/défaite)
    const nextBattlesBranch = campaign.battles;
    const nextBranch = nextBattlesBranch.find(b => b.branch?.from === battleId);

    let nextBattleId, baseMods;
    if (nextBranch) {
      nextBattleId = outcome === 'victory'
        ? nextBranch.branch.if_victory
        : nextBranch.branch.if_defeat;
      baseMods = (battle.outcomes[outcome] || {}).modifiers || {};
    } else {
      const outcomeData = battle.outcomes[outcome] || {};
      nextBattleId = outcomeData.next || null;
      baseMods     = outcomeData.modifiers || {};
    }

    // Cumuler TOUS les bonus objectifs accomplis (plus d'arrêt au premier)
    let mergedMods = { ...baseMods };
    if (battle.outcomes.bonus_objectives && completedObjectiveIds?.length > 0) {
      for (const objId of completedObjectiveIds) {
        const bonus = battle.outcomes.bonus_objectives[objId];
        if (!bonus) continue;

        // Fusionner les modifiers du bonus avec ceux déjà accumulés
        const b = bonus.modifiers || {};
        for (const side of ['allies', 'axis']) {
          if (b.addUnits?.[side]) {
            mergedMods.addUnits = mergedMods.addUnits || {};
            mergedMods.addUnits[side] = [
              ...(mergedMods.addUnits[side] || []),
              ...b.addUnits[side]
            ];
          }
          if (b.addCards?.[side]) {
            mergedMods.addCards = mergedMods.addCards || {};
            mergedMods.addCards[side] = [
              ...(mergedMods.addCards[side] || []),
              ...b.addCards[side]
            ];
          }
          if (b.removeUnits?.[side]) {
            mergedMods.removeUnits = mergedMods.removeUnits || {};
            mergedMods.removeUnits[side] = [
              ...(mergedMods.removeUnits[side] || []),
              ...b.removeUnits[side]
            ];
          }
          if (b.removeCards?.[side]) {
            mergedMods.removeCards = mergedMods.removeCards || {};
            mergedMods.removeCards[side] = [
              ...(mergedMods.removeCards[side] || []),
              ...b.removeCards[side]
            ];
          }
          if (b.medals?.[side] !== undefined) {
            mergedMods.medals = mergedMods.medals || {};
            mergedMods.medals[side] = (mergedMods.medals[side] || 0) + b.medals[side];
          }
          if (b.actions?.[side] !== undefined) {
            mergedMods.actions = mergedMods.actions || {};
            mergedMods.actions[side] = (mergedMods.actions[side] || 0) + b.actions[side];
          }
        }

        // Le bonus peut aussi surcharger le next
        if (bonus.next) nextBattleId = bonus.next;
      }
    }

    return { nextBattleId, modifiers: mergedMods };
  }

  // ─── Fusionner les modificateurs cumulatifs ────────────────────────────────

  function _mergeModifiers(cumulative, newMods) {
    const result = JSON.parse(JSON.stringify(cumulative)); // deep copy

    if (newMods.medals) {
      for (const side of ['allies', 'axis']) {
        if (newMods.medals[side] !== undefined)
          result.medals[side] = (result.medals[side] || 0) + newMods.medals[side];
      }
    }
    if (newMods.actions) {
      for (const side of ['allies', 'axis']) {
        if (newMods.actions[side] !== undefined)
          result.actions[side] = (result.actions[side] || 0) + newMods.actions[side];
      }
    }
    if (newMods.addCards) {
      for (const side of ['allies', 'axis']) {
        if (newMods.addCards[side])
          result.addCards[side] = [...(result.addCards[side] || []), ...newMods.addCards[side]];
      }
    }
    if (newMods.removeCards) {
      for (const side of ['allies', 'axis']) {
        if (newMods.removeCards[side])
          result.removeCards[side] = [...(result.removeCards[side] || []), ...newMods.removeCards[side]];
      }
    }
    if (newMods.addUnits) {
      for (const side of ['allies', 'axis']) {
        if (newMods.addUnits[side])
          result.addUnits[side] = [...(result.addUnits[side] || []), ...newMods.addUnits[side]];
      }
    }
    if (newMods.removeUnits) {
      for (const side of ['allies', 'axis']) {
        if (newMods.removeUnits[side])
          result.removeUnits[side] = [...(result.removeUnits[side] || []), ...newMods.removeUnits[side]];
      }
    }

    return result;
  }

  // ─── Sauvegarder le résultat d'une bataille ────────────────────────────────

  function saveBattleResult(campaignId, campaign, battleId, outcome, scores, completedObjectiveIds) {
    let progress = _loadProgress(campaignId) || _initProgress(campaign);

    // Sauvegarder le résultat
    progress.results[battleId] = {
      outcome,
      objectivesCompleted: completedObjectiveIds || [],
      scores,
    };

    // Résoudre la suite
    const resolution = resolveNextBattle(campaign, battleId, outcome, completedObjectiveIds);

    // Réinitialiser AVANT de merger les nouveaux modifiers
    progress.cumulativeModifiers.addUnits    = { allies: [], axis: [] };
    progress.cumulativeModifiers.addCards    = { allies: [], axis: [] };
    progress.cumulativeModifiers.removeUnits = { allies: [], axis: [] };
    progress.cumulativeModifiers.removeCards = { allies: [], axis: [] };

    if (resolution) {
      // Fusionner les modificateurs (les nouveaux renforts sont ajoutés proprement)
      progress.cumulativeModifiers = _mergeModifiers(
        progress.cumulativeModifiers,
        resolution.modifiers
      );

      // Débloquer la prochaine bataille
      if (resolution.nextBattleId && !progress.unlockedBattles.includes(resolution.nextBattleId)) {
        progress.unlockedBattles.push(resolution.nextBattleId);
      }
      progress.currentBattle = resolution.nextBattleId;
    }
    
    _saveProgress(campaignId, progress);


    return progress;
  }

  // ─── Construire l'URL de lancement d'une bataille ─────────────────────────

  function buildGameUrl(campaign, battle, progress) {
    const mods = progress?.cumulativeModifiers || {};
    const params = new URLSearchParams({
      map:      battle.map,
      campaign: campaign.id,
      battle:   battle.id,
    });

    // Passer les modificateurs en JSON encodé
    if (mods && Object.keys(mods).length > 0) {
      params.set('campaignMods', JSON.stringify(mods));
    }

    return `game.html?${params.toString()}`;
  }

  // ─── Lire les params URL (côté game.html) ─────────────────────────────────

  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const campaignId  = params.get('campaign');
    const battleId    = params.get('battle');
    const modsRaw     = params.get('campaignMods');
    let mods = null;
    if (modsRaw) {
      try { mods = JSON.parse(modsRaw); } catch (e) { mods = null; }
    }
    return { campaignId, battleId, mods };
  }

  // ─── Appliquer les modificateurs dans game.html ───────────────────────────

  /**
   * À appeler après le chargement de la carte dans game.html.
   * Modifie directement gameState et MAP_DATA.
   */
  function applyModifiers(mods, gameState, MAP_DATA) {
    if (!mods) return;

    // PA
    if (mods.actions) {
      for (const side of ['allies', 'axis']) {
        if (mods.actions[side]) {
          gameState.maxActions[side]     = Math.max(1, (gameState.maxActions[side]     || 0) + mods.actions[side]);
          gameState.currentActions[side] = Math.max(1, (gameState.currentActions[side] || 0) + mods.actions[side]);
        }
      }
    }

    // Seuils de médailles
    if (mods.medals && MAP_DATA.meta?.victory?.medals) {
      for (const side of ['allies', 'axis']) {
        if (mods.medals[side] !== undefined) {
          MAP_DATA.meta.victory.medals[side] = Math.max(1,
            (MAP_DATA.meta.victory.medals[side] || 5) + mods.medals[side]
          );
        }
      }
    }

    // Cartes : ajouter
    if (mods.addCards && MAP_DATA.cards) {
      for (const side of ['allies', 'axis']) {
        if (mods.addCards[side]?.length > 0) {
          MAP_DATA.cards[side] = [...(MAP_DATA.cards[side] || []), ...mods.addCards[side]];
        }
      }
    }

    // Cartes : retirer
    if (mods.removeCards && MAP_DATA.cards) {
      for (const side of ['allies', 'axis']) {
        if (mods.removeCards[side]?.length > 0) {
          MAP_DATA.cards[side] = (MAP_DATA.cards[side] || []).filter(
            c => !mods.removeCards[side].includes(c.id)
          );
        }
      }
    }

    // Unités : retirer (avant d'ajouter)
    if (mods.removeUnits && MAP_DATA.units) {
      for (const side of ['allies', 'axis']) {
        if (mods.removeUnits[side]?.length > 0) {
          for (const removal of mods.removeUnits[side]) {
            let count = removal.count || 1;
            MAP_DATA.units = MAP_DATA.units.filter(u => {
              if (u.side === side && u.type === removal.type && count > 0) {
                count--;
                return false;
              }
              return true;
            });
          }
        }
      }
    }

    // Unités : ajouter (placées sur le bord du camp)
    if (mods.addUnits && MAP_DATA.units) {
      for (const side of ['allies', 'axis']) {
        if (mods.addUnits[side]?.length > 0) {
          for (const unit of mods.addUnits[side]) {
            // Position bord bas pour allies, haut pour axis
            MAP_DATA.units.push({
              ...unit,
              side,
              x: -1, // Sera placé automatiquement au bord par le spawn
              y: -1,
              _spawnAtEdge: true,
            });
          }
        }
      }
    }

    console.log('[Campaign] Modificateurs appliqués :', mods);
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  return {
    loadCampaign,
    loadProgress:      _loadProgress,
    saveProgress:      _saveProgress,
    initProgress:      _initProgress,
    resetProgress,
    saveBattleResult,
    buildGameUrl,
    readUrlParams,
    applyModifiers,
    resolveNextBattle,
  };

})();

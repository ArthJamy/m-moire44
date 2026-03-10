/**
 * animations.js — Système d'animations modulaire pour le jeu hexagonal
 * Dépend de window.GameAPI pour récupérer les positions des hexagones
 */

window.AnimSystem = (function () {

  // ─── Utilitaires ───────────────────────────────────────────────────────────

  /** Retourne le centre (px viewport) d'un hex-wrapper à partir de coords de grille */
  function getHexCenter(x, y) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return null;
    // Cherche le wrapper correspondant
    const wrapper = mapEl.querySelector(`.hex-wrapper[data-x="${x}"][data-y="${y}"]`);
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function removeAfter(el, ms) {
    setTimeout(() => el && el.parentNode && el.parentNode.removeChild(el), ms);
  }

  function createEl(tag, cls, styles = {}) {
    const el = document.createElement(tag);
    el.className = cls;
    Object.assign(el.style, styles);
    document.body.appendChild(el);
    return el;
  }

  // ─── Dégâts flottants ──────────────────────────────────────────────────────

  function floatingText(x, y, text, type = 'damage-hit') {
    // léger offset aléatoire pour éviter empilement
    const ox = (Math.random() - 0.5) * 30;
    const el = createEl('div', `floating-damage ${type}`, {
      left: (x + ox) + 'px',
      top:  y + 'px',
    });
    el.textContent = text;
    removeAfter(el, 1400);
  }

  // ─── Flash hex ─────────────────────────────────────────────────────────────

  function hexFlash(x, y) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const wrapper = mapEl.querySelector(`.hex-wrapper[data-x="${x}"][data-y="${y}"]`);
    if (!wrapper) return;
    wrapper.classList.add('hit-flash');
    setTimeout(() => wrapper.classList.remove('hit-flash'), 500);
  }

  // ─── Shake d'unité ─────────────────────────────────────────────────────────

  function unitShake(x, y) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const wrapper = mapEl.querySelector(`.hex-wrapper[data-x="${x}"][data-y="${y}"]`);
    if (!wrapper) return;
    const unit = wrapper.querySelector('.unit');
    if (!unit) return;
    unit.classList.remove('unit-hit');
    void unit.offsetWidth; // reflow
    unit.classList.add('unit-hit');
    setTimeout(() => unit.classList.remove('unit-hit'), 500);
  }

  // ─── Particules d'impact ───────────────────────────────────────────────────

  function spawnParticles(cx, cy, count, color, spread, speed) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
      const dist  = spread * (0.5 + Math.random() * 0.5);
      const el = createEl('div', 'impact-particle', {
        left: cx + 'px',
        top:  cy + 'px',
        background: color,
        boxShadow: `0 0 4px ${color}`,
      });
      const duration = speed * (0.7 + Math.random() * 0.6);
      el.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0)`, opacity: 0 }
      ], { duration, easing: 'ease-out', fill: 'forwards' });
      removeAfter(el, duration + 50);
    }
  }

  // ─── Explosion ─────────────────────────────────────────────────────────────

  function explosion(cx, cy, size = '') {
    const el = createEl('div', `impact-explosion ${size ? 'impact-'+size : ''}`, {
      left: cx + 'px', top: cy + 'px',
      width: '1px', height: '1px',
    });
    removeAfter(el, 600);
  }

  // ─── Projectile animé ──────────────────────────────────────────────────────

  /**
   * @param {object} from  {x, y} centre px
   * @param {object} to    {x, y} centre px
   * @param {string} type  'bullet'|'shell'|'mortar'
   * @param {number} duration ms
   * @param {function} onImpact callback à l'arrivée
   */
  function animateProjectile(from, to, type, duration, onImpact) {
    const isArc   = (type === 'mortar');
    const isFlame = (type === 'flame');

    // Court-circuit pour airstrike : pas de projectile visuel
    if (type === 'airstrike') {
      setTimeout(() => onImpact && onImpact(to.x, to.y), 50);
      return;
    }
    // Styles visuels par type
    const styles = {
      bullet: { width: '6px',  height: '6px',  background: '#ffdd00', borderRadius: '50%', boxShadow: '0 0 8px #ffaa00' },
      shell:  { width: '12px', height: '8px',  background: 'linear-gradient(90deg,#ff6600,#ffcc00)', borderRadius: '40% 60% 60% 40%', boxShadow: '0 0 12px #ff4400' },
      mortar: { width: '10px', height: '10px', background: 'radial-gradient(circle,#ff8800,#cc3300)', borderRadius: '50%', boxShadow: '0 0 10px #ff6600' },
      rocket: { width: '14px', height: '7px',  background: 'linear-gradient(90deg,#ff3300,#ffaa00)', borderRadius: '20% 60% 60% 20%', boxShadow: '0 0 14px #ff6600' },
      sniper: { width: '8px',  height: '3px',  background: '#ffffff', borderRadius: '50%', boxShadow: '0 0 6px #aaffff' },
      flame:  { width: '0px',  height: '0px' }, // géré par particules ci-dessous
      shell_bullet: { width: '9px', height: '6px', background: 'linear-gradient(90deg,#ff6600,#ffee00)', borderRadius: '40% 60% 60% 40%', boxShadow: '0 0 10px #ff8800' },
      airstrike:    { width: '0px', height: '0px' }, // pas de projectile visible
    };

    const el = createEl('div', `projectile projectile-${type}`, { left: from.x+'px', top: from.y+'px' });
    const s  = styles[type] || styles.bullet;
    Object.assign(el.style, s, { position: 'fixed', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: '9999' });

    const steps = isFlame ? 15 : 30;
    const trailInterval = Math.max(1, Math.floor(steps / 6));
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const t = step / steps;

      let px, py;
      if (isArc) {
        px = lerp(from.x, to.x, t);
        const arcH = -Math.min(140, Math.hypot(to.x - from.x, to.y - from.y) * 0.45);
        py = lerp(from.y, to.y, t) + arcH * Math.sin(Math.PI * t);
      } else {
        px = lerp(from.x, to.x, t);
        py = lerp(from.y, to.y, t);
      }

      el.style.left = px + 'px';
      el.style.top  = py + 'px';

      if (!isArc && !isFlame) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
        el.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
      }

      // Trails
      if (step % trailInterval === 0 && !isFlame) {
        const trailColors = {
          bullet: '#ffdd00', shell: '#ff8800', mortar: '#ff6600',
          rocket: '#ff4400', sniper: '#aaffff', shell_bullet: '#ff9900',
        };
        const trail = createEl('div', 'projectile-trail', {
          left:       px + 'px', top: py + 'px',
          width:      type === 'shell' || type === 'rocket' ? '8px' : '4px',
          height:     type === 'shell' || type === 'rocket' ? '8px' : '4px',
          background: trailColors[type] || '#ffdd00',
        });
        removeAfter(trail, 350);
      }

      // Flame : particules continues tout le long
      if (isFlame && step % 2 === 0) {
        const fEl = createEl('div', 'impact-particle', {
          left: px + 'px', top: py + 'px',
          width: (8 + Math.random() * 10) + 'px',
          height: (8 + Math.random() * 10) + 'px',
          background: `hsl(${Math.floor(Math.random()*40)},100%,55%)`,
          borderRadius: '50%',
          boxShadow: '0 0 8px #ff4400',
        });
        const drift = (Math.random() - 0.5) * 20;
        fEl.animate([
          { transform: `translate(-50%,-50%) scale(1)`,             opacity: 0.9 },
          { transform: `translate(calc(-50% + ${drift}px),-80%) scale(0.3)`, opacity: 0 }
        ], { duration: 280, easing: 'ease-out', fill: 'forwards' });
        removeAfter(fEl, 320);
      }

      if (step >= steps) {
        clearInterval(interval);
        el.parentNode && el.parentNode.removeChild(el);
        onImpact && onImpact(px, py);
      }
    }, duration / steps);
  }

  /** Impact spécial flamme (nappe de feu sur la cible) */
  function _flameImpact(cx, cy) {
    for (let i = 0; i < 12; i++) {
      const angle  = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5);
      const dist   = 15 + Math.random() * 25;
      const size   = 10 + Math.random() * 14;
      const fEl = createEl('div', 'impact-particle', {
        left: cx + 'px', top: cy + 'px',
        width: size + 'px', height: size + 'px',
        background: `hsl(${Math.floor(Math.random()*40)},100%,55%)`,
        borderRadius: '50%',
        boxShadow: '0 0 10px #ff4400',
      });
      fEl.animate([
        { transform: `translate(-50%,-50%) scale(0.5)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0)`, opacity: 0 }
      ], { duration: 500, easing: 'ease-out', fill: 'forwards' });
      removeAfter(fEl, 550);
    }
  }

  function _airstrikeEffect(fromCx, fromCy, toCx, toCy, damage) {
    // Onde radio depuis l'attaquant
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const ring = createEl('div', 'airstrike-ring', {
          left: fromCx + 'px',
          top:  fromCy + 'px',
          width:  '10px',
          height: '10px',
        });
        ring.animate([
          { transform: 'translate(-50%,-50%) scale(0)', opacity: 0.8, borderColor: '#88ffcc' },
          { transform: 'translate(-50%,-50%) scale(6)', opacity: 0,   borderColor: '#88ffcc' },
        ], { duration: 700, easing: 'ease-out', fill: 'forwards' });
        removeAfter(ring, 750);
      }, i * 180);
    }

    // Délai pour simuler le temps de vol des avions
    setTimeout(() => {
      // Plusieurs explosions décalées sur la cible
      const offsets = [{x:0,y:0},{x:-18,y:-12},{x:15,y:10},{x:-10,y:14}];
      offsets.forEach((off, i) => {
        setTimeout(() => {
          explosion(toCx + off.x, toCy + off.y, i === 0 ? 'large' : '');
          spawnParticles(toCx + off.x, toCy + off.y, 8, '#ff6600', 35, 450);
        }, i * 120);
      });
    }, 700);
  }

  function _playShellBulletAnimation(from, to, fromX, fromY, toX, toY, damage, retreatFlag, onComplete) {
    // 1. Un obus classique
    animateProjectile(from, to, 'shell', 350, (px, py) => {
      explosion(px, py, '');
      spawnParticles(px, py, 8, '#ff8800', 35, 400);
    });

    // 2. Rafale de balles parallèles, légèrement décalées
    const offsets = [-12, -4, 4, 12];
    offsets.forEach((offset, i) => {
        setTimeout(() => {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const perp  = angle + Math.PI / 2;
        const toDisp = {
          x: to.x + Math.cos(perp) * offset,
          y: to.y + Math.sin(perp) * offset,
        };
        const fromDisp = {
          x: from.x + Math.cos(perp) * offset,
          y: from.y + Math.sin(perp) * offset,
        };
        animateProjectile(fromDisp, toDisp, 'bullet', 200, (px, py) => {
          if (i === offsets.length - 1) {
            // Effets finaux sur la dernière balle
            if (damage > 0 || retreatFlag) {
              hexFlash(toX, toY);
              unitShake(toX, toY);
              spawnParticles(px, py, 5, '#ffdd00', 20, 300);
              floatingText(to.x, to.y - 20, damage > 0 ? `-${damage}` : '↩', damage > 0 ? 'damage-hit' : 'damage-miss');
            } else {
              floatingText(to.x, to.y - 20, 'MISS', 'damage-miss');
            }
            onComplete && setTimeout(onComplete, 200);
          }
        });
      }, 200 + i * 60);
    });
  }
  // ─── Animation complète d'attaque ──────────────────────────────────────────
  // ─── Table de profils d'animation par type d'unité ────────────────────────
  // Clé = unitType exact (depuis unit.type), sinon fallback sur category
  const ANIM_PROFILES = {
    // ── Infanterie spéciale ──
    infantryMortier: {
      proj: 'mortar', dur: 500, burst: 1,
      impact: 'large', particles: 10, color: '#ff6600', spread: 45,
    },
    infantryLF: {
      proj: 'flame', dur: 450, burst: 8,
      impact: 'flame', particles: 10, color: '#ff3300', spread: 35,
    },
    tankLF: {
      proj: 'flame', dur: 300, burst: 1,
      impact: 'flame', particles: 10, color: '#ff3300', spread: 40,
    },
    infantryBazouka: {
      proj: 'rocket', dur: 320, burst: 1,
      impact: 'large', particles: 9, color: '#ffaa00', spread: 40,
    },
    infantryMitrailleuse: {
      proj: 'bullet', dur: 200, burst: 5,
      impact: 'small', particles: 4, color: '#ffee88', spread: 18,
    },
    infantryElite: {
      proj: 'bullet', dur: 220, burst: 3,
      impact: 'small', particles: 5, color: '#ffdd00', spread: 20,
    },
    sniper: {
      proj: 'sniper', dur: 180, burst: 1,
      impact: 'small', particles: 2, color: '#ffffff', spread: 10,
    },
    // ── Tanks ──
    tankLF: {
      proj: 'flame', dur: 500, burst: 10,
      impact: 'flame', particles: 10, color: '#ff3300', spread: 40,
    },
    Heavytank: {
      proj: 'shell_bullet', dur: 420, burst: 1,
      impact: 'large', particles: 12, color: '#ff5500', spread: 50,
    },
    tankAC: {
      proj: 'shell', dur: 150, burst: 1,
      impact: 'small', particles: 12, color: '#eb7e35', spread: 50,
    },
    BlindeMTR: {
      proj: 'bullet', dur: 240, burst: 5,
      impact: 'large', particles: 4, color: '#ffdd00', spread: 50,
    },
    artilleryAntiChar: {
      proj: 'shell', dur: 150, burst: 1,
      impact: 'small', particles: 12, color: '#ff6600', spread: 50,
    },
    // ── Bateaux ──
    boatCroiseur: {
      proj: 'shell', dur: 600, burst: 1,
      impact: 'large', particles: 14, color: '#88ccff', spread: 60,
    },
    boatPorteAVions: {
      proj: 'airstrike', dur: 800, burst: 1,
      impact: 'large', particles: 12, color: '#ffaa00', spread: 55,
    },
    // ── Trains ──
    train: {
      proj: 'mortar', dur: 550, burst: 2,
      impact: '', particles: 8, color: '#ff8800', spread: 35,
    },
    trainRenf: {
      proj: 'shell', dur: 400, burst: 1,
      impact: '', particles: 6, color: '#ff8800', spread: 30,
    },
  };

  // Fallback par catégorie
  const ANIM_CATEGORY_PROFILES = {
    infantry: {
      proj: 'bullet', dur: 240, burst: 3,
      impact: 'small', particles: 5, color: '#ffdd00', spread: 20,
    },
    tank: {
      proj: 'shell_bullet', dur: 360, burst: 2,
      impact: '', particles: 8, color: '#ff8800', spread: 35,
    },
    artillery: {
      proj: 'mortar', dur: 520, burst: 1,
      impact: 'large', particles: 11, color: '#ff6600', spread: 48,
    },
    boat: {
      proj: 'shell', dur: 400, burst: 1,
      impact: '', particles: 8, color: '#88ccff', spread: 35,
    },
    train: {
      proj: 'shell', dur: 400, burst: 1,
      impact: '', particles: 7, color: '#ff8800', spread: 32,
    },
    sniper: {
      proj: 'sniper', dur: 180, burst: 1,
      impact: 'small', particles: 2, color: '#ffffff', spread: 10,
    },
  };

  function _getAnimProfile(unitType, unitCategory) {
    return ANIM_PROFILES[unitType]
        || ANIM_CATEGORY_PROFILES[unitCategory]
        || ANIM_CATEGORY_PROFILES['infantry'];
  }

  /**
   * Lance l'animation d'attaque complète.
   * @param {number} fromX, fromY   coords grille attaquant
   * @param {number} toX, toY       coords grille défenseur
   * @param {string} unitType       unit.type exact (ex: 'infantryMortier')
   * @param {string} unitCategory   unit.category (ex: 'infantry')
   * @param {number} damage         dégâts infligés (0 = raté)
   * @param {boolean} retreatFlag   true si flag de retraite
   * @param {function} onComplete
   */
  function playAttackAnimation(fromX, fromY, toX, toY, unitType, unitCategory, damage, retreatFlag, onComplete) {
    const from = getHexCenter(fromX, fromY);
    const to   = getHexCenter(toX,   toY);
    if (!from || !to) { onComplete && onComplete(); return; }

    const profile = _getAnimProfile(unitType, unitCategory);
    if (profile.proj === 'shell_bullet') {
      _playShellBulletAnimation(from, to, fromX, fromY, toX, toY, damage, retreatFlag, onComplete);
      return;
    }
    const p = profile;

    // Rafale : lancer `burst` projectiles décalés
    let completed = 0;
    for (let i = 0; i < p.burst; i++) {
      const delay = i * 80;
      setTimeout(() => {
        // Légère dispersion pour les rafales
        const spread = p.burst > 1 ? (Math.random() - 0.5) * 12 : 0;
        const toDisp = { x: to.x + spread, y: to.y + spread };

        animateProjectile(from, toDisp, p.proj, p.dur, (px, py) => {
          completed++;
          const isLast = completed >= p.burst;

          if (isLast) {
            // Effets d'impact sur le dernier projectile seulement
            if (damage > 0 || retreatFlag) {
              if (p.proj === 'airstrike') {
                _airstrikeEffect(from.x, from.y, to.x, to.y, damage);
              } else if (p.impact === 'flame') {
                _flameImpact(px, py);
              } else {
                explosion(px, py, p.impact);
              }
              spawnParticles(px, py, p.particles, p.color, p.spread, 400);
              hexFlash(toX, toY);
              unitShake(toX, toY);
              const txt = damage > 0 ? `-${damage}` : '↩';
              floatingText(to.x, to.y - 20, txt, damage > 0 ? 'damage-hit' : 'damage-miss');
            } else {
              floatingText(to.x, to.y - 20, 'MISS', 'damage-miss');
              spawnParticles(px, py, 3, '#888888', 15, 300);
            }
            onComplete && setTimeout(onComplete, 200);
          } else {
            // Impacts intermédiaires légers pour rafale
            if (damage > 0) {
              spawnParticles(px, py, 2, p.color, 12, 250);
            }
          }
        });
      }, delay);
    }
  }
  
  /**
   * @param {number} centerX, centerY  coords grille du centre
   * @param {number} radius            rayon en cases
   * @param {Array}  hits              [{x, y, damage}] — unités touchées avec leurs dégâts
   * @param {function} onComplete
   */
  function playAreaDamageAnimation(centerX, centerY, radius, hits, onComplete) {
    const center = getHexCenter(centerX, centerY);
    if (!center) { onComplete && onComplete(); return; }

    // Onde de choc au centre
    const hexSize = 70;
    const shockPx = (radius * 2 + 1) * hexSize;
    const el = createEl('div', 'shockwave', {
      left:   center.x + 'px',
      top:    center.y + 'px',
      width:  shockPx + 'px',
      height: shockPx + 'px',
    });
    removeAfter(el, 700);

    // Explosion + particules au centre
    explosion(center.x, center.y, radius >= 2 ? 'large' : '');
    spawnParticles(center.x, center.y, 10, '#ff6600', 40, 500);

    // Effets sur chaque hex touché, décalés progressivement
    if (hits && hits.length > 0) {
      hits.forEach((hit, i) => {
        const delay = 80 + i * 60; // cascade légère
        setTimeout(() => {
          const hexCenter = getHexCenter(hit.x, hit.y);
          if (!hexCenter) return;

          // Explosion secondaire sur chaque unité
          explosion(hexCenter.x, hexCenter.y, 'small');
          spawnParticles(hexCenter.x, hexCenter.y, 5, '#ff8800', 25, 350);
          hexFlash(hit.x, hit.y);
          unitShake(hit.x, hit.y);

          // Dégât flottant
          if (hit.damage > 0) {
            floatingText(hexCenter.x, hexCenter.y - 20, `-${hit.damage}`, 'damage-hit');
          } else {
            floatingText(hexCenter.x, hexCenter.y - 20, 'MISS', 'damage-miss');
          }
        }, delay);
      });
    }

    onComplete && setTimeout(onComplete, 700);
  }

  // ─── Aura reduce_cost ──────────────────────────────────────────────────────

  function playReduceCostAnimation(hexX, hexY) {
    const center = getHexCenter(hexX, hexY);
    if (!center) return;
    const el = createEl('div', 'cost-reduction-aura', {
      left:   center.x + 'px',
      top:    center.y + 'px',
      width:  '200px',
      height: '200px',
    });
    removeAfter(el, 900);
    floatingText(center.x, center.y - 20, '⭐ Commandement', 'damage-heal');
  }

  // ─── Flash double_attack ───────────────────────────────────────────────────

  function playDoubleAttackAnimation(hexX, hexY) {
    const center = getHexCenter(hexX, hexY);
    if (!center) return;
    const el = createEl('div', 'double-attack-flash', {
      left: center.x + 'px', top: center.y + 'px',
      width: '120px', height: '120px',
    });
    removeAfter(el, 500);
    floatingText(center.x, center.y - 20, '⚡ DOUBLE', 'damage-hit');
  }

  // ─── Spawn unité (renforts) ────────────────────────────────────────────────

  function playSpawnAnimation(hexX, hexY) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const wrapper = mapEl.querySelector(`.hex-wrapper[data-x="${hexX}"][data-y="${hexY}"]`);
    if (!wrapper) return;
    const unit = wrapper.querySelector('.unit');
    if (!unit) return;

    // Forcer opacity à 0 via classe, pas inline, pour que l'animation puisse l'override
    unit.classList.add('unit-spawning');
    setTimeout(() => {
      unit.classList.remove('unit-spawning');
      unit.style.opacity = ''; // nettoyer tout résidu inline
    }, 650);

    const center = getHexCenter(hexX, hexY);
    if (center) {
      spawnParticles(center.x, center.y, 8, '#4a90e2', 30, 500);
      floatingText(center.x, center.y - 30, '⬇ Renforts', 'damage-heal');
    }
  }

  // ─── Mouvement hex par hex ─────────────────────────────────────────────────

/**
   * Anime une unité qui se déplace le long d'un chemin hex par hex.
   * Clone visuellement l'unité pour l'animation — le DOM réel reste en place.
   * @param {Array}    path        [{x,y}, ...] cases du chemin (départ inclus)
   * @param {function} onComplete  appelé quand l'animation est terminée
   */
  function playMoveAnimation(path, onComplete) {
    if (!path || path.length < 2) { onComplete && onComplete(); return; }
    _animateAlongPath(path, 'move', onComplete);
  }

  /**
   * Anime une retraite (chemin forcé, couleur différente).
   * @param {number} fromX, fromY  position de départ (grille)
   * @param {number} toX, toY      position d'arrivée (grille)
   * @param {function} onComplete
   */
  function playRetreatAnimation(fromX, fromY, toX, toY, onComplete) {
    _animateAlongPath([{x: fromX, y: fromY}, {x: toX, y: toY}], 'retreat', onComplete);
  }

  /**
   * Moteur commun d'animation de déplacement.
   * Crée un clone flottant de l'unité et le déplace case par case avec trail.
   */
  function _animateAlongPath(path, mode, onComplete) {
    const mapEl = document.getElementById('map');
    if (!mapEl) { onComplete && onComplete(); return; }

    const startWrapper = mapEl.querySelector(`.hex-wrapper[data-x="${path[0].x}"][data-y="${path[0].y}"]`);
    if (!startWrapper) { onComplete && onComplete(); return; }
    const srcUnit = startWrapper.querySelector('.unit');
    if (!srcUnit) { onComplete && onComplete(); return; }

    // Masquer l'unité source pendant l'animation
    srcUnit.style.visibility = 'hidden';

    // Créer un clone flottant positionné en coordonnées viewport
    const srcRect = srcUnit.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = srcUnit.className;
    clone.innerHTML = srcUnit.innerHTML;
    // Style de base calqué sur l'original
    Object.assign(clone.style, {
      position:   'fixed',
      left:       srcRect.left + 'px',
      top:        srcRect.top  + 'px',
      width:      srcRect.width  + 'px',
      height:     srcRect.height + 'px',
      margin:     '0',
      zIndex:     '8000',
      pointerEvents: 'none',
      transition: 'left 0.18s ease-in-out, top 0.18s ease-in-out',
      // Teinte rougeâtre pour la retraite
      filter: mode === 'retreat' ? 'hue-rotate(180deg) brightness(1.3)' : '',
    });
    document.body.appendChild(clone);

    const trailColor = mode === 'retreat' ? 'rgba(255,80,80,0.55)' : 'rgba(255,220,100,0.5)';
    let step = 0;

    function nextStep() {
      if (step >= path.length - 1) {
        // Fin : supprimer clone, restaurer l'unité originale
        clone.parentNode && clone.parentNode.removeChild(clone);
        srcUnit.style.visibility = '';
        onComplete && onComplete();
        return;
      }
      step++;
      const nextWrapper = mapEl.querySelector(`.hex-wrapper[data-x="${path[step].x}"][data-y="${path[step].y}"]`);
      if (!nextWrapper) {
        clone.parentNode && clone.parentNode.removeChild(clone);
        srcUnit.style.visibility = '';
        onComplete && onComplete();
        return;
      }

      const nextRect = nextWrapper.getBoundingClientRect();
      const destLeft = nextRect.left + (nextRect.width  - srcRect.width)  / 2;
      const destTop  = nextRect.top  + (nextRect.height - srcRect.height) / 2;

      // Trail : petite particule à la position courante avant de bouger
      const curLeft = parseFloat(clone.style.left);
      const curTop  = parseFloat(clone.style.top);
      _spawnMoveTrail(
        curLeft + srcRect.width  / 2,
        curTop  + srcRect.height / 2,
        trailColor
      );

      // Déplacer le clone
      clone.style.left = destLeft + 'px';
      clone.style.top  = destTop  + 'px';

      setTimeout(nextStep, 210);
    }

    nextStep();
  }

  /** Particule traînée lors du mouvement */
  function _spawnMoveTrail(cx, cy, color) {
    const size = 8 + Math.random() * 6;
    const el = createEl('div', 'impact-particle', {
      left:      cx + 'px',
      top:       cy + 'px',
      width:     size + 'px',
      height:    size + 'px',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      borderRadius: '50%',
    });
    el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.8 },
      { transform: 'translate(-50%,-50%) scale(0)',  opacity: 0   }
    ], { duration: 350, easing: 'ease-out', fill: 'forwards' });
    removeAfter(el, 400);
  }

  // ─── Fade out unité (avant téléportation / retraite forcée) ────────────────

  function playDespawnAnimation(hexX, hexY, onComplete) {
    const mapEl = document.getElementById('map');
    if (!mapEl) { onComplete && onComplete(); return; }
    const wrapper = mapEl.querySelector(`.hex-wrapper[data-x="${hexX}"][data-y="${hexY}"]`);
    if (!wrapper) { onComplete && onComplete(); return; }
    const unit = wrapper.querySelector('.unit');
    if (!unit)    { onComplete && onComplete(); return; }

    unit.classList.add('unit-despawn');
    setTimeout(() => { onComplete && onComplete(); }, 350);
  }

  // ─── Effets d'environnement ────────────────────────────────────────────────

  /**
   * Ajoute des particules passives sur les hexagones de type village (fumée)
   * ou rivière/mer (vagues). À appeler après refreshDisplay().
   */
  function applyEnvironmentEffects() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    const wrappers = mapEl.querySelectorAll('.hex-wrapper');
    wrappers.forEach(wrapper => {
      // Évite doublons
      if (wrapper.querySelector('.smoke-particle, .wave-particle')) return;

      const hex = wrapper.querySelector('.hex');
      if (!hex) return;

      const terrain = wrapper.dataset.terrain || '';

      if (terrain === 'village' || terrain === 'barrage') {
        // 2-3 particules de fumée par hex village
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const p = document.createElement('div');
          p.className = 'smoke-particle';
          const size = 6 + Math.random() * 8;
          const delay = Math.random() * 3;
          const duration = 2.5 + Math.random() * 2;
          const dx = (Math.random() - 0.5) * 20;
          Object.assign(p.style, {
            width: size + 'px', height: size + 'px',
            left: (20 + Math.random() * 30) + 'px',
            top:  (20 + Math.random() * 20) + 'px',
            '--smoke-duration': duration + 's',
            '--smoke-dx': dx + 'px',
            animationDelay: delay + 's',
          });
          hex.appendChild(p);
        }
      }

      if (terrain === 'riviere' || terrain === 'mer') {
        const count = 2;
        for (let i = 0; i < count; i++) {
          const p = document.createElement('div');
          p.className = 'wave-particle';
          const size = 10 + Math.random() * 15;
          const delay = Math.random() * 2;
          const duration = 1.5 + Math.random() * 1;
          Object.assign(p.style, {
            width: size + 'px', height: size + 'px',
            left: (15 + Math.random() * 35) + 'px',
            top:  (15 + Math.random() * 25) + 'px',
            '--wave-duration': duration + 's',
            animationDelay: delay + 's',
          });
          hex.appendChild(p);
        }
      }
    });
  }

  // ─── API publique ──────────────────────────────────────────────────────────

  return {
    playAttackAnimation,
    playAreaDamageAnimation,
    playReduceCostAnimation,
    playDoubleAttackAnimation,
    playSpawnAnimation,
    playMoveAnimation,
    playRetreatAnimation,
    playDespawnAnimation,
    applyEnvironmentEffects,
    floatingText,
    hexFlash,
    unitShake,
    explosion,
    getHexCenter,
  };

})();

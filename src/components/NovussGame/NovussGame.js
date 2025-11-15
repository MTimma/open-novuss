import Phaser from 'phaser';

const BOARD_SIZE = 820;
const WALL_THICKNESS = 34;
const POCKET_RADIUS = 40;
const DISC_RADIUS = 18;
const STRIKER_RADIUS = 24;
const MAX_PULL_DISTANCE = 260;
const POWER_MULTIPLIER = 0.24;
const STRIKER_SLIDE_SPEED = 420;

const colorToNumber = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

class NovussScene extends Phaser.Scene {
  constructor({ uiBridge } = {}) {
    super('NovussScene');
    this.uiBridge = uiBridge;
    this.scores = { light: 0, dark: 0 };
    this.players = [
      { id: 0, label: 'Player 1', target: 'light' },
      { id: 1, label: 'Player 2', target: 'dark' },
    ];
    this.currentPlayerIndex = 0;
    this.discs = [];
    this.pocketSensors = [];
    this.canShoot = false;
    this.turnInProgress = false;
    this.didScoreThisTurn = false;
    this.pendingFoul = false;
    this.strikerPocketed = false;
    this.aimGraphics = null;
  }

  preload() {
    this.createDiscTexture('disc-light', '#f7e7c4', '#b98552');
    this.createDiscTexture('disc-dark', '#3d3d3d', '#c9c9c9');
    this.createDiscTexture('disc-striker', '#f5f1da', '#9c1b39');
  }

  create() {
    this.cameras.main.setBackgroundColor('#040a0e');
    this.boardCenter = {
      x: this.scale.width / 2,
      y: this.scale.height / 2,
    };

    this.aimGraphics = this.add.graphics();
    this.aimGraphics.depth = 10;

    this.createTableSurface();
    this.createPocketSensors();
    this.createPucks();
    this.createStriker();
    this.configureWorldBounds();
    this.setupControls();
    this.registerCollisionHandlers();
    this.prepareTurn();
  }

  update(_, delta) {
    this.updateStrikerSlide(delta);
    if (this.turnInProgress && this.areBodiesResting()) {
      this.finishTurn();
    }
  }

  configureWorldBounds() {
    const playableSize = BOARD_SIZE - WALL_THICKNESS * 2;
    this.matter.world.setBounds(
      this.boardCenter.x - playableSize / 2,
      this.boardCenter.y - playableSize / 2,
      playableSize,
      playableSize,
      WALL_THICKNESS
    );
  }

  createTableSurface() {
    const rail = this.add.rectangle(
      this.boardCenter.x,
      this.boardCenter.y,
      BOARD_SIZE + WALL_THICKNESS * 2,
      BOARD_SIZE + WALL_THICKNESS * 2,
      colorToNumber('#442b10'),
      1
    );
    rail.setStrokeStyle(6, colorToNumber('#2e1b08'), 1);

    const playArea = this.add.rectangle(
      this.boardCenter.x,
      this.boardCenter.y,
      BOARD_SIZE,
      BOARD_SIZE,
      colorToNumber('#0f3a32'),
      1
    );
    playArea.setStrokeStyle(4, colorToNumber('#a57c51'), 0.8);

    this.drawGuideLines();
    this.drawPocketDecor();
  }

  drawGuideLines() {
    const g = this.add.graphics();
    g.lineStyle(2, colorToNumber('#d9b486'), 0.4);
    const offset = BOARD_SIZE / 2 - 120;
    g.beginPath();
    g.moveTo(this.boardCenter.x - offset, this.boardCenter.y + offset);
    g.lineTo(this.boardCenter.x + offset, this.boardCenter.y + offset);
    g.moveTo(this.boardCenter.x - offset, this.boardCenter.y - offset);
    g.lineTo(this.boardCenter.x + offset, this.boardCenter.y - offset);
    g.moveTo(this.boardCenter.x - offset, this.boardCenter.y - offset);
    g.lineTo(this.boardCenter.x - offset, this.boardCenter.y + offset);
    g.moveTo(this.boardCenter.x + offset, this.boardCenter.y - offset);
    g.lineTo(this.boardCenter.x + offset, this.boardCenter.y + offset);
    g.strokePath();

    const diagonals = this.add.graphics();
    diagonals.lineStyle(1.2, colorToNumber('#c6a073'), 0.35);
    const diagOffset = BOARD_SIZE / 2 - 70;
    diagonals.beginPath();
    diagonals.moveTo(
      this.boardCenter.x - diagOffset,
      this.boardCenter.y - diagOffset
    );
    diagonals.lineTo(
      this.boardCenter.x + diagOffset,
      this.boardCenter.y + diagOffset
    );
    diagonals.moveTo(
      this.boardCenter.x + diagOffset,
      this.boardCenter.y - diagOffset
    );
    diagonals.lineTo(
      this.boardCenter.x - diagOffset,
      this.boardCenter.y + diagOffset
    );
    diagonals.strokePath();
  }

  drawPocketDecor() {
    const pocketAngles = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: 1, y: 1 },
    ];
    pocketAngles.forEach((corner) => {
      const cx = this.boardCenter.x + corner.x * (BOARD_SIZE / 2 - 20);
      const cy = this.boardCenter.y + corner.y * (BOARD_SIZE / 2 - 20);
      const circle = this.add.circle(
        cx,
        cy,
        18,
        colorToNumber('#093026'),
        1
      );
      circle.setStrokeStyle(2, colorToNumber('#d7b27e'), 0.6);
    });
  }

  createPocketSensors() {
    const offsets = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: 1, y: 1 },
    ];

    offsets.forEach(({ x, y }) => {
      const px = this.boardCenter.x + x * (BOARD_SIZE / 2 - 34);
      const py = this.boardCenter.y + y * (BOARD_SIZE / 2 - 34);
      this.add.circle(px, py, POCKET_RADIUS - 6, colorToNumber('#050505'), 1);

      const sensor = this.matter.add.circle(px, py, POCKET_RADIUS, {
        isStatic: true,
        isSensor: true,
        label: 'pocket',
      });
      this.pocketSensors.push(sensor);
    });
  }

  createPucks() {
    const spacing = 62;
    const offsets = [-1.5, -0.5, 0.5, 1.5];
    let index = 0;

    offsets.forEach((row) => {
      offsets.forEach((col) => {
        const team = index % 2 === 0 ? 'light' : 'dark';
        const puck = this.createDisc(
          this.boardCenter.x + col * spacing,
          this.boardCenter.y + row * spacing,
          team
        );
        this.discs.push(puck);
        index += 1;
      });
    });
  }

  createDisc(x, y, team) {
    const texture = team === 'light' ? 'disc-light' : 'disc-dark';
    const disc = this.matter.add.image(x, y, texture);
    disc.setCircle(DISC_RADIUS);
    disc.setDisplaySize(DISC_RADIUS * 2.2, DISC_RADIUS * 2.2);
    disc.setOrigin(0.5);
    disc.setFriction(0.005);
    disc.setFrictionAir(0.02);
    disc.setBounce(0.98);
    disc.setDensity(0.0025);
    disc.setData('type', 'puck');
    disc.setData('team', team);
    disc.setSleepEvents(true, true);
    return disc;
  }

  createStriker() {
    this.strikerHomeY =
      this.boardCenter.y + BOARD_SIZE / 2 - (WALL_THICKNESS + 70);
    this.striker = this.matter.add.image(
      this.boardCenter.x,
      this.strikerHomeY,
      'disc-striker'
    );
    this.striker.setCircle(STRIKER_RADIUS);
    this.striker.setDisplaySize(STRIKER_RADIUS * 2.2, STRIKER_RADIUS * 2.2);
    this.striker.setFriction(0.003);
    this.striker.setFrictionAir(0.018);
    this.striker.setBounce(0.99);
    this.striker.setDensity(0.0035);
    this.striker.setData('type', 'striker');
    this.striker.setIgnoreGravity(true);
    this.striker.setStatic(true);
  }

  setupControls() {
    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.slideKeys = this.input.keyboard.addKeys({
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.input.on('pointerdown', (pointer) => {
      if (!this.canShoot || pointer.rightButtonDown()) return;
      this.beginAim(pointer);
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.isAiming) return;
      this.updateAim(pointer);
    });

    this.input.on('pointerup', (pointer) => {
      if (!this.isAiming) return;
      this.releaseShot(pointer);
    });
  }

  registerCollisionHandlers() {
    this.matter.world.on('collisionstart', (event) => {
      event.pairs.forEach((pair) => {
        const bodies = [pair.bodyA, pair.bodyB];
        const sensor = bodies.find((body) => body.label === 'pocket');
        if (!sensor) return;

        const puckBody = bodies.find(
          (body) =>
            body.gameObject && body.gameObject.getData('type') !== undefined
        );
        if (!puckBody || !puckBody.gameObject) return;

        this.onPocket(puckBody.gameObject);
      });
    });
  }

  beginAim(pointer) {
    if (!this.striker.active) return;
    this.isAiming = true;
    this.aimStrength = 0;
    this.aimDirection = new Phaser.Math.Vector2();
    this.aimGraphics.clear();
    this.updateAim(pointer);
    this.setStatus('Drag opposite the shot direction, release to strike.');
  }

  updateAim(pointer) {
    const strikerPos = new Phaser.Math.Vector2(
      this.striker.x,
      this.striker.y
    );
    const pointerPos = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
    const dragVec = strikerPos.clone().subtract(pointerPos);
    const distance = Phaser.Math.Clamp(dragVec.length(), 0, MAX_PULL_DISTANCE);
    this.aimStrength = distance;
    this.aimDirection = dragVec.normalize();

    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(3, colorToNumber('#f5d67b'), 0.9);
    this.aimGraphics.beginPath();
    this.aimGraphics.moveTo(strikerPos.x, strikerPos.y);
    const arrow = strikerPos.clone().add(
      this.aimDirection.clone().scale(distance)
    );
    this.aimGraphics.lineTo(arrow.x, arrow.y);
    this.aimGraphics.strokePath();

    this.aimGraphics.lineStyle(6, colorToNumber('#f0733d'), 0.7);
    this.aimGraphics.strokeCircle(strikerPos.x, strikerPos.y, STRIKER_RADIUS);

    const percent = Phaser.Math.RoundTo(
      (distance / MAX_PULL_DISTANCE) * 100,
      0
    );
    this.setPower(percent);
  }

  releaseShot() {
    this.isAiming = false;
    this.aimGraphics.clear();
    this.setPower(0);
    if (this.aimStrength < 8) {
      this.setStatus('Shot cancelled — pull further back for power.');
      return;
    }

    const velocity = this.aimDirection
      .clone()
      .scale(this.aimStrength * POWER_MULTIPLIER * 0.6);

    this.canShoot = false;
    this.turnInProgress = true;
    this.striker.setStatic(false);
    this.striker.setVelocity(velocity.x, velocity.y);
    this.striker.setAngularVelocity(0);
    this.setStatus('Shot in progress...');
  }

  onPocket(gameObject) {
    const type = gameObject.getData('type');
    if (type === 'puck') {
      const team = gameObject.getData('team');
      gameObject.setActive(false);
      gameObject.setVisible(false);
      this.discs = this.discs.filter((disc) => disc !== gameObject);
      gameObject.destroy();
      this.scores[team] += 1;
      this.didScoreThisTurn =
        this.didScoreThisTurn || team === this.activePlayer().target;
      this.updateScoreboard();
      this.checkForWin();
    } else if (type === 'striker') {
      if (this.strikerPocketed) return;
      this.pendingFoul = true;
      this.strikerPocketed = true;
      this.striker.setActive(false);
      this.striker.setVisible(false);
      this.striker.setVelocity(0, 0);
      this.setStatus('Foul: striker scratched. Turn will pass.');
    }
  }

  prepareTurn() {
    this.canShoot = true;
    this.turnInProgress = false;
    this.didScoreThisTurn = false;
    this.pendingFoul = false;
    this.strikerPocketed = false;
    this.resetStrikerPosition();
    this.setTurnLabel();
    this.setStatus(
      'Use ←/→ or A/D to slide the striker. Drag backward to aim, release to shoot.'
    );
  }

  resetStrikerPosition() {
    if (!this.striker) return;
    this.striker.setPosition(this.boardCenter.x, this.strikerHomeY);
    this.striker.setVelocity(0, 0);
    this.striker.setAngularVelocity(0);
    this.striker.setStatic(true);
    this.striker.setActive(true);
    this.striker.setVisible(true);
  }

  finishTurn() {
    if (this.pendingFoul || !this.didScoreThisTurn) {
      this.advancePlayer();
    }
    this.prepareTurn();
  }

  advancePlayer() {
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.players.length;
  }

  activePlayer() {
    return this.players[this.currentPlayerIndex];
  }

  areBodiesResting() {
    const threshold = 0.18;
    const strikerMoving =
      this.striker.active &&
      !this.striker.body.isStatic &&
      this.striker.body.speed > threshold;
    const discsMoving = this.discs.some(
      (disc) => disc.active && disc.body.speed > threshold
    );
    return !strikerMoving && !discsMoving;
  }

  updateStrikerSlide(delta) {
    if (!this.canShoot || !this.striker.body?.isStatic) return;
    const deltaSeconds = delta / 1000;
    let direction = 0;
    if (this.cursorKeys.left.isDown || this.slideKeys.A.isDown) {
      direction -= 1;
    }
    if (this.cursorKeys.right.isDown || this.slideKeys.D.isDown) {
      direction += 1;
    }
    if (direction === 0) return;
    const deltaX = STRIKER_SLIDE_SPEED * deltaSeconds * direction;
    const maxOffset = BOARD_SIZE / 2 - (WALL_THICKNESS + 70);
    const newX = Phaser.Math.Clamp(
      this.striker.x + deltaX,
      this.boardCenter.x - maxOffset,
      this.boardCenter.x + maxOffset
    );
    this.striker.setPosition(newX, this.strikerHomeY);
  }

  updateScoreboard() {
    this.uiBridge?.updateScore?.({
      light: this.scores.light,
      dark: this.scores.dark,
    });
  }

  checkForWin() {
    const target = this.activePlayer().target;
    const needed = this.discs.filter(
      (disc) => disc.getData('team') === target
    ).length;
    const totalCaptured = this.scores[target];
    if (totalCaptured >= 8 || needed === 0) {
      this.setStatus(`${this.activePlayer().label} cleared their color!`);
    }
  }

  setTurnLabel() {
    const player = this.activePlayer();
    this.uiBridge?.setTurn?.(`${player.label} (${player.target})`);
  }

  setStatus(message) {
    this.uiBridge?.setStatus?.(message);
  }

  setPower(percent) {
    this.uiBridge?.setPower?.(Phaser.Math.Clamp(percent, 0, 100));
  }

  createDiscTexture(key, fill, stroke) {
    if (this.textures.exists(key)) return;
    const size = 256;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(colorToNumber(fill), 1);
    g.fillCircle(size / 2, size / 2, size / 2 - 12);
    g.lineStyle(18, colorToNumber(stroke), 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 18);
    g.lineStyle(6, colorToNumber('#000000'), 0.25);
    g.strokeCircle(size / 2, size / 2, size / 2 - 42);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}

export const mountNovussGame = (hostElement) => {
  if (!hostElement) {
    throw new Error('A mount element is required for Novuss.');
  }

  hostElement.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'novuss-wrapper';

  const stage = document.createElement('div');
  stage.className = 'novuss-stage';

  const panel = document.createElement('div');
  panel.className = 'novuss-panel';

  const title = document.createElement('h1');
  title.textContent = 'Novuss Table';

  const turnLabel = document.createElement('div');
  turnLabel.className = 'novuss-turn';

  const status = document.createElement('p');
  status.className = 'novuss-status';

  const scoreBlock = document.createElement('div');
  scoreBlock.className = 'novuss-scoreboard';
  scoreBlock.innerHTML = `
    <div class="novuss-score novuss-score--light">
      <span>Light discs</span>
      <strong data-score-light>0</strong>
    </div>
    <div class="novuss-score novuss-score--dark">
      <span>Dark discs</span>
      <strong data-score-dark>0</strong>
    </div>
  `;

  const powerBlock = document.createElement('div');
  powerBlock.className = 'novuss-power';
  powerBlock.innerHTML = `
    <div class="novuss-power__label">
      Shot Power
      <span data-power-value>0%</span>
    </div>
    <div class="novuss-power__meter">
      <div class="novuss-power__fill" data-power-fill></div>
    </div>
  `;

  const tips = document.createElement('div');
  tips.className = 'novuss-tips';
  tips.innerHTML = `
    <p>Controls</p>
    <ul>
      <li>Use ←/→ or A/D while aiming to slide the striker.</li>
      <li>Drag from the striker opposite the shot direction, release to strike.</li>
      <li>Pocket all discs of your color to win. Avoid scratching the striker.</li>
    </ul>
  `;

  panel.append(title, turnLabel, status, scoreBlock, powerBlock, tips);
  wrapper.append(stage, panel);
  hostElement.appendChild(wrapper);

  const uiBridge = {
    setTurn: (value) => {
      turnLabel.textContent = value;
    },
    setStatus: (value) => {
      status.textContent = value;
    },
    updateScore: ({ light, dark }) => {
      const lightNode = scoreBlock.querySelector('[data-score-light]');
      const darkNode = scoreBlock.querySelector('[data-score-dark]');
      if (lightNode) lightNode.textContent = light;
      if (darkNode) darkNode.textContent = dark;
    },
    setPower: (percent) => {
      const fill = powerBlock.querySelector('[data-power-fill]');
      const value = powerBlock.querySelector('[data-power-value]');
      if (fill) fill.style.width = `${percent}%`;
      if (value) value.textContent = `${Math.round(percent)}%`;
    },
  };

  const novussScene = new NovussScene({ uiBridge });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: '#020508',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 960,
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { y: 0 },
        enableSleep: true,
        positionIterations: 12,
        velocityIterations: 10,
      },
    },
    scene: [novussScene],
  });

  return {
    destroy: () => {
      game.destroy(true);
      wrapper.remove();
    },
  };
};

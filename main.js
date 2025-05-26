class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  preload() {
    // Load assets (placeholder for now)
  }

  create() {
    this.HUD_HEIGHT = 80;

    // --- Start Screen Title ---
    this.startState = true;
    this.startTitle = this.add.text(
      this.game.config.width / 2,
      this.game.config.height / 2 - 60,
      "Return to Mars",
      { font: '56px Arial', fill: '#222', fontStyle: 'bold' }
    ).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: this.startTitle,
      alpha: 1,
      scale: { from: 0.7, to: 1 },
      duration: 800,
      ease: 'Power2',
    });

    // --- HUD: new layout ---
    const pad = 24;
    let hudY = this.HUD_HEIGHT / 2;
    // Level and Floor: left-aligned, same line
    const smallFont = { font: '18px Arial', fill: '#222', align: 'left' };
    this.levelText = this.add.text(pad, hudY, 'Level: 1', smallFont).setOrigin(0, 0.5);
    this.floorText = this.add.text(0, hudY, 'Floor: 1 / 6', smallFont).setOrigin(0, 0.5);
    // Score: center
    this.scoreText = this.add.text(this.game.config.width / 2, hudY, 'Score: 0', { font: '24px Arial', fill: '#222', align: 'center' }).setOrigin(0.5, 0.5);
    // High score: right-aligned
    this.highScore = parseInt(localStorage.getItem('spysReturnHighScore')) || 0;
    this.highScoreText = this.add.text(this.game.config.width - pad, hudY, 'High Score: ' + this.highScore, { font: '24px Arial', fill: '#222', align: 'right' }).setOrigin(1, 0.5);

    // Position Level and Floor next to each other, left side
    this.levelText.x = pad;
    this.floorText.x = pad + this.levelText.width + pad / 2;
    this.levelText.y = hudY;
    this.floorText.y = hudY;
    // Score stays centered
    this.scoreText.x = this.game.config.width / 2;
    this.scoreText.y = hudY;
    // High score stays at right
    this.highScoreText.x = this.game.config.width - pad;
    this.highScoreText.y = hudY;

    // --- Gameplay Area Offset ---
    // Level/floor setup
    this.level = 1;
    this.floor = 0;
    this.floorsPerLevel = 6;
    this.floorHeight = 100;
    this.levelBoost = 20;
    this.floorBoost = 5;

    // Score setup
    this.score = 0;
    this.floorPoints = 50;
    this.levelBonus = 100;

    // Distance-based score accumulation
    this.distanceTraveled = 0;
    this.movementScoreRate = 1;
    this.movementScoreThreshold = 10;
    this.lastPlayerX = 0;

    // Player setup (Y offset by HUD_HEIGHT)
    this.direction = 'right';
    this.playerActualDirection = null;
    this.player = this.add.rectangle(0 + 30, this.getFloorY(0), 60, 30, 0x0077ff);
    this.playerSpeed = 200;
    this.playerPaused = true;
    this.justCrossed = false;
    this.setPlayerPosition();

    // Elevators setup
    this.createElevators();

    // Debug Mode Setup
    this.debugMode = false;
    this.debugGraphics = this.add.graphics(); // Create graphics layer for debug visuals

    // Invulnerability Setup
    this.invulnerable = false;
    this.invulnerabilityDuration = 300; // milliseconds
    this.invulnerabilityTimer = null;
    this.originalPlayerColor = 0x0077ff; // Matches player creation color
    this.invulnerablePlayerColor = 0xffff00; // Yellow for invulnerability tint

    // Input for pausing/resuming
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.spaceKey.on('down', () => {
      if (this.startState) {
        // Hide start title and begin game
        this.startState = false;
        this.tweens.add({
          targets: this.startTitle,
          alpha: 0,
          scale: 0.7,
          duration: 400,
          ease: 'Power2',
          onComplete: () => this.startTitle.setVisible(false)
        });
        this.playerPaused = false;
        return;
      }
      if (this.gameOver) {
        this.resetGame();
      }
      // Removed: else if (this.playerPaused) ...
      // Removed: else { this.playerPaused = true; }
    });

    this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.rKey.on('down', () => {
      if (this.gameOver) {
        this.resetGame();
      }
    });

    this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.dKey.on('down', () => {
      this.debugMode = !this.debugMode;
      if (!this.debugMode) {
        this.debugGraphics.clear(); // Clear graphics when turning off debug mode
      }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.moving = false; // Player starts stationary, waits for first input on a floor
    // Remove: this.playerPaused = true; // Start paused

    this.gameOver = false;
    this.gameOverText = null;

    this.highScoreText.setInteractive({ useHandCursor: true });
    this.highScoreText.on('pointerdown', (pointer) => {
      if (pointer && pointer.event && pointer.event.detail === 2) { // double click
        this.highScore = 0;
        localStorage.setItem('spysReturnHighScore', '0');
        this.highScoreText.setText('High Score: 0');
      }
    });
  }

  getFloorY(floorIdx) {
    // Returns the Y position for a given floor, offset by HUD_HEIGHT
    return this.game.config.height - ((floorIdx + 1) * this.floorHeight) + this.HUD_HEIGHT;
  }

  setPlayerPosition() {
    // Set player Y based on floor, X based on direction, respecting HUD_HEIGHT
    this.player.y = this.getFloorY(this.floor);
    if (this.direction === 'right') {
      this.player.x = this.player.width / 2;
    } else {
      this.player.x = this.game.config.width - this.player.width / 2;
    }
    this.lastPlayerX = this.player.x;
    this.distanceTraveled = 0;
  }

  createElevators() {
    if (this.elevators) {
      for (const elevator of this.elevators) {
        elevator.rect.destroy();
      }
    }
    this.elevators = [];
    const elevatorWidth = 20;
    const elevatorHeight = 60;
    const numberOfElevators = 6;

    // Define movement limits for elevators (below HUD bar)
    const screenMinY = this.HUD_HEIGHT + elevatorHeight / 2;
    const screenMaxY = this.game.config.height - elevatorHeight / 2;
    const amplitude = (screenMaxY - screenMinY) / 2;
    const centerY = (screenMinY + screenMaxY) / 2;

    const spacingX = this.game.config.width / (numberOfElevators + 1);

    for (let i = 0; i < numberOfElevators; i++) {
      const elevatorX = spacingX * (i + 1);
      const baseSpeed = Phaser.Math.Between(80, 160);
      const speed = baseSpeed + (this.level * this.levelBoost) + (i * this.floorBoost);
      const phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const initialY = centerY;
      const rect = this.add.rectangle(elevatorX, initialY, elevatorWidth, elevatorHeight, 0xff4444);
      this.elevators.push({
        rect,
        speed,
        phase,
        centerY,
        amplitude,
        id: i
      });
    }
  }

  activateInvulnerability() {
    this.invulnerable = true;
    this.player.setFillStyle(this.invulnerablePlayerColor);

    if (this.invulnerabilityTimer) {
      this.invulnerabilityTimer.remove(false); // Remove existing timer if any, false to prevent its onComplete
    }

    this.invulnerabilityTimer = this.time.delayedCall(this.invulnerabilityDuration, () => {
      this.invulnerable = false;
      this.player.setFillStyle(this.originalPlayerColor);
      this.invulnerabilityTimer = null; // Clear the timer reference
    }, [], this);
  }

  update(time, delta) {
    if (this.startState) return; // Pause everything on start screen
    if (this.gameOver) return;

    // Elevators movement (independent, always move)
    // Moved this block before the playerPaused check so elevators always update
    for (const elevator of this.elevators) {
      // Use a sine wave for smooth, independent, continuous up/down motion
      elevator.rect.y = elevator.centerY + elevator.amplitude * Math.sin((time / 1000) * (elevator.speed / 100) + elevator.phase);
    }

    // Debug mode: Draw hitboxes
    this.debugGraphics.clear(); // Clear previous frame's debug drawings
    if (this.debugMode) {
      this.debugGraphics.lineStyle(2, 0x00ff00, 1); // Green lines for hitboxes

      // Player hitbox
      const playerBounds = this.player.getBounds();
      this.debugGraphics.strokeRectShape(playerBounds);

      // Elevators hitboxes
      for (const elevator of this.elevators) {
        const elevatorBounds = elevator.rect.getBounds();
        this.debugGraphics.strokeRectShape(elevatorBounds);
      }
    }

    // Player input sets the actual movement direction
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      if (!this.moving) {
        this.initialDirection = 'left';
        this.brokeBonusStreak = false;
      } else if (this.initialDirection !== 'left') {
        this.brokeBonusStreak = true;
      }
      this.playerActualDirection = 'left';
      this.moving = true;
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      if (!this.moving) {
        this.initialDirection = 'right';
        this.brokeBonusStreak = false;
      } else if (this.initialDirection !== 'right') {
        this.brokeBonusStreak = true;
      }
      this.playerActualDirection = 'right';
      this.moving = true;
    }

    if (this.playerPaused) return; // Do not move if paused

    if (this.moving && this.playerActualDirection) {
      // const prevX = this.player.x; // Not needed if using this.lastPlayerX correctly
      const moveSign = (this.playerActualDirection === 'right' ? 1 : -1);
      const moveAmount = this.playerSpeed * (delta / 1000) * moveSign;
      this.player.x += moveAmount;

      // Clamp player to screen bounds
      this.player.x = Phaser.Math.Clamp(this.player.x, this.player.width / 2, this.game.config.width - this.player.width / 2);

      // Distance-based scoring
      if (this.moving) { // Check moving again as it might have just been set by input
        const deltaX = Math.abs(this.player.x - this.lastPlayerX);
        this.distanceTraveled += deltaX;
        
        while (this.distanceTraveled >= this.movementScoreThreshold) {
          this.score += this.movementScoreRate;
          this.updateScoreText(); // Make sure this function exists and updates the UI
          this.distanceTraveled -= this.movementScoreThreshold;
        }
        this.lastPlayerX = this.player.x; // Update lastPlayerX after movement and scoring
      }

      // Check for collisions AFTER player has moved and score for movement is calculated
      if (this.checkCollision()) {
        return; // Game over was triggered, stop further processing this frame
      }

      const atLeftEdge = this.player.x <= this.player.width / 2;
      const atRightEdge = this.player.x >= this.game.config.width - this.player.width / 2;

      // Progression check: only advance if moving in the TARGET direction and hit the TARGET edge
      if (this.playerActualDirection === this.direction) { // Is player moving towards the floor's goal?
        if ((this.direction === 'right' && atRightEdge) || 
            (this.direction === 'left' && atLeftEdge)) {
          this.handleFloorCross(); // This will set this.moving = false and update this.direction
        }
      }
      // If player hits an edge while playerActualDirection !== this.direction (i.e., turned back),
      // clamping handles it, and no floor cross occurs.
    }

    // Elevators movement (independent, always move) <-- This block was moved up
    // for (const elevator of this.elevators) { ... }
  }

  checkCollision() {
    if (!this.moving || this.invulnerable) return false; // Only check collisions if player is actively moving AND not invulnerable

    const playerBounds = this.player.getBounds();
    const playerFloorY = this.player.y;
    const tolerance = 20; // Tolerance for vertical alignment

    for (const elevator of this.elevators) {
      const elevatorCenterY = elevator.rect.y;

      // Check if the elevator is vertically aligned with the player's current floor
      if (Math.abs(elevatorCenterY - playerFloorY) <= tolerance) {
        const elevatorBounds = elevator.rect.getBounds();
        if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, elevatorBounds)) {
          this.triggerGameOver();
          return true; // Collision detected
        }
      }
    }
    return false; // No collision
  }

  triggerGameOver() {
    if (this.gameOver) return; // Already game over

    this.gameOver = true;
    this.moving = false;
    this.playerActualDirection = null;
    this.playerPaused = true; // Stop player input from causing movement

    // Screen Shake
    this.cameras.main.shake(300, 0.015); // Duration 300ms, Intensity 0.015

    // Flash red (concurrently or slightly after shake starts)
    this.cameras.main.flash(300, 255, 0, 0); 

    // Delay Game Over text appearance
    if (this.gameOverText) this.gameOverText.destroy();
    // Ensure text is initially invisible or not created until delay
    this.gameOverText = this.add.text(
      this.game.config.width / 2,
      this.game.config.height / 2,
      'Game Over!\nPress SPACE or R to Restart',
      { font: '36px Arial', fill: '#ff0000', align: 'center' }
    ).setOrigin(0.5).setVisible(false).setDepth(1); // Start invisible, ensure on top

    this.time.delayedCall(300, () => { // Delay matches shake/flash duration
      if (this.gameOverText) { // Check if it wasn't destroyed by a quick reset
        this.gameOverText.setVisible(true);
      }
    }, [], this);
  }

  handleFloorCross() {
    this.moving = false;
    this.playerActualDirection = null;
    this.input.keyboard.resetKeys();
    // --- Floor bonus mechanic ---
    if (this.brokeBonusStreak === false && this.initialDirection !== null) {
      this.score += this.swipeBonus;
      this.updateScoreText();
      // Flash score text and show bonus text near player
      this.tweens.add({
        targets: this.scoreText,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 120,
        yoyo: true,
        ease: 'Power1',
      });
      const bonusText = this.add.text(this.player.x, this.player.y - 40, '+100 Bonus!', { font: '22px Arial', fill: '#00b300', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.tweens.add({
        targets: bonusText,
        y: bonusText.y - 30,
        alpha: 0,
        duration: 700,
        ease: 'Power1',
        onComplete: () => bonusText.destroy()
      });
    }
    const nextFloor = this.floor + 1;
    if (nextFloor >= this.floorsPerLevel) {
      this.score += this.floorPoints;
      this.score += this.levelBonus;
      this.updateScoreText();
      this.level++;
      this.floor = 0;
      this.levelText.setText('Level: ' + this.level);
      this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
      this.direction = 'right';
      this.createElevators();
      this.tweens.add({
        targets: this.player,
        y: -this.player.height / 2 + this.HUD_HEIGHT, // Move off-screen, but respect HUD
        duration: 500,
        ease: 'Power2',
        onComplete: () => {
          this.player.x = this.player.width / 2;
          this.player.y = this.game.config.height + this.player.height / 2;
          this.tweens.add({
            targets: this.player,
            y: this.getFloorY(0),
            duration: 700,
            ease: 'Power2',
            onComplete: () => {
              this.moving = false;
              this.playerActualDirection = null;
              this.lastPlayerX = this.player.x;
              this.distanceTraveled = 0;
              this.activateInvulnerability();
            }
          });
        }
      });
    } else {
      this.score += this.floorPoints;
      this.updateScoreText();
      const newDir = this.direction === 'right' ? 'left' : 'right';
      this.animatePlayerToFloor(nextFloor, newDir);
      this.floor = nextFloor;
      this.floorText.setText('Floor: ' + (this.floor + 1) + ' / ' + this.floorsPerLevel);
      this.direction = newDir;
    }
    // Reset bonus mechanic for next floor
    this.initialDirection = null;
    this.brokeBonusStreak = false;
  }

  animatePlayerToFloor(floor, direction) {
    const newY = this.getFloorY(floor);
    const newX = direction === 'right' ? this.player.width / 2 : this.game.config.width - this.player.width / 2;
    this.tweens.add({
      targets: this.player,
      y: newY,
      x: newX,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.moving = false;
        this.playerActualDirection = null;
        this.lastPlayerX = this.player.x;
        this.distanceTraveled = 0;
        this.activateInvulnerability();
        // Reset bonus mechanic for new floor
        this.initialDirection = null;
        this.brokeBonusStreak = false;
      }
    });
  }

  updateScoreText() {
    this.scoreText.setText('Score: ' + this.score);
    // Optional: Add a subtle pop animation to the score text
    this.tweens.add({
      targets: this.scoreText,
      scaleX: 1.15, // Slightly larger pop
      scaleY: 1.15,
      duration: 100, // Quick animation
      ease: 'Power1',
      yoyo: true, // Automatically returns to original scale
      onStart: () => {
        // Optional: Change color during pop
        // this.scoreText.setFill('#00ff00'); 
      },
      onComplete: () => {
        // Optional: Revert color if changed
        // this.scoreText.setFill('#222'); 
      }
    });

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('spysReturnHighScore', this.highScore);
      this.highScoreText.setText('High Score: ' + this.highScore);
      // Optional: Flash high score text or show "NEW HIGH SCORE!" nearby
      this.tweens.add({
        targets: this.highScoreText,
        alpha: { from: 0.5, to: 1 },
        duration: 150,
        ease: 'Power1',
        yoyo: true,
        repeat: 2 // Flash a few times
      });
    }
  }

  resetGame() {
    if (this.gameOverText) this.gameOverText.destroy();
    this.gameOverText = null; // Ensure it's null so it can be recreated
    this.level = 1;
    this.floor = 0;
    this.score = 0; // Reset score
    this.levelText.setText('Level: 1');
    this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
    this.scoreText.setText('Score: 0'); // Reset score display
    this.highScoreText.setText('High Score: ' + this.highScore); // Ensure high score text is accurate
    this.direction = 'right'; // Target direction for floor 0
    this.playerActualDirection = null; // Reset actual direction
    
    this.setPlayerPosition(); // Position player first, this also sets lastPlayerX and resets distanceTraveled

    this.moving = false; // Wait for input
    this.playerPaused = true; // Start in a paused state, requiring input to move
    this.justCrossed = false; // This seems to be unused

    // Reset invulnerability state specifically before activating it for the new game/reset
    this.invulnerable = false;
    if (this.invulnerabilityTimer) {
      this.invulnerabilityTimer.remove(false);
      this.invulnerabilityTimer = null;
    }
    this.player.setFillStyle(this.originalPlayerColor); // Ensure player color is reset to original

    // distanceTraveled is reset by setPlayerPosition
    // lastPlayerX is set by setPlayerPosition

    this.createElevators();
    this.gameOver = false;
    // this.cameras.main.resetFX(); // Not strictly necessary as flash auto-resets

    this.activateInvulnerability(); // Activate for the start of the game
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#f0f0f0',
  scene: [MainScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  }
};

const game = new Phaser.Game(config);

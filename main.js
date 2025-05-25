class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  preload() {
    // Load assets (placeholder for now)
  }

  create() {
    this.add.text(100, 100, 'Spy’s Return', { font: '32px Arial', fill: '#000' });

    // Level/floor setup
    this.level = 1;
    this.floor = 0;
    this.floorsPerLevel = 6;
    this.floorHeight = 100;
    this.levelBoost = 20;
    this.floorBoost = 5;
    this.levelText = this.add.text(20, 20, 'Level: 1', { font: '24px Arial', fill: '#222' });
    this.floorText = this.add.text(20, 50, 'Floor: 1 / 6', { font: '24px Arial', fill: '#222' });

    // Score setup
    this.score = 0;
    this.floorPoints = 50;
    this.levelBonus = 100;
    this.scoreText = this.add.text(20, 80, 'Score: 0', { font: '24px Arial', fill: '#222'});

    // High Score Setup
    this.highScore = parseInt(localStorage.getItem('spysReturnHighScore')) || 0;
    this.highScoreText = this.add.text(this.game.config.width - 20, 20, 'High Score: ' + this.highScore, { font: '24px Arial', fill: '#222'}).setOrigin(1, 0);

    // Distance-based score accumulation
    this.distanceTraveled = 0;
    this.movementScoreRate = 1; // Points per threshold
    this.movementScoreThreshold = 10; // Pixels before points are added
    this.lastPlayerX = 0; // Will be set properly after player is created/positioned

    // Player setup
    this.direction = 'right'; // Target direction to complete the current floor
    this.playerActualDirection = null; // Direction player is currently moving via input
    this.player = this.add.rectangle(0 + 30, 550, 60, 30, 0x0077ff);
    this.playerSpeed = 200;
    this.playerPaused = true; // Start paused
    this.justCrossed = false;
    this.setPlayerPosition(); // This will also set lastPlayerX initially

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
      if (this.gameOver) {
        this.resetGame();
      } else if (this.playerPaused) {
        this.playerPaused = false;
      } else {
        this.playerPaused = true;
      }
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

    this.gameOver = false;
    this.gameOverText = null;
  }

  setPlayerPosition() {
    // Set player Y based on floor, X based on direction
    this.player.y = 550 - this.floor * this.floorHeight;
    if (this.direction === 'right') {
      this.player.x = this.player.width / 2;
    } else {
      this.player.x = this.game.config.width - this.player.width / 2;
    }
    this.lastPlayerX = this.player.x; // Initialize/reset lastPlayerX
    this.distanceTraveled = 0;      // Reset distance for the new position
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
    const numberOfElevators = 6; // Explicitly 6 elevators

    // Define screen-wide movement limits for elevators
    const screenMinY = elevatorHeight / 2;
    const screenMaxY = this.game.config.height - elevatorHeight / 2;
    const amplitude = (screenMaxY - screenMinY) / 2;
    const centerY = (screenMinY + screenMaxY) / 2;

    // Calculate equal spacing for X positions
    const spacingX = this.game.config.width / (numberOfElevators + 1);

    for (let i = 0; i < numberOfElevators; i++) {
      const elevatorX = spacingX * (i + 1);
      
      // Speed can be influenced by level and an index (i) for variety
      const baseSpeed = Phaser.Math.Between(80, 160);
      const speed = baseSpeed + (this.level * this.levelBoost) + (i * this.floorBoost); // Use 'i' instead of 'floorIdx' for speed variation
      const phase = Phaser.Math.FloatBetween(0, Math.PI * 2); // Random phase for async movement

      // Initial Y position can be randomized or set to centerY for simplicity
      const initialY = centerY; 
      const rect = this.add.rectangle(elevatorX, initialY, elevatorWidth, elevatorHeight, 0xff4444);
      
      this.elevators.push({
        rect,
        speed,
        phase,
        centerY,      // Center of screen-wide oscillation
        amplitude,      // Amplitude for screen-wide oscillation
        // 'floor' property might not be as relevant if elevators are screen-wide and not tied to floor strips
        // but we can keep it if it helps other logic, or remove if not needed.
        // For now, let's use 'i' as an identifier if needed, similar to how floorIdx was used.
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
      this.playerActualDirection = 'left';
      this.moving = true; // Start moving or change direction
      if (this.playerPaused) this.playerPaused = false; // Auto-unpause on first move
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.playerActualDirection = 'right';
      this.moving = true; // Start moving or change direction
      if (this.playerPaused) this.playerPaused = false; // Auto-unpause on first move
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
    this.playerActualDirection = null; // Stop movement and require new input
    this.input.keyboard.resetKeys(); // Prevent stuck movement

    const nextFloor = this.floor + 1;
    if (nextFloor >= this.floorsPerLevel) {
      // Level complete
      this.score += this.floorPoints; // Points for the last floor
      this.score += this.levelBonus;  // Bonus for completing the level
      this.updateScoreText();

      this.level++;
      this.floor = 0; // Reset floor for the new level
      this.levelText.setText('Level: ' + this.level);
      this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel); // Display as Floor 1
      this.direction = 'right'; // First floor of a new level always starts 'right'
      
      this.createElevators(); // Regenerate elevators for the new level difficulty

      // 1. Animate player up and out of canvas
      this.tweens.add({
        targets: this.player,
        y: -this.player.height / 2, // Move completely off-screen (top)
        duration: 500,
        ease: 'Power2',
        onComplete: () => {
          // Player is now off-screen (top)

          // 2. Position player below screen, ready for slide-in
          // X position for the start of the first floor (floor 0, target direction 'right')
          this.player.x = this.player.width / 2; 
          this.player.y = this.game.config.height + this.player.height / 2; // Start below screen

          // 3. Animate player sliding in from bottom to the first floor's starting position
          this.tweens.add({
            targets: this.player,
            y: 550 - (0 * this.floorHeight), // Target Y for floor 0 (the first floor)
            duration: 700, 
            ease: 'Power2',
            onComplete: () => {
              this.moving = false; // Player is in position, wait for new input
              this.playerActualDirection = null;
              this.lastPlayerX = this.player.x; // Update for distance scoring start
              this.distanceTraveled = 0;      // Reset distance for the new floor
              this.activateInvulnerability(); // Activate invulnerability
              // Player will wait for arrow key press to start moving on the new level.
            }
          });
        }
      });
    } else {
      // Advance to the next floor within the current level
      this.score += this.floorPoints;
      this.updateScoreText();

      const newDir = this.direction === 'right' ? 'left' : 'right';
      this.animatePlayerToFloor(nextFloor, newDir); // Animates and then sets this.moving = false
      this.floor = nextFloor;
      this.floorText.setText('Floor: ' + (this.floor + 1) + ' / ' + this.floorsPerLevel);
      this.direction = newDir; // Set target direction for the new floor
    }
  }

  animatePlayerToFloor(floor, direction) {
    const newY = 550 - floor * this.floorHeight;
    const newX = direction === 'right' ? this.player.width / 2 : this.game.config.width - this.player.width / 2;
    this.tweens.add({
      targets: this.player,
      y: newY,
      x: newX,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.moving = false;
        this.playerActualDirection = null; // Require new input for the new floor
        this.lastPlayerX = this.player.x; // Update for distance scoring start
        this.distanceTraveled = 0;      // Reset distance for the new floor
        this.activateInvulnerability(); // Activate invulnerability
        // Wait for user to press arrow key to set direction and start again
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

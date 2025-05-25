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

    // Player setup
    this.direction = 'right'; // Target direction to complete the current floor
    this.playerActualDirection = null; // Direction player is currently moving via input
    this.player = this.add.rectangle(0 + 30, 550, 60, 30, 0x0077ff);
    this.playerSpeed = 200;
    this.playerPaused = true; // Start paused
    this.justCrossed = false;
    this.setPlayerPosition();

    // Elevators setup
    this.createElevators();

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

  update(time, delta) {
    if (this.gameOver) return;

    // Player input sets the actual movement direction
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.playerActualDirection = 'left';
      this.moving = true; // Start moving or change direction
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.playerActualDirection = 'right';
      this.moving = true; // Start moving or change direction
    }

    if (this.moving && this.playerActualDirection) {
      const moveSign = (this.playerActualDirection === 'right' ? 1 : -1);
      const moveAmount = this.playerSpeed * (delta / 1000) * moveSign;
      this.player.x += moveAmount;

      // Clamp player to screen bounds
      this.player.x = Phaser.Math.Clamp(this.player.x, this.player.width / 2, this.game.config.width - this.player.width / 2);

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

    // Elevators movement (independent, always move)
    for (const elevator of this.elevators) {
      // Use a sine wave for smooth, independent, continuous up/down motion
      elevator.rect.y = elevator.centerY + elevator.amplitude * Math.sin((time / 1000) * (elevator.speed / 100) + elevator.phase);
    }
  }

  handleFloorCross() {
    this.moving = false;
    this.input.keyboard.resetKeys(); // Prevent stuck movement
    const nextFloor = this.floor + 1;
    if (nextFloor >= this.floorsPerLevel) {
      // Level complete
      this.level++;
      this.floor = 0;
      this.levelText.setText('Level: ' + this.level);
      this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
      this.direction = 'right';
      this.createElevators();
      this.animatePlayerToFloor(0, 'right');
    } else {
      // Animate player up to next floor
      const newDir = this.direction === 'right' ? 'left' : 'right';
      this.animatePlayerToFloor(nextFloor, newDir);
      this.floor = nextFloor;
      this.floorText.setText('Floor: ' + (this.floor + 1) + ' / ' + this.floorsPerLevel);
      this.direction = newDir;
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
        // Wait for user to press arrow key to set direction and start again
      }
    });
  }

  resetGame() {
    if (this.gameOverText) this.gameOverText.destroy();
    this.level = 1;
    this.floor = 0;
    this.levelText.setText('Level: 1');
    this.floorText.setText('Floor: 1 / ' + this.floorsPerLevel);
    this.direction = 'right'; // Target direction for floor 0
    this.playerActualDirection = null; // Reset actual direction
    this.setPlayerPosition();
    this.moving = false; // Wait for input
    this.justCrossed = false;
    this.createElevators();
    this.gameOver = false;
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

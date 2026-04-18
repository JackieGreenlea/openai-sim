import Phaser from 'phaser';
import {
    defaultCharacterId,
    householdCharacters,
    type HouseholdCharacterId,
} from '../config/characters';

interface CharacterCard {
    background: Phaser.GameObjects.Rectangle;
}

export class StartScene extends Phaser.Scene {
    private enterKey!: Phaser.Input.Keyboard.Key;
    private leftKey!: Phaser.Input.Keyboard.Key;
    private rightKey!: Phaser.Input.Keyboard.Key;
    private tilesetKey!: Phaser.Input.Keyboard.Key;
    private numberKeys: Phaser.Input.Keyboard.Key[] = [];
    private readonly cards: CharacterCard[] = [];
    private selectedIndex = householdCharacters.findIndex(
        (character) => character.id === defaultCharacterId,
    );
    private hasStarted = false;

    constructor() {
        super({ key: 'StartScene' });
    }

    create(): void {
        this.hasStarted = false;
        const { width, height } = this.scale;

        this.add.rectangle(0, 0, width, height, 0x1b1612).setOrigin(0);
        this.add.rectangle(width / 2, height / 2, width - 56, height - 56, 0x2f241b, 0.92)
            .setStrokeStyle(4, 0xd0b38b, 0.65);

        this.add
            .text(width / 2, 92, 'The Happy Home Game', {
                fontFamily: '"Abaddon Bold", sans-serif',
                fontSize: '72px',
                color: '#fff5e8',
                stroke: '#4d3622',
                strokeThickness: 6,
                align: 'center',
            })
            .setOrigin(0.5);

        this.add
            .text(width / 2, 156, 'Pick a character.', {
                fontFamily: '"Abaddon Light", sans-serif',
                fontSize: '26px',
                color: '#f3d8b7',
                align: 'center',
            })
            .setOrigin(0.5);

        const startX = width / 2 - 280;
        const cardSpacing = 280;

        householdCharacters.forEach((character, index) => {
            const x = startX + index * cardSpacing;
            const y = height / 2 + 36;
            const background = this.add
                .rectangle(x, y, 220, 360, 0x46352a, 0.96)
                .setStrokeStyle(3, 0x8e6b4f, 0.85);

            background
                .setInteractive({ useHandCursor: true })
                .on('pointerover', () => {
                    this.selectedIndex = index;
                    this.refreshSelection();
                })
                .on('pointerdown', () => {
                    this.selectedIndex = index;
                    this.refreshSelection();
                    this.startGame(character.id);
                });

            this.add
                .sprite(x, y - 40, character.texture, character.previewFrame)
                .setScale(2.5)
                .setDepth(2);

            this.add
                .text(x, y - 130, character.name, {
                    fontFamily: '"Abaddon Bold", sans-serif',
                    fontSize: '40px',
                    color: '#fffaf4',
                    align: 'center',
                })
                .setOrigin(0.5);

            this.add
                .text(x, y + 112, character.description, {
                    fontFamily: 'monospace',
                    fontSize: '17px',
                    color: '#f5efe7',
                    align: 'center',
                    wordWrap: { width: 170 },
                })
                .setOrigin(0.5);

            this.add
                .text(x, y + 162, `Press ${index + 1}`, {
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    color: '#c9f7d0',
                    align: 'center',
                })
                .setOrigin(0.5);

            this.cards.push({ background });
        });

        this.add
            .text(
                width / 2,
                height - 70,
                'Arrow keys to choose, ENTER to start, or click a card.',
                {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#d1fff0',
                    align: 'center',
                },
            )
            .setOrigin(0.5);

        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error('Keyboard input plugin is not available.');
        }

        this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.tilesetKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
        this.numberKeys = [
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
        ];

        this.refreshSelection();
    }

    update(): void {
        if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
            this.selectedIndex =
                (this.selectedIndex - 1 + householdCharacters.length) % householdCharacters.length;
            this.refreshSelection();
        }

        if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
            this.selectedIndex = (this.selectedIndex + 1) % householdCharacters.length;
            this.refreshSelection();
        }

        const numberSelection = this.numberKeys.findIndex((key) =>
            Phaser.Input.Keyboard.JustDown(key),
        );

        if (numberSelection >= 0) {
            this.selectedIndex = numberSelection;
            this.refreshSelection();
            this.startGame(householdCharacters[numberSelection].id);
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.startGame(householdCharacters[this.selectedIndex].id);
        }

        if (Phaser.Input.Keyboard.JustDown(this.tilesetKey)) {
            this.scene.start('TilesetViewerScene');
        }
    }

    private refreshSelection(): void {
        this.cards.forEach((card, index) => {
            const isSelected = index === this.selectedIndex;
            card.background
                .setFillStyle(isSelected ? 0x6a4d35 : 0x46352a, 0.98)
                .setStrokeStyle(isSelected ? 5 : 3, isSelected ? 0xf2d6a2 : 0x8e6b4f, 0.95)
                .setScale(isSelected ? 1.03 : 1);
        });
    }

    private startGame(selectedCharacterId: HouseholdCharacterId): void {
        if (this.hasStarted) {
            return;
        }

        this.hasStarted = true;
        this.scene.start('MainScene', { selectedCharacterId });
    }
}

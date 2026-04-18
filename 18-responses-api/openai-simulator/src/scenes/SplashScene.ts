import Phaser from 'phaser';

type ProjectCardConfig = {
    id: string;
    label: string;
    subtitle: string;
    password: string;
    action: 'placeholder' | 'start-game';
};

type ProjectCard = {
    background: Phaser.GameObjects.Rectangle;
};

const PROJECTS: ProjectCardConfig[] = [
    {
        id: 'project-1',
        label: 'Project 1',
        subtitle: 'Archive',
        password: 'hello',
        action: 'placeholder',
    },
    {
        id: 'project-2',
        label: 'Project 2',
        subtitle: 'Ollie Valley',
        password: 'Cassie1',
        action: 'placeholder',
    },
    {
        id: 'project-3',
        label: 'Project 3',
        subtitle: 'The Happy Home Game',
        password: 'Collin',
        action: 'start-game',
    },
] as const;

export class SplashScene extends Phaser.Scene {
    private enterKey!: Phaser.Input.Keyboard.Key;
    private leftKey!: Phaser.Input.Keyboard.Key;
    private rightKey!: Phaser.Input.Keyboard.Key;
    private backspaceKey!: Phaser.Input.Keyboard.Key;
    private numberKeys: Phaser.Input.Keyboard.Key[] = [];
    private readonly cards: ProjectCard[] = [];
    private selectedIndex = 2;
    private passwordInput = '';
    private passwordText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'SplashScene' });
    }

    create(): void {
        const { width, height } = this.scale;

        this.add.rectangle(0, 0, width, height, 0x140f20).setOrigin(0);
        this.add
            .rectangle(width / 2, height / 2, width - 56, height - 56, 0x23192f, 0.94)
            .setStrokeStyle(4, 0xcda4e5, 0.55);

        this.add
            .text(width / 2, 86, 'Choose Project', {
                fontFamily: '"Abaddon Bold", sans-serif',
                fontSize: '70px',
                color: '#fff6ff',
                stroke: '#382147',
                strokeThickness: 6,
                align: 'center',
            })
            .setOrigin(0.5);

        this.add
            .text(width / 2, 146, 'Fun little password gate. Pick one and type the password.', {
                fontFamily: '"Abaddon Light", sans-serif',
                fontSize: '24px',
                color: '#e7d6f4',
                align: 'center',
            })
            .setOrigin(0.5);

        const startX = width / 2 - 280;
        const cardSpacing = 280;

        PROJECTS.forEach((project, index) => {
            const x = startX + index * cardSpacing;
            const y = height / 2 + 12;
            const background = this.add
                .rectangle(x, y, 220, 270, 0x3b2a49, 0.97)
                .setStrokeStyle(3, 0x8f6aa8, 0.82);

            background
                .setInteractive({ useHandCursor: true })
                .on('pointerover', () => {
                    this.selectedIndex = index;
                    this.refreshSelection();
                })
                .on('pointerdown', () => {
                    this.selectedIndex = index;
                    this.refreshSelection();
                });

            this.add
                .text(x, y - 90, project.label, {
                    fontFamily: '"Abaddon Bold", sans-serif',
                    fontSize: '38px',
                    color: '#fff8ff',
                    align: 'center',
                })
                .setOrigin(0.5);

            this.add
                .text(x, y - 10, project.subtitle, {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#f7efff',
                    align: 'center',
                    wordWrap: { width: 170 },
                })
                .setOrigin(0.5);

            this.add
                .text(x, y + 78, `Press ${index + 1}`, {
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    color: '#c9f7d0',
                    align: 'center',
                })
                .setOrigin(0.5);

            this.cards.push({ background });
        });

        this.passwordText = this.add
            .text(width / 2, height - 172, '', {
                fontFamily: 'monospace',
                fontSize: '24px',
                color: '#fff5e7',
                backgroundColor: 'rgba(32, 18, 44, 0.84)',
                padding: { left: 12, right: 12, top: 8, bottom: 8 },
                align: 'center',
            })
            .setOrigin(0.5);

        this.statusText = this.add
            .text(width / 2, height - 120, '', {
                fontFamily: 'monospace',
                fontSize: '20px',
                color: '#ffdba8',
                align: 'center',
                wordWrap: { width: width - 120 },
            })
            .setOrigin(0.5);

        this.hintText = this.add
            .text(
                width / 2,
                height - 66,
                'Arrow keys or 1-2-3 to choose. Type password, ENTER to unlock, BACKSPACE to delete.',
                {
                    fontFamily: 'monospace',
                    fontSize: '17px',
                    color: '#d1fff0',
                    align: 'center',
                    wordWrap: { width: width - 100 },
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
        this.backspaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);
        this.numberKeys = [
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
            keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
        ];

        keyboard.on('keydown', this.handleTyping, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            keyboard.off('keydown', this.handleTyping, this);
        });

        this.refreshSelection();
        this.refreshPasswordDisplay();
    }

    update(): void {
        if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
            this.selectedIndex = (this.selectedIndex - 1 + PROJECTS.length) % PROJECTS.length;
            this.refreshSelection();
        }

        if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
            this.selectedIndex = (this.selectedIndex + 1) % PROJECTS.length;
            this.refreshSelection();
        }

        const numberSelection = this.numberKeys.findIndex((key) =>
            Phaser.Input.Keyboard.JustDown(key),
        );

        if (numberSelection >= 0) {
            this.selectedIndex = numberSelection;
            this.refreshSelection();
        }

        if (Phaser.Input.Keyboard.JustDown(this.backspaceKey)) {
            this.passwordInput = this.passwordInput.slice(0, -1);
            this.refreshPasswordDisplay();
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.attemptUnlock();
        }
    }

    private handleTyping(event: KeyboardEvent): void {
        if (event.key.length !== 1) {
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        const isAllowedCharacter = /[a-zA-Z0-9 ]/.test(event.key);
        if (!isAllowedCharacter) {
            return;
        }

        if (this.passwordInput.length >= 24) {
            return;
        }

        this.passwordInput += event.key;
        this.refreshPasswordDisplay();
    }

    private refreshSelection(): void {
        this.cards.forEach((card, index) => {
            const isSelected = index === this.selectedIndex;
            card.background
                .setFillStyle(isSelected ? 0x5a3d70 : 0x3b2a49, 0.98)
                .setStrokeStyle(isSelected ? 5 : 3, isSelected ? 0xf0d8ff : 0x8f6aa8, 0.95)
                .setScale(isSelected ? 1.03 : 1);
        });

        this.statusText.setText('');
    }

    private refreshPasswordDisplay(): void {
        const selectedProject = PROJECTS[this.selectedIndex];
        const obscuredPassword = this.passwordInput.length > 0 ? '•'.repeat(this.passwordInput.length) : '';
        this.passwordText.setText(
            `${selectedProject.label} password: ${obscuredPassword || '...'}`,
        );
    }

    private attemptUnlock(): void {
        const selectedProject = PROJECTS[this.selectedIndex];
        const normalizedAttempt = this.passwordInput.trim().toLowerCase();
        const normalizedPassword = selectedProject.password.trim().toLowerCase();

        if (normalizedAttempt !== normalizedPassword) {
            this.statusText.setColor('#ffb7b7');
            this.statusText.setText(`Wrong password for ${selectedProject.label}.`);
            return;
        }

        this.passwordInput = '';
        this.refreshPasswordDisplay();

        if (selectedProject.action === 'start-game') {
            this.scene.start('StartScene');
            return;
        }

        this.statusText.setColor('#d6ffd8');
        this.statusText.setText(`${selectedProject.label} unlocked. Still cooking in the tomato lab.`);
    }
}

import Phaser from 'phaser';

interface ViewerSheet {
    key: string;
    label: string;
}

const VIEWER_SHEETS: ViewerSheet[] = [
    { key: 'tiles_hospital', label: 'Hospital' },
    { key: 'tiles_kitchen', label: 'Kitchen' },
    { key: 'tiles_room_builder_floors', label: 'Room Builder Floors' },
    { key: 'tiles_room_builder_walls', label: 'Room Builder Walls' },
    { key: 'tiles_room_builder_office', label: 'Room Builder Office' },
    { key: 'tiles_modern_office', label: 'Modern Office' },
    { key: 'tiles_basement', label: 'Basement' },
    { key: 'tiles_gym', label: 'Gym' },
    { key: 'tiles_door', label: 'Door' },
    { key: 'tiles_bitglow_beds', label: 'Bitglow Beds' },
    { key: 'tiles_bitglow_cabinets', label: 'Bitglow Cabinets' },
    { key: 'tiles_bitglow_decorations_br', label: 'Bitglow Decorations BR' },
    { key: 'tiles_bitglow_decorations_lrk', label: 'Bitglow Decorations LRK' },
    { key: 'tiles_bitglow_doors_windows_stairs', label: 'Bitglow Doors Windows Stairs' },
    { key: 'tiles_bitglow_floors_walls', label: 'Bitglow Floors Walls' },
    { key: 'tiles_bitglow_kitchen', label: 'Bitglow Kitchen' },
    { key: 'tiles_bitglow_living_room', label: 'Bitglow Living Room' },
    { key: 'tiles_bitglow_wardrobes', label: 'Bitglow Wardrobes' },
    { key: 'tiles_trislin_interior', label: 'Trislin Interior' },
    { key: 'steve', label: 'Steve Sprite Sheet' },
    { key: 'wendy', label: 'Wendy Sprite Sheet' },
    { key: 'sam', label: 'Sam Sprite Sheet' },
];

const GRID_COLUMNS = 7;
const GRID_ROWS = 5;
const ITEMS_PER_PAGE = GRID_COLUMNS * GRID_ROWS;
const CELL_WIDTH = 136;
const CELL_HEIGHT = 114;
const GRID_START_X = 86;
const GRID_START_Y = 156;

export class TilesetViewerScene extends Phaser.Scene {
    private leftKey!: Phaser.Input.Keyboard.Key;
    private rightKey!: Phaser.Input.Keyboard.Key;
    private upKey!: Phaser.Input.Keyboard.Key;
    private downKey!: Phaser.Input.Keyboard.Key;
    private escKey!: Phaser.Input.Keyboard.Key;

    private headerText!: Phaser.GameObjects.Text;
    private pageText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;

    private readonly renderedObjects: Phaser.GameObjects.GameObject[] = [];
    private sheetIndex = 0;
    private pageIndex = 0;

    constructor() {
        super({ key: 'TilesetViewerScene' });
    }

    create(): void {
        const { width, height } = this.scale;

        this.add.rectangle(0, 0, width, height, 0x171220).setOrigin(0);

        this.headerText = this.add
            .text(36, 28, '', {
                fontFamily: '"Abaddon Bold", sans-serif',
                fontSize: '40px',
                color: '#fff7eb',
            })
            .setDepth(100);

        this.pageText = this.add
            .text(width - 36, 36, '', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#d8f4ff',
            })
            .setOrigin(1, 0)
            .setDepth(100);

        this.hintText = this.add
            .text(
                width / 2,
                height - 36,
                'LEFT/RIGHT switch sheet   UP/DOWN change page   ESC return',
                {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#d5c7ff',
                    align: 'center',
                },
            )
            .setOrigin(0.5, 1)
            .setDepth(100);

        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error('Keyboard input plugin is not available.');
        }

        this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.downKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
        this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.renderCurrentPage();
    }

    update(): void {
        if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
            this.sheetIndex =
                (this.sheetIndex - 1 + VIEWER_SHEETS.length) % VIEWER_SHEETS.length;
            this.pageIndex = 0;
            this.renderCurrentPage();
        }

        if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
            this.sheetIndex = (this.sheetIndex + 1) % VIEWER_SHEETS.length;
            this.pageIndex = 0;
            this.renderCurrentPage();
        }

        if (Phaser.Input.Keyboard.JustDown(this.upKey) && this.pageIndex > 0) {
            this.pageIndex -= 1;
            this.renderCurrentPage();
        }

        if (
            Phaser.Input.Keyboard.JustDown(this.downKey) &&
            this.pageIndex < this.getMaxPageIndex()
        ) {
            this.pageIndex += 1;
            this.renderCurrentPage();
        }

        if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
            this.scene.start('StartScene');
        }
    }

    private renderCurrentPage(): void {
        this.renderedObjects.forEach((object) => object.destroy());
        this.renderedObjects.length = 0;

        const sheet = VIEWER_SHEETS[this.sheetIndex];
        const frames = this.getFrameNames(sheet.key);
        const maxPageIndex = this.getMaxPageIndex();
        this.pageIndex = Phaser.Math.Clamp(this.pageIndex, 0, maxPageIndex);

        this.headerText.setText(`${sheet.label}  (${sheet.key})`);
        this.pageText.setText(
            `page ${this.pageIndex + 1}/${maxPageIndex + 1}  |  ${frames.length} frames`,
        );

        const startIndex = this.pageIndex * ITEMS_PER_PAGE;
        const visibleFrames = frames.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        visibleFrames.forEach((frameName, index) => {
            const column = index % GRID_COLUMNS;
            const row = Math.floor(index / GRID_COLUMNS);
            const x = GRID_START_X + column * CELL_WIDTH;
            const y = GRID_START_Y + row * CELL_HEIGHT;

            const frameNumber = Number(frameName);

            const card = this.add
                .rectangle(x, y, 112, 92, 0x2a2338, 0.96)
                .setStrokeStyle(2, 0x6f62a3, 0.8)
                .setOrigin(0.5);

            const frame = this.textures.getFrame(sheet.key, frameName);
            const scale = this.getViewerScale(frame);

            const image = this.add.image(x, y - 12, sheet.key, frameName).setScale(scale).setOrigin(0.5);

            const label = this.add
                .text(x, y + 30, `#${frameNumber}`, {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#fff5d8',
                    align: 'center',
                })
                .setOrigin(0.5);

            this.renderedObjects.push(card, image, label);
        });
    }

    private getFrameNames(textureKey: string): string[] {
        const texture = this.textures.get(textureKey);

        return texture
            .getFrameNames()
            .filter((name) => name !== '__BASE')
            .sort((a, b) => Number(a) - Number(b));
    }

    private getMaxPageIndex(): number {
        const sheet = VIEWER_SHEETS[this.sheetIndex];
        const frameCount = this.getFrameNames(sheet.key).length;

        return Math.max(Math.ceil(frameCount / ITEMS_PER_PAGE) - 1, 0);
    }

    private getViewerScale(frame: Phaser.Textures.Frame | null): number {
        if (!frame) {
            return 1;
        }

        if (frame.height > 48) {
            return 0.72;
        }

        if (frame.height <= 16) {
            return 3;
        }

        if (frame.height <= 32) {
            return 2;
        }

        return 1.5;
    }
}

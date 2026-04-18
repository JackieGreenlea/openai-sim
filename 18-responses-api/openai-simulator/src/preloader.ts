import Phaser from 'phaser';

const BITGLOW_TILESETS = [
    { key: 'tiles_bitglow_beds', path: 'tilesets/bitglow/beds_BR16.png' },
    { key: 'tiles_bitglow_cabinets', path: 'tilesets/bitglow/cabinets_LRK16.png' },
    { key: 'tiles_bitglow_decorations_br', path: 'tilesets/bitglow/decorations_BR16.png' },
    { key: 'tiles_bitglow_decorations_lrk', path: 'tilesets/bitglow/decorations_LRK16.png' },
    {
        key: 'tiles_bitglow_doors_windows_stairs',
        path: 'tilesets/bitglow/doorswindowsstairs_LRK16.png',
    },
    { key: 'tiles_bitglow_floors_walls', path: 'tilesets/bitglow/floorswalls_LRK16.png' },
    { key: 'tiles_bitglow_kitchen', path: 'tilesets/bitglow/kitchen_LRK16.png' },
    { key: 'tiles_bitglow_living_room', path: 'tilesets/bitglow/livingroom_LRK16.png' },
    { key: 'tiles_bitglow_wardrobes', path: 'tilesets/bitglow/wardrobes_BR16.png' },
] as const;

const EXTRA_16X16_TILESETS = [
    { key: 'tiles_trislin_interior', path: 'tilesets/trislin_interior_16x16.png' },
] as const;

const DEMON_FRAME_GROUPS = [
    { prefix: 'boss_demon_idle', folder: '01_demon_idle', base: 'demon_idle', count: 6 },
    { prefix: 'boss_demon_walk', folder: '02_demon_walk', base: 'demon_walk', count: 12 },
    { prefix: 'boss_demon_cleave', folder: '03_demon_cleave', base: 'demon_cleave', count: 15 },
    { prefix: 'boss_demon_hit', folder: '04_demon_take_hit', base: 'demon_take_hit', count: 5 },
    { prefix: 'boss_demon_death', folder: '05_demon_death', base: 'demon_death', count: 22 },
] as const;

export class Preloader extends Phaser.Scene {
    constructor() {
        super({ key: 'Preloader' });
    }

    preload(): void {
        this.load.setPath('assets');

        this.load.spritesheet('steve', 'sprites/steve.png', {
            frameWidth: 48,
            frameHeight: 96,
        });
        this.load.spritesheet('sam', 'sprites/sam.png', {
            frameWidth: 48,
            frameHeight: 96,
        });
        this.load.spritesheet('wendy', 'sprites/wendy.png', {
            frameWidth: 48,
            frameHeight: 96,
        });
        this.load.spritesheet('tiles_basement', 'tilesets/14_Basement_Black_Shadow_48x48.png', {
            frameWidth: 48,
            frameHeight: 48,
        });
        this.load.spritesheet('tiles_gym', 'tilesets/8_Gym_Black_Shadow_48x48.png', {
            frameWidth: 48,
            frameHeight: 48,
        });
        this.load.spritesheet('tiles_hospital', 'tilesets/19_Hospital_48x48.png', {
            frameWidth: 48,
            frameHeight: 48,
        });
        this.load.spritesheet('tiles_kitchen', 'tilesets/12_Kitchen_Black_Shadow_48x48.png', {
            frameWidth: 48,
            frameHeight: 48,
        });
        this.load.spritesheet(
            'tiles_modern_office',
            'tilesets/Modern_Office_Black_Shadow_48x48.png',
            {
                frameWidth: 48,
                frameHeight: 48,
            },
        );
        this.load.spritesheet(
            'tiles_room_builder_floors',
            'tilesets/Room_Builder_Floors_48x48.png',
            {
                frameWidth: 48,
                frameHeight: 48,
            },
        );
        this.load.spritesheet(
            'tiles_room_builder_office',
            'tilesets/Room_Builder_Office_48x48.png',
            {
                frameWidth: 48,
                frameHeight: 48,
            },
        );
        this.load.spritesheet(
            'tiles_room_builder_walls',
            'tilesets/Room_Builder_Walls_48x48.png',
            {
                frameWidth: 48,
                frameHeight: 48,
            },
        );
        this.load.spritesheet('tiles_door', 'tilesets/animated_door_4_locked_48x48.png', {
            frameWidth: 48,
            frameHeight: 48,
        });

        BITGLOW_TILESETS.forEach((tileset) => {
            this.load.spritesheet(tileset.key, tileset.path, {
                frameWidth: 16,
                frameHeight: 16,
            });
        });

        EXTRA_16X16_TILESETS.forEach((tileset) => {
            this.load.spritesheet(tileset.key, tileset.path, {
                frameWidth: 16,
                frameHeight: 16,
            });
        });

        DEMON_FRAME_GROUPS.forEach((group) => {
            for (let i = 1; i <= group.count; i += 1) {
                this.load.image(
                    `${group.prefix}_${i}`,
                    `boss/demon/individual_sprites/${group.folder}/${group.base}_${i}.png`,
                );
            }
        });

        this.load.spritesheet('boss_nightborne', 'boss/NightBorne.png', {
            frameWidth: 80,
            frameHeight: 80,
        });
        this.load.spritesheet('boss_flying_demon_idle', 'boss/flying_demon/IDLE.png', {
            frameWidth: 81,
            frameHeight: 71,
        });
        this.load.spritesheet('boss_flying_demon_flying', 'boss/flying_demon/FLYING.png', {
            frameWidth: 81,
            frameHeight: 71,
        });
        this.load.spritesheet('boss_flying_demon_attack', 'boss/flying_demon/ATTACK.png', {
            frameWidth: 81,
            frameHeight: 71,
        });
        this.load.spritesheet('boss_flying_demon_hurt', 'boss/flying_demon/HURT.png', {
            frameWidth: 81,
            frameHeight: 71,
        });
        this.load.spritesheet('boss_flying_demon_death', 'boss/flying_demon/DEATH.png', {
            frameWidth: 81,
            frameHeight: 71,
        });
        this.load.image(
            'boss_flying_demon_projectile',
            'boss/flying_demon/projectile.png',
        );

        this.load.image('boss_healthbar', 'boss/HealthBar.png');
        this.load.image('boss_projectile', 'boss/witch_projectile.png');
        this.load.image('boss_pizza_projectile', 'boss/pizza.png');
        this.load.image('witch_projectile', 'boss/witch_projectile.png');
        this.load.image('boss_magic_potion', 'boss/Magic_potion.png');
        this.load.image('boss_hp_potion', 'boss/HP_potion.png');
        for (let i = 0; i < 8; i += 1) {
            this.load.image(
                `witch_portal_${i}`,
                `boss/witch_portal/frame${String(i).padStart(4, '0')}.png`,
            );
        }
        this.load.spritesheet('witch', 'boss/witch.png', {
            frameWidth: 64,
            frameHeight: 64,
        });

        for (let i = 1; i < 8; i++) {
            this.load.spritesheet(`misc_${i}`, `sprites/misc_${i}.png`, {
                frameWidth: 48,
                frameHeight: 96,
            });
        }

        this.load.on('progress', (progress: number) => {
            console.log(`Loading: ${Math.round(progress * 100)}%`);
        });
    }

    async create(): Promise<void> {
        try {
            await this.ensureFonts();
        } catch (error) {
            console.warn('Failed to confirm fonts before start', error);
        }

        this.scene.start('StartScene');
    }

    private async ensureFonts(): Promise<void> {
        const fontDocument = document as Document & { fonts?: FontFaceSet };
        const fontSet = fontDocument.fonts;

        if (!fontSet) {
            return;
        }

        const descriptors = ['48px "Abaddon Bold"', '32px "Abaddon Light"'];
        const loaders = descriptors.map((descriptor) => fontSet.load(descriptor));

        await Promise.allSettled(loaders);
    }
}

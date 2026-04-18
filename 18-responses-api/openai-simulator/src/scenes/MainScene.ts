import Phaser from 'phaser';
import { getPlayerCharacter, buildNpcConfigs } from '../config/npcConfigs';
import { defaultCharacterId, type HouseholdCharacterId } from '../config/characters';
import { Character } from '../gameobjects/Character';
import type { DialogueAgent, DialogueStreamChunk } from '../dialogue/BaseDialogueAgent';
import { DebugEventPanel } from '../ui/DebugEventPanel';

type Direction = 'up' | 'down' | 'left' | 'right';
type BossType = 'demon' | 'nightborne' | 'flying-demons';
type WitchCastDirection = 'N' | 'SW' | 'S' | 'SE';

type ThreadMessage = {
    speaker: 'npc' | 'player';
    text: string;
    prefix?: string;
};

type BoundableObject = Phaser.GameObjects.GameObject &
    Phaser.GameObjects.Components.Transform & {
        getBounds(): Phaser.Geom.Rectangle;
        setPosition(x?: number, y?: number, z?: number, w?: number): unknown;
    };

type EditableTargetPoint = {
    label: string;
    vector: Phaser.Math.Vector2;
};

type EditableTargetKind = 'tiles' | 'objects' | 'collider' | 'anchors' | 'solid';

type SavedEditableTargetState =
    | {
          id: string;
          name: string;
          kind: 'tiles';
          texture: string;
          frames: number[];
          tileX: number;
          tileY: number;
          width: number;
          baseDepth: number;
          scale?: number;
          linkedColliders?: Array<{ x: number; y: number; width: number; height: number }>;
          linkedPoints?: Array<{ label: string; x: number; y: number }>;
      }
    | {
          id: string;
          name: string;
          kind: 'solid';
          x: number;
          y: number;
          width: number;
          height: number;
          color: number;
      }
    | {
          id: string;
          name: string;
          kind: 'collider';
          x: number;
          y: number;
          width: number;
          height: number;
      }
    | {
          id: string;
          name: string;
          kind: 'anchors';
          points: Array<{ label: string; x: number; y: number }>;
      }
    | {
          id: string;
          name: string;
          kind: 'objects';
          positions: Array<{ x: number; y: number }>;
          points: Array<{ label: string; x: number; y: number }>;
          linkedColliders?: Array<{ x: number; y: number; width: number; height: number }>;
      };

type EditableTarget = {
    id: string;
    name: string;
    kind: EditableTargetKind;
    deletable: boolean;
    moveBy(dx: number, dy: number): void;
    getBounds(): Phaser.Geom.Rectangle;
    getHelperRects?: () => Phaser.Geom.Rectangle[];
    getInfoLines(): string[];
    getPoints?: () => Array<{ label: string; x: number; y: number }>;
    resizeBy?: (delta: number) => void;
    duplicate?: () => EditableTarget | null;
    destroy(): void;
    serialize(): SavedEditableTargetState;
    restore(state: SavedEditableTargetState): void;
};

type FurniturePaletteItem = {
    name: string;
    texture: string;
    frames: number[];
    width: number;
    baseDepth?: number;
    scale?: number;
    linkedColliders?: Array<{ x: number; y: number; width: number; height: number }>;
    linkedPoints?: Array<{ label: string; x: number; y: number }>;
};

type SeatInteraction = {
    name: string;
    promptPosition: Phaser.Math.Vector2;
    sitPosition: Phaser.Math.Vector2;
    facing: Direction;
    exitOffset: Phaser.Math.Vector2;
};

type FlyingDemonBossState = {
    sprite: Phaser.Physics.Arcade.Sprite;
    hp: number;
    attackCooldownUntil: number;
    attackTimer: Phaser.Time.TimerEvent | null;
    invulnerableUntil: number;
};

const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

const TILE_SIZE = 48;
const EDITOR_SELECTION_PADDING = 10;
const EDITABLE_LAYOUT_STORAGE_KEY = 'openai-simulator:editable-layout-v1';
const PLAY_CAMERA_ZOOM = 1.05;
const MIN_EDIT_MODE_ZOOM = 0.45;
const MAX_EDIT_MODE_ZOOM = 1.5;
const EDIT_MODE_ZOOM_STEP = 0.1;
const LEGACY_BED_COLLIDER_IDS = new Set([
    'bedroom-1-left-bed-hitbox',
    'bedroom-1-right-bed-hitbox',
    'bedroom-2-bed-hitbox',
]);
let sessionEditableLayoutState: SavedEditableTargetState[] | null = null;
let spawnedEditableTargetCounter = 1;

const PLAYER_FRAMES = {
    walk: {
        down: range(131, 135),
        left: range(124, 129),
        right: range(112, 117),
        up: range(118, 123),
    },
    idle: {
        down: range(74, 79),
        right: range(56, 61),
        left: range(68, 73),
        up: range(62, 67),
    },
    sit: {
        down: null,
        right: range(224, 229),
        left: range(230, 235),
        up: range(62, 67),
    },
};

const HOUSE_WIDTH = 1344;
const HOUSE_HEIGHT = 960;
const INTERACTION_RADIUS = 92;
const BED_POSITION = new Phaser.Math.Vector2(1104, 648);
const BED_INTERACTION_RADIUS = 88;
const BOOKS_POSITION = new Phaser.Math.Vector2(780, 760);
const BOOKS_INTERACTION_RADIUS = 84;
const KITCHEN_SEATS: SeatInteraction[] = [
    {
        name: 'left-chair',
        promptPosition: new Phaser.Math.Vector2(864, 156),
        sitPosition: new Phaser.Math.Vector2(860, 196),
        facing: 'left' as const,
        exitOffset: new Phaser.Math.Vector2(-32, 6),
    },
    {
        name: 'right-chair',
        promptPosition: new Phaser.Math.Vector2(1008, 156),
        sitPosition: new Phaser.Math.Vector2(1012, 196),
        facing: 'right' as const,
        exitOffset: new Phaser.Math.Vector2(32, 6),
    },
] as const;
const DESK_SEAT: SeatInteraction = {
    name: 'desk-chair',
    promptPosition: new Phaser.Math.Vector2(552, 102),
    sitPosition: new Phaser.Math.Vector2(552, 124),
    facing: 'up' as const,
    exitOffset: new Phaser.Math.Vector2(0, 44),
};
const INTERACTIVE_SEATS: SeatInteraction[] = [...KITCHEN_SEATS, DESK_SEAT];
const KITCHEN_SEAT_INTERACTION_RADIUS = 60;
const FRIDGE_INTERACTION_POINT = new Phaser.Math.Vector2(1176, 120);
const FRIDGE_INTERACTION_RADIUS = 88;
const BED_EMPTY_FRAME = 176;
const BED_SLEEPING_FRAME = 180;
const SLEEP_HEAD_FRAMES = range(168, 173);
const SLEEP_HEAD_ORIGIN = { x: 0.5, y: 0.16 } as const;
const READING_FRAMES = range(392, 403);
const SMALL_FURNITURE_SCALE = 2;
const DEMON_IDLE_KEYS = range(1, 6).map((index) => `boss_demon_idle_${index}`);
const DEMON_WALK_KEYS = range(1, 12).map((index) => `boss_demon_walk_${index}`);
const DEMON_CLEAVE_KEYS = range(1, 15).map((index) => `boss_demon_cleave_${index}`);
const DEMON_HIT_KEYS = range(1, 5).map((index) => `boss_demon_hit_${index}`);
const DEMON_DEATH_KEYS = range(1, 22).map((index) => `boss_demon_death_${index}`);
const DEMON_BOSS_SCALE = 1.8;
const NIGHTBORNE_BOSS_SCALE = 3.1;
const NIGHTBORNE_IDLE_FRAMES = range(0, 8);
const NIGHTBORNE_RUN_FRAMES = range(23, 28);
const NIGHTBORNE_ATTACK_FRAMES = range(46, 57);
const NIGHTBORNE_HIT_FRAMES = range(69, 73);
const NIGHTBORNE_DEATH_FRAMES = range(92, 114);
const FLYING_DEMON_IDLE_FRAMES = range(0, 3);
const FLYING_DEMON_FLY_FRAMES = range(0, 3);
const FLYING_DEMON_ATTACK_FRAMES = range(0, 7);
const FLYING_DEMON_HURT_FRAMES = range(0, 3);
const FLYING_DEMON_DEATH_FRAMES = range(0, 6);
const DEMON_BOSS_SPEED = 72;
const FLYING_DEMON_BOSS_SCALE = 2.05;
const DEMON_BOSS_MAX_HP = 20;
const DEMON_PLAYER_MAX_HP = 4;
const DEMON_BOSS_AGGRO_RADIUS = 420;
const DEMON_BOSS_MELEE_RANGE = 140;
const NIGHTBORNE_BOSS_MELEE_RANGE = 96;
const DEMON_PLAYER_ATTACK_RANGE = 144;
const DEMON_BOSS_ATTACK_COOLDOWN_MS = 1300;
const DEMON_BOSS_ATTACK_WINDUP_MS = 420;
const DEMON_BOSS_ATTACK_ANIMATION_MS = 950;
const NIGHTBORNE_BOSS_ATTACK_WINDUP_MS = 420;
const NIGHTBORNE_BOSS_ATTACK_ANIMATION_MS = 760;
const FLYING_DEMON_MAX_HP = 15;
const FLYING_DEMON_SPEED = 88;
const FLYING_DEMON_AGGRO_RADIUS = 520;
const FLYING_DEMON_ATTACK_RANGE = 244;
const FLYING_DEMON_PREFERRED_RANGE = 188;
const FLYING_DEMON_ATTACK_COOLDOWN_MS = 1450;
const FLYING_DEMON_ATTACK_WINDUP_MS = 260;
const FLYING_DEMON_ATTACK_ANIMATION_MS = 640;
const FLYING_DEMON_PROJECTILE_SPEED = 240;
const DEMON_PLAYER_HIT_COOLDOWN_MS = 900;
const DEMON_BOSS_HIT_COOLDOWN_MS = 320;
const DEMON_BOSS_DAMAGE = 1;
const DEMON_PLAYER_MELEE_DAMAGE = 1;
const DEMON_PLAYER_RANGED_DAMAGE = 1;
const DEMON_PLAYER_RANGED_COOLDOWN_MS = 550;
const DEMON_PLAYER_PROJECTILE_SPEED = 360;
const DEMON_PLAYER_MAX_PROJECTILES = 3;
const DEMON_PLAYER_PIZZA_PROJECTILES = 5;
const DEMON_POTION_PICKUP_RADIUS = 74;
const PHONE_CALL_FRAMES = range(644, 657);
const PHONE_CALL_FRAME_RATE = 6;
const PHONE_CALL_DURATION_MS = 2600;
const GOOD_WITCH_ARRIVAL_DELAY_MS = 5000;
const WITCH_CAST_ROWS: Record<WitchCastDirection, number[]> = {
    N: range(0, 6),
    SW: range(13, 19),
    S: range(26, 32),
    SE: range(39, 45),
};
const WITCH_CAST_FRAME_RATE = 11;
const WITCH_CAST_WINDUP_MS = 170;
const WITCH_CAST_DURATION_MS = Math.ceil((WITCH_CAST_ROWS.S.length / WITCH_CAST_FRAME_RATE) * 1000);
const WITCH_PORTAL_FRAME_KEYS = range(0, 7).map((index) => `witch_portal_${index}`);
const WITCH_PORTAL_FRAME_RATE = 14;
const WITCH_PORTAL_DURATION_MS = Math.ceil(
    (WITCH_PORTAL_FRAME_KEYS.length / WITCH_PORTAL_FRAME_RATE) * 1000,
);
const WITCH_HELP_PROJECTILE_COUNT = 15;
const WITCH_HELP_PROJECTILE_DAMAGE = 1;
const WITCH_HELP_PROJECTILE_SPEED = 320;
const WITCH_HELP_PROJECTILE_INTERVAL_MS = 2000;
const WITCH_HELP_SPRITE_SCALE = 1.7;
const WITCH_HELP_PROJECTILE_SCALE = 3;
const WITCH_PORTAL_SCALE = 3;
const WITCH_HELP_IDLE_DIRECTION: WitchCastDirection = 'S';
const WITCH_HELP_POSITION = { x: 336, y: 300 };
const FURNITURE_PALETTE: FurniturePaletteItem[] = [
    {
        name: 'TV top',
        texture: 'tiles_basement',
        frames: [759, 760, 761],
        width: 3,
    },
    {
        name: 'TV body',
        texture: 'tiles_basement',
        frames: [774, 775, 776, 777, 790, 791, 792, 793],
        width: 4,
    },
    {
        name: 'Couch',
        texture: 'tiles_basement',
        frames: [135, 136, 137, 151, 152, 153],
        width: 3,
    },
    {
        name: 'Desk',
        texture: 'tiles_modern_office',
        frames: [455, 456, 457, 471, 472, 473],
        width: 3,
    },
    {
        name: 'Desk 2',
        texture: 'tiles_modern_office',
        frames: [547, 563, 579],
        width: 1,
    },
    {
        name: 'Computer',
        texture: 'tiles_modern_office',
        frames: [205, 206, 207],
        width: 3,
    },
    {
        name: 'Computer Right',
        texture: 'tiles_modern_office',
        frames: [570, 586],
        width: 1,
    },
    {
        name: 'Laptop R',
        texture: 'tiles_modern_office',
        frames: [287, 303],
        width: 1,
    },
    {
        name: 'Single Monitor R1',
        texture: 'tiles_modern_office',
        frames: [572],
        width: 1,
    },
    {
        name: 'Single Monitor R2',
        texture: 'tiles_modern_office',
        frames: [143, 159],
        width: 1,
    },
    {
        name: 'Keyboard R',
        texture: 'tiles_modern_office',
        frames: [585],
        width: 1,
    },
    {
        name: 'Mouse + Keyboard',
        texture: 'tiles_modern_office',
        frames: [585],
        width: 1,
    },
    {
        name: 'Desk chair',
        texture: 'tiles_modern_office',
        frames: [129, 145],
        width: 1,
        linkedPoints: [
            { label: 'prompt:up', x: 24, y: 18 },
            { label: 'sit:up', x: 24, y: 14 },
        ],
    },
    {
        name: 'Desk chair left',
        texture: 'tiles_modern_office',
        frames: [552, 568],
        width: 1,
        linkedPoints: [
            { label: 'prompt:right', x: 24, y: 18 },
            { label: 'sit:right', x: 30, y: 14 },
        ],
    },
    {
        name: 'Bookshelf',
        texture: 'tiles_modern_office',
        frames: [199, 200, 215, 216, 231, 232],
        width: 2,
    },
    {
        name: 'Kitchen counter',
        texture: 'tiles_kitchen',
        frames: [20, 20, 20, 20, 20],
        width: 5,
    },
    {
        name: 'Oven',
        texture: 'tiles_kitchen',
        frames: [184, 200],
        width: 1,
    },
    {
        name: 'Fridge',
        texture: 'tiles_kitchen',
        frames: [377, 393, 409],
        width: 1,
    },
    {
        name: 'Kitchen table',
        texture: 'tiles_kitchen',
        frames: [259, 260, 261, 275, 276, 277],
        width: 3,
    },
    {
        name: 'Kitchen left chair',
        texture: 'tiles_kitchen',
        frames: [182, 198],
        width: 1,
        linkedPoints: [
            { label: 'prompt:right', x: 20, y: 18 },
            { label: 'sit:right', x: 24, y: 22 },
        ],
    },
    {
        name: 'Kitchen right chair',
        texture: 'tiles_kitchen',
        frames: [213, 229],
        width: 1,
        linkedPoints: [
            { label: 'prompt:left', x: 28, y: 18 },
            { label: 'sit:left', x: 24, y: 22 },
        ],
    },
    {
        name: 'Twin bed',
        texture: 'steve',
        frames: [BED_EMPTY_FRAME],
        width: 1,
    },
    {
        name: 'Crayons',
        texture: 'tiles_hospital',
        frames: [1530, 1546],
        width: 1,
    },
    {
        name: 'Art easel',
        texture: 'tiles_hospital',
        frames: [1531, 1532, 1547, 1548],
        width: 2,
    },
    {
        name: 'Plant 3',
        texture: 'tiles_hospital',
        frames: [304],
        width: 1,
        linkedColliders: [{ x: 24, y: 30, width: 20, height: 22 }],
    },
    {
        name: 'Plant 4',
        texture: 'tiles_hospital',
        frames: [305],
        width: 1,
        linkedColliders: [{ x: 24, y: 30, width: 20, height: 22 }],
    },
    {
        name: 'Plant 5',
        texture: 'tiles_hospital',
        frames: [307],
        width: 1,
        linkedColliders: [{ x: 24, y: 30, width: 20, height: 22 }],
    },
    {
        name: 'Plant 6',
        texture: 'tiles_hospital',
        frames: [308],
        width: 1,
        linkedColliders: [{ x: 24, y: 30, width: 20, height: 22 }],
    },
    {
        name: 'Plant 7',
        texture: 'tiles_trislin_interior',
        frames: [110, 126],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 18, height: 20 }],
    },
    {
        name: 'Double bed 2',
        texture: 'tiles_trislin_interior',
        frames: [43, 44, 45, 59, 60, 61, 75, 76, 77, 91, 92, 93],
        width: 3,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 48, y: 82, width: 88, height: 86 }],
        linkedPoints: [{ label: 'sleep', x: 60, y: 18 }],
    },
    {
        name: 'Double bed 3',
        texture: 'tiles_bitglow_beds',
        frames: [25, 26, 27, 39, 40, 41, 53, 54, 55, 67, 68, 69],
        width: 3,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 48, y: 82, width: 88, height: 86 }],
        linkedPoints: [{ label: 'sleep', x: 60, y: 18 }],
    },
    {
        name: 'Nightstand',
        texture: 'tiles_trislin_interior',
        frames: [57],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 24, height: 20 }],
    },
    {
        name: 'Open books',
        texture: 'tiles_trislin_interior',
        frames: [166],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
    },
    {
        name: 'Books',
        texture: 'tiles_trislin_interior',
        frames: [167],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
    },
    {
        name: 'Bookshelf 2',
        texture: 'tiles_trislin_interior',
        frames: [138, 139, 154, 155, 170, 171],
        width: 2,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 32, y: 48, width: 56, height: 84 }],
    },
    {
        name: 'Dining Table 2',
        texture: 'tiles_trislin_interior',
        frames: [140, 141, 142, 156, 157, 158, 172, 173, 174],
        width: 3,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 48, y: 48, width: 80, height: 52 }],
    },
    {
        name: 'Chair 2 Left',
        texture: 'tiles_trislin_interior',
        frames: [105, 121],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedPoints: [
            { label: 'prompt:left', x: 18, y: 20 },
            { label: 'sit:left', x: 22, y: 20 },
        ],
    },
    {
        name: 'Chair 2 Right',
        texture: 'tiles_trislin_interior',
        frames: [107, 123],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedPoints: [
            { label: 'prompt:right', x: 14, y: 20 },
            { label: 'sit:right', x: 10, y: 20 },
        ],
    },
    {
        name: 'Chair 2 Back',
        texture: 'tiles_trislin_interior',
        frames: [104, 120],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
    },
    {
        name: 'Chair 3 Front',
        texture: 'tiles_trislin_interior',
        frames: [106, 122],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
    },
    {
        name: 'Plant 1',
        texture: 'tiles_trislin_interior',
        frames: [127],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 18, height: 20 }],
    },
    {
        name: 'Plant 2',
        texture: 'tiles_trislin_interior',
        frames: [143],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 18, height: 20 }],
    },
    {
        name: 'Plant 8',
        texture: 'tiles_bitglow_decorations_lrk',
        frames: [61, 73],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 18, height: 20 }],
    },
    {
        name: 'Plant 9',
        texture: 'tiles_bitglow_decorations_lrk',
        frames: [63, 75],
        width: 1,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 16, y: 18, width: 18, height: 20 }],
    },
    {
        name: 'Plant 10',
        texture: 'tiles_modern_office',
        frames: [166],
        width: 1,
        linkedColliders: [{ x: 24, y: 30, width: 20, height: 22 }],
    },
    {
        name: 'Wh Long Counter',
        texture: 'tiles_bitglow_kitchen',
        frames: [...range(547, 554), ...range(573, 580), ...range(599, 606)],
        width: 8,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 128, y: 62, width: 246, height: 54 }],
    },
    {
        name: 'Wh Single Counter',
        texture: 'tiles_bitglow_kitchen',
        frames: [555, 556, 581, 582, 607, 608],
        width: 2,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 32, y: 62, width: 56, height: 54 }],
    },
    {
        name: 'Oven 2',
        texture: 'tiles_bitglow_kitchen',
        frames: [558, 559, 584, 585, 610, 611],
        width: 2,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 32, y: 62, width: 56, height: 54 }],
    },
    {
        name: 'Single Bed 2',
        texture: 'tiles_bitglow_beds',
        frames: [15, 16, 29, 30, 43, 44, 57, 58],
        width: 2,
        scale: SMALL_FURNITURE_SCALE,
        linkedColliders: [{ x: 32, y: 82, width: 56, height: 86 }],
        linkedPoints: [{ label: 'sleep', x: 30, y: 18 }],
    },
];

export class MainScene extends Phaser.Scene {
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private player!: Character;
    private npcs: Character[] = [];
    private readonly nameTags = new Map<Character, Phaser.GameObjects.Text>();
    private readonly debugPanel = DebugEventPanel.getInstance();
    private readonly playerConversationId = 'player:main';

    private activeNpc: Character | null = null;
    private activeAgent?: DialogueAgent;
    private selectedCharacterId: HouseholdCharacterId = defaultCharacterId;
    private playerName = 'Player';
    private playerTexture: 'wendy' | 'steve' | 'sam' = 'steve';

    private interactKey!: Phaser.Input.Keyboard.Key;
    private meleeAttackKey!: Phaser.Input.Keyboard.Key;
    private rangedAttackKey!: Phaser.Input.Keyboard.Key;
    private cancelKey!: Phaser.Input.Keyboard.Key;
    private editModeKey!: Phaser.Input.Keyboard.Key;
    private previousEditableKey!: Phaser.Input.Keyboard.Key;
    private nextEditableKey!: Phaser.Input.Keyboard.Key;
    private fineNudgeKey!: Phaser.Input.Keyboard.Key;
    private duplicateEditableKey!: Phaser.Input.Keyboard.Key;
    private deleteEditableKey!: Phaser.Input.Keyboard.Key;
    private deleteForwardEditableKey!: Phaser.Input.Keyboard.Key;
    private paletteKey!: Phaser.Input.Keyboard.Key;
    private palettePreviousKey!: Phaser.Input.Keyboard.Key;
    private paletteNextKey!: Phaser.Input.Keyboard.Key;
    private palettePlaceKey!: Phaser.Input.Keyboard.Key;
    private interactionPrompt!: Phaser.GameObjects.Text;
    private npcDialogue!: Phaser.GameObjects.Text;
    private npcReasoningText!: Phaser.GameObjects.Text;
    private playerInputText!: Phaser.GameObjects.Text;
    private centerStatusText!: Phaser.GameObjects.Text;
    private editorGrid!: Phaser.GameObjects.Graphics;
    private editorHelpers!: Phaser.GameObjects.Graphics;
    private editorSelection!: Phaser.GameObjects.Graphics;
    private editorText!: Phaser.GameObjects.Text;
    private editorPaletteText!: Phaser.GameObjects.Text;
    private bedSprite!: Phaser.GameObjects.Sprite;
    private sleepHeadSprite!: Phaser.GameObjects.Sprite;
    private bossSprite!: Phaser.Physics.Arcade.Sprite;
    private bossStatusText!: Phaser.GameObjects.Text;
    private bossMagicPotion!: Phaser.GameObjects.Image;
    private bossHpPotion!: Phaser.GameObjects.Image;
    private bossHealthBarFill!: Phaser.GameObjects.Image;
    private bossHealthBarBacking!: Phaser.GameObjects.Rectangle;
    private flyingDemonBosses: FlyingDemonBossState[] = [];
    private witchSupportSprite: Phaser.GameObjects.Sprite | null = null;
    private witchVolleyTimers: Phaser.Time.TimerEvent[] = [];
    private witchArrivalTimer: Phaser.Time.TimerEvent | null = null;
    private witchHelpUsed = false;
    private pizzaHelpUsed = false;
    private isInteracting = false;
    private isAwaitingInput = false;
    private isWaitingForResponse = false;
    private isSleepingInBed = false;
    private isReading = false;
    private isSitting = false;
    private isEditMode = false;
    private isDraggingEditable = false;
    private isPaletteOpen = false;
    private playerInput = '';
    private threadMessages: ThreadMessage[] = [];
    private inputPrefix = 'You: ';
    private npcDisplayName = 'NPC';
    private currentReasoningText = '';
    private activeConversationId = 0;
    private detachDebugListener?: () => void;
    private playerBedSupported = false;
    private activeSeat: SeatInteraction | null = null;
    private editableTargets: EditableTarget[] = [];
    private selectedEditableIndex = 0;
    private dragLastWorldPoint: Phaser.Math.Vector2 | null = null;
    private staticBodiesGroup!: Phaser.Physics.Arcade.StaticGroup;
    private selectedPaletteIndex = 0;
    private layoutSaveStatus = 'Cmd/Ctrl+S to save edits';
    private activeSleepPoint: { x: number; y: number } | null = null;
    private activeSleepBounds: Phaser.Geom.Rectangle | null = null;
    private editorPanelRoot: HTMLElement | null = null;
    private editorInfoPanel: HTMLElement | null = null;
    private editorFurniturePanel: HTMLElement | null = null;
    private editorInfoMeta: HTMLElement | null = null;
    private editorInfoHint: HTMLElement | null = null;
    private editorFurnitureMeta: HTMLElement | null = null;
    private editorFurnitureHint: HTMLElement | null = null;
    private editorFurnitureGrid: HTMLElement | null = null;
    private editorFurnitureButtons: HTMLButtonElement[] = [];
    private editableUndoStack: SavedEditableTargetState[][] = [];
    private hasActiveDragUndoSnapshot = false;
    private editModeZoom = PLAY_CAMERA_ZOOM;
    private bossSpawnPoint = new Phaser.Math.Vector2(960, 300);
    private activeBossType: BossType = 'demon';
    private bossHealth = DEMON_BOSS_MAX_HP;
    private playerHealth = DEMON_PLAYER_MAX_HP;
    private bossAlive = false;
    private bossAttackTimer: Phaser.Time.TimerEvent | null = null;
    private centerStatusMessageTimer: Phaser.Time.TimerEvent | null = null;
    private bossAttackCooldownUntil = 0;
    private bossInvulnerableUntil = 0;
    private playerInvulnerableUntil = 0;
    private playerRangedCooldownUntil = 0;
    private playerProjectileCharges = 0;
    private playerProjectileMaxCharges = DEMON_PLAYER_MAX_PROJECTILES;
    private playerProjectileTextureKey: 'boss_projectile' | 'boss_pizza_projectile' = 'boss_projectile';
    private playerProjectileScale = 1.1;
    private playerProjectileBodyRadius = 10;
    private playerProjectileBodyOffset = 6;

    constructor() {
        super({ key: 'MainScene' });
    }

    init(data?: { selectedCharacterId?: HouseholdCharacterId }): void {
        this.selectedCharacterId = data?.selectedCharacterId ?? defaultCharacterId;
    }

    create(): void {
        this.debugPanel.setActiveNpc(null);
        this.loadEditableLayoutState();

        this.physics.world.setBounds(0, 0, HOUSE_WIDTH, HOUSE_HEIGHT);

        const playerConfig = getPlayerCharacter(this.selectedCharacterId);
        this.playerName = playerConfig.name;
        this.playerTexture = playerConfig.texture;
        this.playerBedSupported = true;

        const staticBodies = this.physics.add.staticGroup();
        this.staticBodiesGroup = staticBodies;
        this.buildHouse(staticBodies);

        this.player = new Character({
            scene: this,
            texture: playerConfig.texture,
            position: playerConfig.position,
            colliders: staticBodies,
            speed: 200,
            frameConfig: PLAYER_FRAMES,
            initialDirection: playerConfig.initialDirection,
        });

        this.sleepHeadSprite = this.add
            .sprite(0, 0, this.playerTexture, SLEEP_HEAD_FRAMES[0])
            .setVisible(false)
            .setOrigin(SLEEP_HEAD_ORIGIN.x, SLEEP_HEAD_ORIGIN.y);

        this.npcs = buildNpcConfigs(this.selectedCharacterId).map((config) => {
            const npc = new Character({
                scene: this,
                npc: true,
                texture: config.texture,
                position: config.position,
                colliders: staticBodies,
                frameConfig: PLAYER_FRAMES,
                speed: 0,
                dialogueAgent: config.dialogueAgent,
                initialDirection: config.initialDirection ?? 'down',
            });

            this.physics.add.collider(this.player.sprite, npc.sprite);

            const agent = npc.getDialogueAgent();
            if (agent) {
                this.debugPanel.registerNpc(agent.getDisplayName());
                this.createNameTag(npc, agent.getDisplayName(), '#fff6da');
            }

            return npc;
        });

        for (let i = 0; i < this.npcs.length; i += 1) {
            for (let j = i + 1; j < this.npcs.length; j += 1) {
                this.physics.add.collider(this.npcs[i].sprite, this.npcs[j].sprite);
            }
        }

        this.createNameTag(this.player, this.playerName, '#9cf7bf');

        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error('Keyboard input plugin is not available.');
        }

        this.cursors = keyboard.createCursorKeys();
        this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.meleeAttackKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.rangedAttackKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.cancelKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.editModeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.previousEditableKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.nextEditableKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.fineNudgeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ALT);
        this.duplicateEditableKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.deleteEditableKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);
        this.deleteForwardEditableKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE);
        this.paletteKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.palettePreviousKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET);
        this.paletteNextKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET);
        this.palettePlaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        this.interactionPrompt = this.add
            .text(0, 0, 'Press SPACE to chat', {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: '#fffdf8',
                backgroundColor: 'rgba(44, 29, 18, 0.85)',
                padding: { left: 7, right: 7, top: 3, bottom: 3 },
            })
            .setOrigin(0.5)
            .setDepth(1200)
            .setVisible(false);

        this.npcDialogue = this.add
            .text(24, this.cameras.main.height - 96, '', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.66)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 6, bottom: 6 },
            })
            .setScrollFactor(0)
            .setDepth(1200)
            .setOrigin(0, 1)
            .setVisible(false);

        this.npcReasoningText = this.add
            .text(24, this.cameras.main.height - 120, '', {
                fontFamily: 'monospace',
                fontSize: '16px',
                fontStyle: 'italic',
                color: '#ffd08d',
                backgroundColor: 'rgba(64, 38, 18, 0.72)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            })
            .setScrollFactor(0)
            .setDepth(1200)
            .setOrigin(0, 1)
            .setVisible(false);

        this.playerInputText = this.add
            .text(24, this.cameras.main.height - 48, '', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#9cf7bf',
                backgroundColor: 'rgba(8, 22, 11, 0.74)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 6, bottom: 6 },
            })
            .setScrollFactor(0)
            .setDepth(1200)
            .setOrigin(0, 1)
            .setVisible(false);

        this.centerStatusText = this.add
            .text(this.cameras.main.width / 2, this.cameras.main.height / 2, '', {
                fontFamily: 'monospace',
                fontSize: '24px',
                color: '#fff3d8',
                backgroundColor: 'rgba(40, 12, 8, 0.84)',
                align: 'center',
                padding: { left: 14, right: 14, top: 10, bottom: 10 },
            })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1250)
            .setVisible(false);

        this.bossStatusText = this.add
            .text(24, 24, '', {
                fontFamily: 'monospace',
                fontSize: '22px',
                color: '#ffe7d1',
                backgroundColor: 'rgba(54, 14, 8, 0.76)',
                align: 'left',
                padding: { left: 10, right: 10, top: 8, bottom: 8 },
            })
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1200)
            .setVisible(false);

        this.bossHealthBarBacking = this.add
            .rectangle(24, 24, 279, 29, 0x2a0d08, 0.92)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1198)
            .setVisible(false);

        this.bossHealthBarFill = this.add
            .image(28, 28, 'boss_healthbar')
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(1199)
            .setVisible(false);

        this.bossMagicPotion = this.add
            .image(0, 0, 'boss_magic_potion')
            .setDepth(60)
            .setScale(0.78)
            .setVisible(false);

        this.bossHpPotion = this.add
            .image(0, 0, 'boss_hp_potion')
            .setDepth(60)
            .setScale(0.78)
            .setVisible(false);

        this.editorGrid = this.add.graphics().setDepth(1090).setVisible(false);
        this.drawEditorGrid();

        this.editorHelpers = this.add.graphics().setDepth(1180).setVisible(false);
        this.editorSelection = this.add.graphics().setDepth(1190).setVisible(false);

        this.editorText = this.add
            .text(24, 24, '', {
                fontFamily: 'monospace',
                fontSize: '15px',
                color: '#fff7de',
                backgroundColor: 'rgba(21, 15, 12, 0.86)',
                padding: { left: 10, right: 10, top: 8, bottom: 8 },
                wordWrap: { width: 360 },
            })
            .setScrollFactor(0)
            .setDepth(1300)
            .setVisible(false);

        this.editorPaletteText = this.add
            .text(this.cameras.main.width - 24, 24, '', {
                fontFamily: 'monospace',
                fontSize: '15px',
                color: '#fff7de',
                backgroundColor: 'rgba(21, 15, 12, 0.86)',
                padding: { left: 10, right: 10, top: 8, bottom: 8 },
                align: 'left',
                wordWrap: { width: 300 },
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1300)
            .setVisible(false);

        this.input.keyboard?.on('keydown', this.handleTyping, this);
        this.input.keyboard?.on('keydown', this.handleEditorShortcuts, this);
        this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleEditPointerDown, this);
        this.input.on(Phaser.Input.Events.POINTER_UP, this.handleEditPointerUp, this);
        this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handleEditPointerWheel, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard?.off('keydown', this.handleTyping, this);
            this.input.keyboard?.off('keydown', this.handleEditorShortcuts, this);
            this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleEditPointerDown, this);
            this.input.off(Phaser.Input.Events.POINTER_UP, this.handleEditPointerUp, this);
            this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleEditPointerWheel, this);
            this.hideEditorPanels();
            this.bossAttackTimer?.remove(false);
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, HOUSE_WIDTH, HOUSE_HEIGHT);
        camera.startFollow(this.player.sprite, true, 0.15, 0.15);
        camera.setZoom(PLAY_CAMERA_ZOOM);

        this.ensureDemonAnimations();
        this.ensureNightborneAnimations();
        this.ensureFlyingDemonAnimations();
        this.refreshBossStatusText();
        this.ensureEditorPanels();
    }

    update(): void {
        if (!this.player || !this.cursors) {
            return;
        }

        const didPressInteract = Phaser.Input.Keyboard.JustDown(this.interactKey);
        const didPressMeleeAttack = Phaser.Input.Keyboard.JustDown(this.meleeAttackKey);
        const didPressRangedAttack = Phaser.Input.Keyboard.JustDown(this.rangedAttackKey);
        const didPressCancel = Phaser.Input.Keyboard.JustDown(this.cancelKey);
        const didToggleEditMode = Phaser.Input.Keyboard.JustDown(this.editModeKey);
        const didSelectPreviousEditable = Phaser.Input.Keyboard.JustDown(this.previousEditableKey);
        const didSelectNextEditable = Phaser.Input.Keyboard.JustDown(this.nextEditableKey);
        const didDeleteEditable =
            Phaser.Input.Keyboard.JustDown(this.deleteEditableKey) ||
            Phaser.Input.Keyboard.JustDown(this.deleteForwardEditableKey);
        const didTogglePalette = Phaser.Input.Keyboard.JustDown(this.paletteKey);
        const didSelectPreviousPalette = Phaser.Input.Keyboard.JustDown(this.palettePreviousKey);
        const didSelectNextPalette = Phaser.Input.Keyboard.JustDown(this.paletteNextKey);
        const didPlacePaletteItem = Phaser.Input.Keyboard.JustDown(this.palettePlaceKey);
        const playerSprite = this.player.sprite;
        const velocity = new Phaser.Math.Vector2(0, 0);

        if (
            didToggleEditMode &&
            !this.isInteracting &&
            !this.isAwaitingInput &&
            !this.isWaitingForResponse &&
            !this.isSleepingInBed &&
            !this.isReading &&
            !this.isSitting
        ) {
            if (this.isEditMode) {
                this.exitEditMode();
            } else {
                this.enterEditMode();
            }
            return;
        }

        if (this.isEditMode) {
            this.stopBossMovement();
            if (didPressCancel) {
                if (this.isPaletteOpen) {
                    this.isPaletteOpen = false;
                    this.refreshEditModeUi();
                } else {
                    this.exitEditMode();
                }
                return;
            }

            this.interactionPrompt.setVisible(false);
            this.handleEditModeUpdate({
                didSelectPreviousEditable,
                didSelectNextEditable,
                didDeleteEditable,
                didTogglePalette,
                didSelectPreviousPalette,
                didSelectNextPalette,
                didPlacePaletteItem,
            });
            this.updateCharacterDepths();
            this.updateNameTags();
            return;
        }
        const nearestBossTarget = this.getNearestBossTarget(playerSprite.x, playerSprite.y);
        const bossDistance = nearestBossTarget?.distance ?? null;
        const nearBoss =
            this.bossAlive && bossDistance !== null && bossDistance <= DEMON_PLAYER_ATTACK_RANGE + 16;
        const nearBossPotion = this.isBossPotionNearby(playerSprite.x, playerSprite.y);
        const nearBossHpPotion = this.isBossHpPotionNearby(playerSprite.x, playerSprite.y);
        const isColonPlayer = this.selectedCharacterId === 'colon';
        const nearFridgeLeftovers =
            isColonPlayer &&
            this.bossAlive &&
            this.activeBossType === 'demon' &&
            !this.pizzaHelpUsed &&
            Phaser.Math.Distance.Between(
                playerSprite.x,
                playerSprite.y,
                FRIDGE_INTERACTION_POINT.x,
                FRIDGE_INTERACTION_POINT.y,
            ) <= FRIDGE_INTERACTION_RADIUS;
        const canColonCallGoodWitch =
            isColonPlayer &&
            this.bossAlive &&
            this.activeBossType === 'flying-demons' &&
            !this.witchHelpUsed;
        const nearestSleepTarget = this.getNearestSleepTarget(playerSprite.x, playerSprite.y);
        const nearBed =
            nearestSleepTarget && nearestSleepTarget.distance <= BED_INTERACTION_RADIUS
                ? nearestSleepTarget
                : null;
        const distanceToBooks = Phaser.Math.Distance.Between(
            playerSprite.x,
            playerSprite.y,
            BOOKS_POSITION.x,
            BOOKS_POSITION.y,
        );
        const nearBooks = distanceToBooks <= BOOKS_INTERACTION_RADIUS;
        const nearestSeat = this.getNearestSeat(playerSprite.x, playerSprite.y);
        const nearSeat =
            nearestSeat && nearestSeat.distance <= KITCHEN_SEAT_INTERACTION_RADIUS
                ? nearestSeat.seat
                : null;
        let nearestNpc: Character | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        this.npcs.forEach((npc) => {
            if (!npc.getDialogueAgent()) {
                return;
            }

            const distance = Phaser.Math.Distance.Between(
                playerSprite.x,
                playerSprite.y,
                npc.sprite.x,
                npc.sprite.y,
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestNpc = npc;
            }
        });

        const activeDistance = this.activeNpc
            ? Phaser.Math.Distance.Between(
                  playerSprite.x,
                  playerSprite.y,
                  this.activeNpc.sprite.x,
                  this.activeNpc.sprite.y,
              )
            : Infinity;

        const promptNpc = this.activeNpc ?? nearestNpc;
        const closeEnough = this.isInteracting
            ? activeDistance <= INTERACTION_RADIUS
            : nearestDistance <= INTERACTION_RADIUS;

        if (this.isSleepingInBed && this.playerBedSupported) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(
                    this.activeSleepBounds?.centerX ?? this.activeSleepPoint?.x ?? playerSprite.x,
                    (this.activeSleepBounds?.y ?? this.activeSleepPoint?.y ?? playerSprite.y) - 26,
                )
                .setText('Press SPACE to get up');
        } else if (this.isSitting && this.activeSeat) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(this.activeSeat.promptPosition.x, this.activeSeat.promptPosition.y)
                .setText('Press SPACE to stand up');
        } else if (this.isReading) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(BOOKS_POSITION.x, BOOKS_POSITION.y - 52)
                .setText('Press SPACE to stop reading');
        } else if (
            nearBed &&
            this.playerBedSupported &&
            !this.isInteracting &&
            !this.isWaitingForResponse
        ) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(nearBed.bounds.centerX, nearBed.bounds.y - 26)
                .setText('Press SPACE to sleep');
        } else if (
            nearSeat &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            !this.isReading
        ) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(nearSeat.promptPosition.x, nearSeat.promptPosition.y)
                .setText('Press SPACE to sit');
        } else if (nearBooks && !this.isInteracting && !this.isWaitingForResponse) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(BOOKS_POSITION.x, BOOKS_POSITION.y - 52)
                .setText('Press SPACE to read');
        } else if (nearBossHpPotion && !this.isInteracting && !this.isWaitingForResponse) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(this.bossHpPotion.x, this.bossHpPotion.y - 38)
                .setText('Press SPACE to drink HP potion');
        } else if (nearFridgeLeftovers && !this.isInteracting && !this.isWaitingForResponse) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(FRIDGE_INTERACTION_POINT.x, FRIDGE_INTERACTION_POINT.y - 56)
                .setText('Press SPACE to grab leftovers');
        } else if (canColonCallGoodWitch && !this.isInteracting && !this.isWaitingForResponse) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(playerSprite.x, playerSprite.y - 72)
                .setText('Press SPACE to call the Good Witch for help');
        } else if (nearBossPotion && !this.isInteracting && !this.isWaitingForResponse) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(this.bossMagicPotion.x, this.bossMagicPotion.y - 38)
                .setText('Press SPACE to drink potion');
        } else if (
            nearBoss &&
            nearestBossTarget &&
            !this.isInteracting &&
            !this.isWaitingForResponse
        ) {
            this.interactionPrompt
                .setVisible(true)
                .setPosition(nearestBossTarget.sprite.x, nearestBossTarget.sprite.y - 96)
                .setText('Press A or S to attack');
        } else if (promptNpc && closeEnough) {
            const promptText = this.isInteracting
                ? this.isAwaitingInput
                    ? 'Press ENTER to send'
                    : `${this.npcDisplayName} is thinking...`
                : 'Press SPACE to chat';

            this.interactionPrompt
                .setVisible(true)
                .setPosition(promptNpc.sprite.x, promptNpc.sprite.y - 60)
                .setText(promptText);
        } else {
            this.interactionPrompt.setVisible(false);
        }

        if (didPressInteract && nearBossHpPotion && !this.isInteracting && !this.isWaitingForResponse) {
            this.consumeBossHpPotion();
            return;
        }

        if (didPressInteract && nearFridgeLeftovers && !this.isInteracting && !this.isWaitingForResponse) {
            this.pizzaHelpUsed = true;
            this.grantPizzaProjectiles();
            this.showTemporaryCenterMessage('Grabbed leftovers!', 1600);
            return;
        }

        if (
            didPressInteract &&
            canColonCallGoodWitch &&
            !this.isInteracting &&
            !this.isWaitingForResponse
        ) {
            this.witchHelpUsed = true;
            this.showTemporaryCenterMessage('Calling the Good Witch!', 1600);
            this.scheduleGoodWitchArrival();
            return;
        }

        if (didPressInteract && nearBossPotion && !this.isInteracting && !this.isWaitingForResponse) {
            this.consumeBossPotion();
            return;
        }

        if (
            didPressMeleeAttack &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            !this.isSleepingInBed &&
            !this.isReading &&
            !this.isSitting
        ) {
            this.handlePlayerBossMeleeAttack();
        }

        if (
            didPressRangedAttack &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            !this.isSleepingInBed &&
            !this.isReading &&
            !this.isSitting
        ) {
            this.handlePlayerBossRangedAttack();
        }

        if (
            didPressInteract &&
            this.playerBedSupported &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            (nearBed || this.isSleepingInBed)
        ) {
            if (this.isSleepingInBed) {
                this.exitBed();
            } else if (nearBed) {
                this.enterBed(nearBed);
            }
            return;
        }

        if (
            didPressInteract &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            !this.isSleepingInBed &&
            !this.isReading &&
            (nearSeat || this.isSitting)
        ) {
            if (this.isSitting) {
                this.exitSitting();
            } else if (nearSeat) {
                this.enterSitting(nearSeat);
            }
            return;
        }

        if (
            didPressInteract &&
            !this.isInteracting &&
            !this.isWaitingForResponse &&
            !this.isSitting &&
            (nearBooks || this.isReading)
        ) {
            if (this.isReading) {
                this.exitReading();
            } else {
                this.enterReading();
            }
            return;
        }

        if (this.isInteracting && !closeEnough) {
            this.cancelConversation(true);
        } else if (!this.isInteracting && nearestDistance > INTERACTION_RADIUS) {
            if (this.threadMessages.length > 0) {
                this.threadMessages = [];
                this.npcDialogue.setVisible(false);
                this.playerInputText.setVisible(false);
                this.refreshThreadDisplay();
            }
        }

        if (didPressCancel && (this.isInteracting || this.isWaitingForResponse)) {
            this.cancelConversation(true);
        } else if (didPressCancel && !this.isSleepingInBed && !this.isReading && !this.isSitting) {
            this.scene.start('StartScene');
            return;
        }

        if (
            nearestNpc &&
            nearestDistance <= INTERACTION_RADIUS &&
            didPressInteract &&
            !this.isInteracting &&
            !this.isSitting
        ) {
            this.startConversation(nearestNpc);
        }

        if (!this.isSleepingInBed && !this.isReading && !this.isSitting) {
            if (this.cursors.left?.isDown) {
                velocity.x -= 1;
            } else if (this.cursors.right?.isDown) {
                velocity.x += 1;
            }

            if (this.cursors.up?.isDown) {
                velocity.y -= 1;
            } else if (this.cursors.down?.isDown) {
                velocity.y += 1;
            }

            this.player.move(velocity);
        } else if (this.isSleepingInBed) {
            this.player.idle();
        } else if (this.isReading) {
            const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
            body?.setVelocity(0, 0);
        } else if (this.isSitting) {
            const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
            body?.setVelocity(0, 0);
        }

        this.updateBoss();

        this.updateCharacterDepths();
        this.updateNameTags();
        this.refreshBossStatusText();
    }

    private buildHouse(staticBodies: Phaser.Physics.Arcade.StaticGroup): void {
        this.editableTargets = [];

        this.add.rectangle(0, 0, HOUSE_WIDTH, HOUSE_HEIGHT, 0x15100c).setOrigin(0);
        this.add.rectangle(HOUSE_WIDTH / 2, HOUSE_HEIGHT / 2, HOUSE_WIDTH - 64, HOUSE_HEIGHT - 64, 0xe7d8c0)
            .setStrokeStyle(4, 0x6e5744, 0.85);

        this.createRoom(372, 480, 696, 912, 0xe5d0b3, 'Living Room');
        this.createRoom(1032, 180, 600, 312, 0xd6e3cf, 'Kitchen');
        this.createRoom(870, 660, 252, 552, 0xe5d6d8, 'Bedroom 1');
        this.createRoom(1182, 660, 276, 552, 0xd4d7ec, 'Bedroom 2');

        const wallColor = 0x6d5543;

        const northWall = this.createSolid(
            staticBodies,
            HOUSE_WIDTH / 2,
            12,
            HOUSE_WIDTH,
            24,
            wallColor,
        );
        this.registerEditableSolidTarget('North wall', northWall.block, wallColor, northWall.labelText);

        const southWall = this.createSolid(
            staticBodies,
            HOUSE_WIDTH / 2,
            HOUSE_HEIGHT - 12,
            HOUSE_WIDTH,
            24,
            wallColor,
        );
        this.registerEditableSolidTarget('South wall', southWall.block, wallColor, southWall.labelText);

        const westWall = this.createSolid(staticBodies, 12, HOUSE_HEIGHT / 2, 24, HOUSE_HEIGHT, wallColor);
        this.registerEditableSolidTarget('West wall', westWall.block, wallColor, westWall.labelText);

        const eastWall = this.createSolid(
            staticBodies,
            HOUSE_WIDTH - 12,
            HOUSE_HEIGHT / 2,
            24,
            HOUSE_HEIGHT,
            wallColor,
        );
        this.registerEditableSolidTarget('East wall', eastWall.block, wallColor, eastWall.labelText);

        const dividerUpper = this.createSolid(staticBodies, 720, 96, 24, 144, wallColor);
        this.registerEditableSolidTarget(
            'Living room divider upper',
            dividerUpper.block,
            wallColor,
            dividerUpper.labelText,
        );

        const dividerMiddle = this.createSolid(staticBodies, 720, 456, 24, 384, wallColor);
        this.registerEditableSolidTarget(
            'Living room divider middle',
            dividerMiddle.block,
            wallColor,
            dividerMiddle.labelText,
        );

        const dividerLower = this.createSolid(staticBodies, 720, 840, 24, 192, wallColor);
        this.registerEditableSolidTarget(
            'Living room divider lower',
            dividerLower.block,
            wallColor,
            dividerLower.labelText,
        );

        const bedroomTopLeftWall = this.createSolid(staticBodies, 786, 360, 84, 24, wallColor);
        this.registerEditableSolidTarget(
            'Bedroom top left wall',
            bedroomTopLeftWall.block,
            wallColor,
            bedroomTopLeftWall.labelText,
        );

        const bedroomTopRightWall = this.createSolid(staticBodies, 1134, 360, 372, 24, wallColor);
        this.registerEditableSolidTarget(
            'Bedroom top right wall',
            bedroomTopRightWall.block,
            wallColor,
            bedroomTopRightWall.labelText,
        );

        const bedroomDividerUpper = this.createSolid(staticBodies, 1020, 516, 24, 264, wallColor);
        this.registerEditableSolidTarget(
            'Bedroom divider upper',
            bedroomDividerUpper.block,
            wallColor,
            bedroomDividerUpper.labelText,
        );

        const bedroomDividerLower = this.createSolid(staticBodies, 1020, 840, 24, 192, wallColor);
        this.registerEditableSolidTarget(
            'Bedroom divider lower',
            bedroomDividerLower.block,
            wallColor,
            bedroomDividerLower.labelText,
        );

        this.add.rectangle(720, 216, 28, 96, 0x987354, 0.2).setDepth(8);
        this.add.rectangle(720, 696, 28, 96, 0x987354, 0.2).setDepth(8);
        this.add.rectangle(888, 360, 120, 28, 0x987354, 0.2).setDepth(8);
        this.add.rectangle(1020, 696, 28, 96, 0x987354, 0.2).setDepth(8);

        this.add.rectangle(248, 352, 280, 180, 0xc0a16d, 0.35).setDepth(2);
        this.add.rectangle(1110, 656, 188, 148, 0xb18bc2, 0.18).setDepth(2);

        const livingTvTop = this.placeFrames('tiles_basement', [759, 760, 761], 3.25, 1.1, 3, 18);
        this.registerEditableTileTarget('Living room TV top', livingTvTop, {
            texture: 'tiles_basement',
            frames: [759, 760, 761],
            tileX: 3.25,
            tileY: 1.1,
            width: 3,
            baseDepth: 18,
        });

        const livingTvBody = this.placeFrames(
            'tiles_basement',
            [774, 775, 776, 777, 790, 791, 792, 793],
            2.5,
            1.9,
            4,
            18,
        );
        this.registerEditableTileTarget('Living room TV body', livingTvBody, {
            texture: 'tiles_basement',
            frames: [774, 775, 776, 777, 790, 791, 792, 793],
            tileX: 2.5,
            tileY: 1.9,
            width: 4,
            baseDepth: 18,
        });

        const couch = this.placeFrames(
            'tiles_basement',
            [135, 136, 137, 151, 152, 153],
            3,
            4.2,
            3,
            18,
        );
        this.registerEditableTileTarget('Living room couch', couch, {
            texture: 'tiles_basement',
            frames: [135, 136, 137, 151, 152, 153],
            tileX: 3,
            tileY: 4.2,
            width: 3,
            baseDepth: 18,
        });

        const couchHitbox = this.createColliderRect(staticBodies, 216, 250, 144, 96);
        this.registerEditableColliderTarget('Living room couch hitbox', couchHitbox);

        const tvHitbox = this.createColliderRect(staticBodies, 216, 96, 192, 96);
        this.registerEditableColliderTarget('Living room TV hitbox', tvHitbox);

        const deskChair = this.placeFrames('tiles_modern_office', [129, 145], 11, 2.3, 1, 18);
        this.registerEditableTileTarget('Desk chair', deskChair, {
            texture: 'tiles_modern_office',
            frames: [129, 145],
            tileX: 11,
            tileY: 2.3,
            width: 1,
            baseDepth: 18,
        });

        const desk = this.placeFrames(
            'tiles_modern_office',
            [455, 456, 457, 471, 472, 473],
            10,
            1,
            3,
            18,
        );
        this.registerEditableTileTarget('Desk', desk, {
            texture: 'tiles_modern_office',
            frames: [455, 456, 457, 471, 472, 473],
            tileX: 10,
            tileY: 1,
            width: 3,
            baseDepth: 18,
        });

        const computer = this.placeFrames('tiles_modern_office', [205, 206, 207], 9.9, 1, 3, 18);
        this.registerEditableTileTarget('Desk computer', computer, {
            texture: 'tiles_modern_office',
            frames: [205, 206, 207],
            tileX: 9.9,
            tileY: 1,
            width: 3,
            baseDepth: 18,
        });

        const bookshelf = this.placeFrames(
            'tiles_modern_office',
            [199, 200, 215, 216, 231, 232],
            13.3,
            3.1,
            2,
            18,
        );
        this.registerEditableTileTarget('Bookshelf', bookshelf, {
            texture: 'tiles_modern_office',
            frames: [199, 200, 215, 216, 231, 232],
            tileX: 13.3,
            tileY: 3.1,
            width: 2,
            baseDepth: 18,
        });

        const deskHitbox = this.createColliderRect(staticBodies, 552, 96, 144, 96);
        this.registerEditableColliderTarget('Desk hitbox', deskHitbox);

        const bookshelfHitbox = this.createColliderRect(staticBodies, 686, 221, 96, 144);
        this.registerEditableColliderTarget('Bookshelf hitbox', bookshelfHitbox);

        this.registerEditableAnchorTarget('Desk chair seat', [
            { label: 'prompt', vector: DESK_SEAT.promptPosition },
            { label: 'sit', vector: DESK_SEAT.sitPosition },
        ]);

        const counterRun = this.placeFrames('tiles_kitchen', [20, 20, 20, 20, 20], 17, 1, 5, 18);
        this.registerEditableTileTarget('Kitchen counters', counterRun, {
            texture: 'tiles_kitchen',
            frames: [20, 20, 20, 20, 20],
            tileX: 17,
            tileY: 1,
            width: 5,
            baseDepth: 18,
        });

        const oven = this.placeFrames('tiles_kitchen', [184, 200], 22, 1, 1, 18);
        this.registerEditableTileTarget('Kitchen oven', oven, {
            texture: 'tiles_kitchen',
            frames: [184, 200],
            tileX: 22,
            tileY: 1,
            width: 1,
            baseDepth: 18,
        });

        const fridge = this.placeFrames('tiles_kitchen', [377, 393, 409], 24, 1, 1, 18);
        this.registerEditableTileTarget('Kitchen fridge', fridge, {
            texture: 'tiles_kitchen',
            frames: [377, 393, 409],
            tileX: 24,
            tileY: 1,
            width: 1,
            baseDepth: 18,
        });

        const backChair = this.placeFrames('tiles_kitchen', [227], 19, 3.65, 1, 18);
        this.registerEditableTileTarget('Kitchen back chair', backChair, {
            texture: 'tiles_kitchen',
            frames: [227],
            tileX: 19,
            tileY: 3.65,
            width: 1,
            baseDepth: 18,
        });

        const leftChair = this.placeFrames('tiles_kitchen', [182, 198], 17.5, 4, 1, 18);
        this.registerEditableTileTarget('Kitchen left chair', leftChair, {
            texture: 'tiles_kitchen',
            frames: [182, 198],
            tileX: 17.5,
            tileY: 4,
            width: 1,
            baseDepth: 18,
        });

        const rightChair = this.placeFrames('tiles_kitchen', [213, 229], 20.5, 4, 1, 18);
        this.registerEditableTileTarget('Kitchen right chair', rightChair, {
            texture: 'tiles_kitchen',
            frames: [213, 229],
            tileX: 20.5,
            tileY: 4,
            width: 1,
            baseDepth: 18,
        });

        const table = this.placeFrames(
            'tiles_kitchen',
            [259, 260, 261, 275, 276, 277],
            18,
            4,
            3,
            18,
        );
        this.registerEditableTileTarget('Kitchen table', table, {
            texture: 'tiles_kitchen',
            frames: [259, 260, 261, 275, 276, 277],
            tileX: 18,
            tileY: 4,
            width: 3,
            baseDepth: 18,
        });

        const counterHitbox = this.createColliderRect(staticBodies, 936, 72, 240, 48);
        this.registerEditableColliderTarget('Kitchen counters hitbox', counterHitbox);

        const ovenHitbox = this.createColliderRect(staticBodies, 1080, 96, 48, 96);
        this.registerEditableColliderTarget('Kitchen oven hitbox', ovenHitbox);

        const fridgeHitbox = this.createColliderRect(staticBodies, 1176, 120, 48, 144);
        this.registerEditableColliderTarget('Kitchen fridge hitbox', fridgeHitbox);

        const tableHitbox = this.createColliderRect(staticBodies, 936, 240, 144, 96);
        this.registerEditableColliderTarget('Kitchen table hitbox', tableHitbox);

        this.registerEditableAnchorTarget('Kitchen left chair seat', [
            { label: 'prompt', vector: KITCHEN_SEATS[0].promptPosition },
            { label: 'sit', vector: KITCHEN_SEATS[0].sitPosition },
        ]);

        this.registerEditableAnchorTarget('Kitchen right chair seat', [
            { label: 'prompt', vector: KITCHEN_SEATS[1].promptPosition },
            { label: 'sit', vector: KITCHEN_SEATS[1].sitPosition },
        ]);

        const twinBedLeftHitbox = this.createColliderRect(staticBodies, 822, 624, 48, 96);
        const twinBedRightHitbox = this.createColliderRect(staticBodies, 930, 624, 48, 96);

        const twinBedLeft = this.add
            .sprite(822, 624, 'steve', BED_EMPTY_FRAME)
            .setDepth(644)
            .setOrigin(0.5, 0.5);
        this.registerEditableObjectsTarget('Bedroom 1 left bed', [twinBedLeft], [], {
            deletable: true,
            linkedColliders: [twinBedLeftHitbox],
        });

        const twinBedRight = this.add
            .sprite(930, 624, 'steve', BED_EMPTY_FRAME)
            .setDepth(644)
            .setOrigin(0.5, 0.5);
        this.registerEditableObjectsTarget('Bedroom 1 right bed', [twinBedRight], [], {
            deletable: true,
            linkedColliders: [twinBedRightHitbox],
        });

        const books = this.createBooks(780, 760);
        this.registerEditableObjectsTarget('Bedroom 1 books', books, [
            { label: 'read', vector: BOOKS_POSITION },
        ]);

        const mainBedHitbox = this.createColliderRect(
            staticBodies,
            BED_POSITION.x,
            BED_POSITION.y,
            48,
            96,
        );

        this.bedSprite = this.add
            .sprite(BED_POSITION.x, BED_POSITION.y, this.playerTexture, BED_EMPTY_FRAME)
            .setDepth(BED_POSITION.y + 20)
            .setOrigin(0.5, 0.5);
        this.registerEditableObjectsTarget('Bedroom 2 bed', [this.bedSprite], [
            { label: 'sleep', vector: BED_POSITION },
        ], {
            deletable: true,
            linkedColliders: [mainBedHitbox],
        });

        this.restoreEditableLayoutState();
    }

    private createRoom(
        x: number,
        y: number,
        width: number,
        height: number,
        color: number,
        label: string,
    ): void {
        this.add
            .rectangle(x, y, width, height, color)
            .setDepth(1)
            .setStrokeStyle(2, 0xffffff, 0.12);

        this.add
            .text(x - width / 2 + 18, y - height / 2 + 12, label, {
                fontFamily: '"Abaddon Bold", sans-serif',
                fontSize: '28px',
                color: '#5c4532',
            })
            .setDepth(9);
    }

    private createSolid(
        staticBodies: Phaser.Physics.Arcade.StaticGroup,
        x: number,
        y: number,
        width: number,
        height: number,
        color: number,
        label?: string,
    ): { block: Phaser.GameObjects.Rectangle; labelText?: Phaser.GameObjects.Text } {
        const block = this.add
            .rectangle(x, y, width, height, color)
            .setDepth(20)
            .setStrokeStyle(2, 0x2f2418, 0.5);

        this.physics.add.existing(block, true);
        staticBodies.add(block);

        let labelText: Phaser.GameObjects.Text | undefined;

        if (label) {
            labelText = this.add
                .text(x, y, label, {
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: '#f8f3eb',
                    align: 'center',
                    wordWrap: { width: Math.max(width - 12, 48) },
                })
                .setOrigin(0.5)
                .setDepth(21);
        }

        return { block, labelText };
    }

    private createDecor(
        x: number,
        y: number,
        width: number,
        height: number,
        color: number,
        label?: string,
    ): void {
        this.add.rectangle(x, y, width, height, color).setDepth(18).setStrokeStyle(2, 0x121212, 0.45);

        if (label) {
            this.add
                .text(x, y, label, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#eff6ff',
                })
                .setOrigin(0.5)
                .setDepth(19);
        }
    }

    private createBooks(x: number, y: number): BoundableObject[] {
        const objects: BoundableObject[] = [];

        [
            { dx: 0, dy: 0, color: 0x6f8fc0 },
            { dx: 22, dy: 10, color: 0xd69d6a },
            { dx: 38, dy: -8, color: 0x8f6bb7 },
            { dx: 14, dy: -20, color: 0x74a56f },
        ].forEach((book) => {
            const block = this.add
                .rectangle(x + book.dx, y + book.dy, 28, 12, book.color)
                .setAngle((book.dx - book.dy) * 0.3)
                .setDepth(12)
                .setStrokeStyle(1, 0x362c22, 0.55);

            objects.push(block as BoundableObject);
        });

        const label = this.add
            .text(x + 12, y + 30, 'Books', {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#5b4435',
            })
            .setOrigin(0.5)
            .setDepth(13);

        objects.push(label as BoundableObject);
        return objects;
    }

    private placeFrames(
        texture: string,
        frames: number[],
        tileX: number,
        tileY: number,
        width: number,
        baseDepth = 18,
        scale = 1,
    ): Phaser.GameObjects.Image[] {
        const objects: Phaser.GameObjects.Image[] = [];

        frames.forEach((frame, index) => {
            const metrics = this.getFrameMetrics(texture, frame, scale);
            const x = tileX * TILE_SIZE + (index % width) * metrics.stepX + metrics.stepX / 2;
            const y = tileY * TILE_SIZE + Math.floor(index / width) * metrics.stepY + metrics.stepY / 2;

            const image = this.add
                .image(x, y, texture, frame)
                .setScale(scale)
                .setDepth(baseDepth + y / TILE_SIZE);
            objects.push(image);
        });

        return objects;
    }

    private createColliderRect(
        staticBodies: Phaser.Physics.Arcade.StaticGroup,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Phaser.GameObjects.Rectangle {
        const block = this.add.rectangle(x, y, width, height, 0x000000, 0).setDepth(0);
        this.physics.add.existing(block, true);
        staticBodies.add(block);
        return block;
    }

    private getFrameMetrics(texture: string, frame: number, scale: number): {
        stepX: number;
        stepY: number;
    } {
        const textureFrame = this.textures.getFrame(texture, frame);
        const sourceWidth = textureFrame?.width ?? TILE_SIZE;
        const sourceHeight = textureFrame?.height ?? TILE_SIZE;

        return {
            stepX: sourceWidth * scale,
            stepY: sourceHeight * scale,
        };
    }

    private registerEditableTileTarget(
        name: string,
        images: Phaser.GameObjects.Image[],
        config: {
            texture: string;
            frames: number[];
            tileX: number;
            tileY: number;
            width: number;
            baseDepth?: number;
            scale?: number;
            linkedColliders?: Array<{
                collider: Phaser.GameObjects.Rectangle;
                offsetX: number;
                offsetY: number;
            }>;
            linkedPoints?: Array<EditableTargetPoint & { offsetX: number; offsetY: number }>;
        },
    ): EditableTarget {
        const id = this.toEditableId(name);
        let tileX = config.tileX;
        let tileY = config.tileY;
        const baseDepth = config.baseDepth ?? 18;
        const scale = config.scale ?? 1;
        const metrics = this.getFrameMetrics(config.texture, config.frames[0], scale);
        const linkedColliders = config.linkedColliders ?? [];
        const linkedPoints = config.linkedPoints ?? [];

        const reposition = () => {
            const originX = tileX * TILE_SIZE;
            const originY = tileY * TILE_SIZE;

            images.forEach((image, index) => {
                const x =
                    originX + (index % config.width) * metrics.stepX + metrics.stepX / 2;
                const y =
                    originY +
                    Math.floor(index / config.width) * metrics.stepY +
                    metrics.stepY / 2;
                image.setPosition(x, y);
                image.setScale(scale);
                image.setDepth(baseDepth + y / TILE_SIZE);
            });

            linkedColliders.forEach((entry) => {
                entry.collider.setPosition(originX + entry.offsetX, originY + entry.offsetY);
                const body = entry.collider.body as Phaser.Physics.Arcade.StaticBody | null;
                body?.updateFromGameObject();
            });

            linkedPoints.forEach((entry) => {
                entry.vector.set(originX + entry.offsetX, originY + entry.offsetY);
            });
        };

        reposition();

        const target: EditableTarget = {
            id,
            name,
            kind: 'tiles',
            deletable: true,
            moveBy: (dx, dy) => {
                tileX += dx / TILE_SIZE;
                tileY += dy / TILE_SIZE;
                reposition();
            },
            getBounds: () => this.expandBounds(this.getBoundsForObjects(images), EDITOR_SELECTION_PADDING),
            getHelperRects:
                linkedColliders.length > 0
                    ? () =>
                          linkedColliders.map(
                              (entry) =>
                                  new Phaser.Geom.Rectangle(
                                      entry.collider.x - entry.collider.width / 2,
                                      entry.collider.y - entry.collider.height / 2,
                                      entry.collider.width,
                                      entry.collider.height,
                                  ),
                          )
                    : undefined,
            getInfoLines: () => [
                'kind: tile group',
                `texture: ${config.texture}`,
                `frames: ${config.frames.join(', ')}`,
                `tile: ${tileX.toFixed(2)}, ${tileY.toFixed(2)}`,
                `scale: ${scale.toFixed(2)}`,
                `linked hitboxes: ${linkedColliders.length}`,
                `linked anchors: ${linkedPoints.length}`,
                `px: ${(tileX * TILE_SIZE + TILE_SIZE / 2).toFixed(0)}, ${(
                    tileY * TILE_SIZE +
                    TILE_SIZE / 2
                ).toFixed(0)}`,
            ],
            getPoints:
                linkedPoints.length > 0
                    ? () =>
                          linkedPoints.map((entry) => ({
                              label: entry.label,
                              x: entry.vector.x,
                              y: entry.vector.y,
                          }))
                    : undefined,
            destroy: () => {
                images.forEach((image) => image.destroy());
                linkedColliders.forEach((entry) => {
                    this.staticBodiesGroup.remove(entry.collider, true, true);
                });
            },
            serialize: () => ({
                id,
                name,
                kind: 'tiles',
                texture: config.texture,
                frames: [...config.frames],
                tileX,
                tileY,
                width: config.width,
                baseDepth,
                scale,
                linkedColliders: linkedColliders.map((entry) => ({
                    x: entry.collider.x,
                    y: entry.collider.y,
                    width: entry.collider.width,
                    height: entry.collider.height,
                })),
                linkedPoints: linkedPoints.map((entry) => ({
                    label: entry.label,
                    x: entry.vector.x,
                    y: entry.vector.y,
                })),
            }),
            restore: (state) => {
                if (state.kind !== 'tiles') {
                    return;
                }

                tileX = state.tileX;
                tileY = state.tileY;
                reposition();
            },
            duplicate: () => {
                const cloneTileX = tileX + 1;
                const cloneTileY = tileY + 1;
                const cloneImages = this.placeFrames(
                    config.texture,
                    config.frames,
                    cloneTileX,
                    cloneTileY,
                    config.width,
                    baseDepth,
                    scale,
                );

                return this.registerEditableTileTarget(this.createEditableCopyName(name), cloneImages, {
                    ...config,
                    tileX: cloneTileX,
                    tileY: cloneTileY,
                    baseDepth,
                    scale,
                });
            },
        };

        this.editableTargets.push(target);
        return target;
    }

    private registerEditableObjectsTarget(
        name: string,
        objects: BoundableObject[],
        linkedPoints: EditableTargetPoint[] = [],
        options?: {
            deletable?: boolean;
            linkedColliders?: Phaser.GameObjects.Rectangle[];
        },
    ): EditableTarget {
        const id = this.toEditableId(name);
        const linkedColliders = options?.linkedColliders ?? [];
        const target: EditableTarget = {
            id,
            name,
            kind: 'objects',
            deletable: options?.deletable ?? false,
            moveBy: (dx, dy) => {
                objects.forEach((object) => {
                    object.setPosition(object.x + dx, object.y + dy);
                });

                linkedColliders.forEach((collider) => {
                    collider.setPosition(collider.x + dx, collider.y + dy);
                    const body = collider.body as Phaser.Physics.Arcade.StaticBody | null;
                    body?.updateFromGameObject();
                });

                linkedPoints.forEach((point) => {
                    point.vector.x += dx;
                    point.vector.y += dy;
                });
            },
            getBounds: () => this.expandBounds(this.getBoundsForObjects(objects), EDITOR_SELECTION_PADDING),
            getHelperRects:
                linkedColliders.length > 0
                    ? () =>
                          linkedColliders.map(
                              (collider) =>
                                  new Phaser.Geom.Rectangle(
                                      collider.x - collider.width / 2,
                                      collider.y - collider.height / 2,
                                      collider.width,
                                      collider.height,
                                  ),
                          )
                    : undefined,
            getInfoLines: () => {
                const bounds = this.getBoundsForObjects(objects);
                const lines = [
                    'kind: object group',
                    `center: ${bounds.centerX.toFixed(0)}, ${bounds.centerY.toFixed(0)}`,
                    `size: ${bounds.width.toFixed(0)} x ${bounds.height.toFixed(0)}`,
                    `linked hitboxes: ${linkedColliders.length}`,
                ];

                linkedPoints.forEach((point) => {
                    lines.push(`${point.label}: ${point.vector.x.toFixed(0)}, ${point.vector.y.toFixed(0)}`);
                });

                return lines;
            },
            getPoints:
                linkedPoints.length > 0
                    ? () =>
                          linkedPoints.map((point) => ({
                              label: point.label,
                              x: point.vector.x,
                              y: point.vector.y,
                          }))
                    : undefined,
            destroy: () => {
                objects.forEach((object) => object.destroy());
                linkedColliders.forEach((collider) => {
                    this.staticBodiesGroup.remove(collider, true, true);
                });
            },
            serialize: () => ({
                id,
                name,
                kind: 'objects',
                positions: objects.map((object) => ({
                    x: object.x,
                    y: object.y,
                })),
                points: linkedPoints.map((point) => ({
                    label: point.label,
                    x: point.vector.x,
                    y: point.vector.y,
                })),
                linkedColliders: linkedColliders.map((collider) => ({
                    x: collider.x,
                    y: collider.y,
                    width: collider.width,
                    height: collider.height,
                })),
            }),
            restore: (state) => {
                if (state.kind !== 'objects') {
                    return;
                }

                state.positions.forEach((position, index) => {
                    const object = objects[index];
                    if (object) {
                        object.setPosition(position.x, position.y);
                    }
                });

                state.points.forEach((savedPoint) => {
                    const point = linkedPoints.find((entry) => entry.label === savedPoint.label);
                    if (point) {
                        point.vector.set(savedPoint.x, savedPoint.y);
                    }
                });

                state.linkedColliders?.forEach((savedCollider, index) => {
                    const collider = linkedColliders[index];
                    if (!collider) {
                        return;
                    }

                    collider.setPosition(savedCollider.x, savedCollider.y);
                    const body = collider.body as Phaser.Physics.Arcade.StaticBody | null;
                    body?.updateFromGameObject();
                });
            },
        };

        this.editableTargets.push(target);
        return target;
    }

    private registerEditableColliderTarget(
        name: string,
        collider: Phaser.GameObjects.Rectangle,
    ): EditableTarget {
        const id = this.toEditableId(name);
        const target: EditableTarget = {
            id,
            name,
            kind: 'collider',
            deletable: true,
            moveBy: (dx, dy) => {
                collider.setPosition(collider.x + dx, collider.y + dy);
                const body = collider.body as Phaser.Physics.Arcade.StaticBody | null;
                body?.updateFromGameObject();
            },
            getBounds: () =>
                this.expandBounds(
                    new Phaser.Geom.Rectangle(
                        collider.x - collider.width / 2,
                        collider.y - collider.height / 2,
                        collider.width,
                        collider.height,
                    ),
                    EDITOR_SELECTION_PADDING,
                ),
            getHelperRects: () => [
                new Phaser.Geom.Rectangle(
                    collider.x - collider.width / 2,
                    collider.y - collider.height / 2,
                    collider.width,
                    collider.height,
                ),
            ],
            getInfoLines: () => [
                'kind: hitbox',
                `center: ${collider.x.toFixed(0)}, ${collider.y.toFixed(0)}`,
                `size: ${collider.width.toFixed(0)} x ${collider.height.toFixed(0)}`,
                `snippet: createColliderRect(..., ${collider.x.toFixed(0)}, ${collider.y.toFixed(0)}, ${collider.width.toFixed(0)}, ${collider.height.toFixed(0)})`,
            ],
            destroy: () => {
                collider.destroy();
            },
            serialize: () => ({
                id,
                name,
                kind: 'collider',
                x: collider.x,
                y: collider.y,
                width: collider.width,
                height: collider.height,
            }),
            restore: (state) => {
                if (state.kind !== 'collider') {
                    return;
                }

                collider.setPosition(state.x, state.y);
                const body = collider.body as Phaser.Physics.Arcade.StaticBody | null;
                body?.updateFromGameObject();
            },
            duplicate: () => {
                const clone = this.createColliderRect(
                    this.staticBodiesGroup,
                    collider.x + TILE_SIZE,
                    collider.y + TILE_SIZE,
                    collider.width,
                    collider.height,
                );

                return this.registerEditableColliderTarget(
                    this.createEditableCopyName(name),
                    clone,
                );
            },
        };

        this.editableTargets.push(target);
        return target;
    }

    private registerEditableSolidTarget(
        name: string,
        block: Phaser.GameObjects.Rectangle,
        color: number,
        labelText?: Phaser.GameObjects.Text,
    ): EditableTarget {
        const id = this.toEditableId(name);
        const updateSolidBody = () => {
            const body = block.body as Phaser.Physics.Arcade.StaticBody | null;
            body?.updateFromGameObject();
        };
        const applySize = (width: number, height: number) => {
            block.setSize(width, height);
            block.width = width;
            block.height = height;
            updateSolidBody();

            if (labelText) {
                labelText.setPosition(block.x, block.y);
            }
        };

        const target: EditableTarget = {
            id,
            name,
            kind: 'solid',
            deletable: true,
            moveBy: (dx, dy) => {
                block.setPosition(block.x + dx, block.y + dy);
                labelText?.setPosition(labelText.x + dx, labelText.y + dy);
                updateSolidBody();
            },
            resizeBy: (delta) => {
                const isHorizontal = block.width >= block.height;
                const minLength = Math.max(TILE_SIZE, Math.min(block.width, block.height));

                if (isHorizontal) {
                    applySize(Math.max(minLength, block.width + delta), block.height);
                } else {
                    applySize(block.width, Math.max(minLength, block.height + delta));
                }
            },
            getBounds: () =>
                this.expandBounds(
                    new Phaser.Geom.Rectangle(
                        block.x - block.width / 2,
                        block.y - block.height / 2,
                        block.width,
                        block.height,
                    ),
                    EDITOR_SELECTION_PADDING,
                ),
            getHelperRects: () => [
                new Phaser.Geom.Rectangle(
                    block.x - block.width / 2,
                    block.y - block.height / 2,
                    block.width,
                    block.height,
                ),
            ],
            getInfoLines: () => [
                'kind: wall/solid',
                `center: ${block.x.toFixed(0)}, ${block.y.toFixed(0)}`,
                `size: ${block.width.toFixed(0)} x ${block.height.toFixed(0)}`,
                `resize: ${block.width >= block.height ? 'horizontal' : 'vertical'} with [ and ]`,
            ],
            destroy: () => {
                labelText?.destroy();
                block.destroy();
            },
            serialize: () => ({
                id,
                name,
                kind: 'solid',
                x: block.x,
                y: block.y,
                width: block.width,
                height: block.height,
                color,
            }),
            restore: (state) => {
                if (state.kind !== 'solid') {
                    return;
                }

                block.setPosition(state.x, state.y);
                applySize(state.width, state.height);

                if (labelText) {
                    labelText.setPosition(state.x, state.y);
                }
            },
            duplicate: () => {
                const clone = this.createSolid(
                    this.staticBodiesGroup,
                    block.x + TILE_SIZE,
                    block.y + TILE_SIZE,
                    block.width,
                    block.height,
                    color,
                );

                return this.registerEditableSolidTarget(
                    this.createEditableCopyName(name),
                    clone.block,
                    color,
                    clone.labelText,
                );
            },
        };

        this.editableTargets.push(target);
        return target;
    }

    private registerEditableAnchorTarget(name: string, points: EditableTargetPoint[]): EditableTarget {
        const id = this.toEditableId(name);
        const target: EditableTarget = {
            id,
            name,
            kind: 'anchors',
            deletable: false,
            moveBy: (dx, dy) => {
                points.forEach((point) => {
                    point.vector.x += dx;
                    point.vector.y += dy;
                });
            },
            getBounds: () =>
                this.expandBounds(
                    this.getBoundsForPoints(
                        points.map((point) => ({
                            x: point.vector.x,
                            y: point.vector.y,
                        })),
                    ),
                    EDITOR_SELECTION_PADDING,
                ),
            getInfoLines: () => [
                'kind: anchor points',
                ...points.map(
                    (point) =>
                        `${point.label}: ${point.vector.x.toFixed(0)}, ${point.vector.y.toFixed(0)}`,
                ),
            ],
            getPoints: () =>
                points.map((point) => ({
                    label: point.label,
                    x: point.vector.x,
                    y: point.vector.y,
                })),
            destroy: () => {},
            serialize: () => ({
                id,
                name,
                kind: 'anchors',
                points: points.map((point) => ({
                    label: point.label,
                    x: point.vector.x,
                    y: point.vector.y,
                })),
            }),
            restore: (state) => {
                if (state.kind !== 'anchors') {
                    return;
                }

                state.points.forEach((savedPoint) => {
                    const point = points.find((entry) => entry.label === savedPoint.label);
                    if (point) {
                        point.vector.set(savedPoint.x, savedPoint.y);
                    }
                });
            },
        };

        this.editableTargets.push(target);
        return target;
    }

    private enterEditMode(): void {
        this.isEditMode = true;
        this.isDraggingEditable = false;
        this.dragLastWorldPoint = null;
        this.hasActiveDragUndoSnapshot = false;
        this.cameras.main.stopFollow();
        this.interactionPrompt.setVisible(false);
        this.editorGrid.setVisible(true);
        this.editorHelpers.setVisible(true);
        this.editorSelection.setVisible(true);
        this.editorText.setVisible(false);
        this.editorPaletteText.setVisible(false);
        this.cameras.main.setZoom(this.editModeZoom);
        this.selectedEditableIndex = Phaser.Math.Clamp(
            this.selectedEditableIndex,
            0,
            Math.max(this.editableTargets.length - 1, 0),
        );
        this.ensureEditorPanels();
        this.focusOnSelectedEditableTarget();
        this.refreshEditModeUi();
    }

    private exitEditMode(): void {
        this.isEditMode = false;
        this.isDraggingEditable = false;
        this.dragLastWorldPoint = null;
        this.hasActiveDragUndoSnapshot = false;
        this.editorGrid.setVisible(false);
        this.editorHelpers.clear();
        this.editorHelpers.setVisible(false);
        this.editorSelection.clear();
        this.editorSelection.setVisible(false);
        this.editorText.setVisible(false);
        this.editorPaletteText.setVisible(false);
        this.hideEditorPanels();
        this.cameras.main.setZoom(PLAY_CAMERA_ZOOM);
        this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    }

    private handleEditModeUpdate(options: {
        didSelectPreviousEditable: boolean;
        didSelectNextEditable: boolean;
        didDeleteEditable: boolean;
        didTogglePalette: boolean;
        didSelectPreviousPalette: boolean;
        didSelectNextPalette: boolean;
        didPlacePaletteItem: boolean;
    }): void {
        if (this.editableTargets.length === 0) {
            this.editorSelection.clear();
            this.refreshEditorPanels(null);
            return;
        }

        if (options.didTogglePalette) {
            this.isPaletteOpen = !this.isPaletteOpen;
            this.refreshEditModeUi();
        }

        if (this.isPaletteOpen && options.didSelectPreviousPalette) {
            this.selectedPaletteIndex =
                (this.selectedPaletteIndex - 1 + FURNITURE_PALETTE.length) % FURNITURE_PALETTE.length;
            this.refreshEditModeUi();
        }

        if (this.isPaletteOpen && options.didSelectNextPalette) {
            this.selectedPaletteIndex = (this.selectedPaletteIndex + 1) % FURNITURE_PALETTE.length;
            this.refreshEditModeUi();
        }

        const selectedTarget = this.editableTargets[this.selectedEditableIndex];

        if (!this.isPaletteOpen && options.didSelectPreviousPalette && selectedTarget?.resizeBy) {
            this.pushUndoSnapshot();
            selectedTarget.resizeBy(-TILE_SIZE);
            this.markEditableLayoutDirty();
            this.refreshEditModeUi();
            return;
        }

        if (!this.isPaletteOpen && options.didSelectNextPalette && selectedTarget?.resizeBy) {
            this.pushUndoSnapshot();
            selectedTarget.resizeBy(TILE_SIZE);
            this.markEditableLayoutDirty();
            this.refreshEditModeUi();
            return;
        }

        if (this.isPaletteOpen && options.didPlacePaletteItem) {
            this.placeSelectedPaletteItemAt(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
        }

        if (options.didDeleteEditable) {
            this.deleteSelectedEditableTarget();
            return;
        }

        if (options.didSelectPreviousEditable) {
            this.selectedEditableIndex =
                (this.selectedEditableIndex - 1 + this.editableTargets.length) %
                this.editableTargets.length;
            this.focusOnSelectedEditableTarget();
            this.refreshEditModeUi();
        }

        if (options.didSelectNextEditable) {
            this.selectedEditableIndex = (this.selectedEditableIndex + 1) % this.editableTargets.length;
            this.focusOnSelectedEditableTarget();
            this.refreshEditModeUi();
        }

        if (Phaser.Input.Keyboard.JustDown(this.duplicateEditableKey)) {
            this.pushUndoSnapshot();
            const duplicate = this.editableTargets[this.selectedEditableIndex]?.duplicate?.();

            if (duplicate) {
                this.selectedEditableIndex = this.editableTargets.indexOf(duplicate);
                this.markEditableLayoutDirty();
                this.focusOnSelectedEditableTarget();
                this.refreshEditModeUi();
            }
        }

        const moveStep = this.fineNudgeKey.isDown ? 1 : this.cursors.shift?.isDown ? 16 : 4;
        const keyboard = this.input.keyboard;
        let dx = 0;
        let dy = 0;

        if (keyboard?.checkDown(this.cursors.left, 60)) {
            dx -= moveStep;
        }

        if (keyboard?.checkDown(this.cursors.right, 60)) {
            dx += moveStep;
        }

        if (keyboard?.checkDown(this.cursors.up, 60)) {
            dy -= moveStep;
        }

        if (keyboard?.checkDown(this.cursors.down, 60)) {
            dy += moveStep;
        }

        if (dx !== 0 || dy !== 0) {
            this.pushUndoSnapshot();
            this.editableTargets[this.selectedEditableIndex]?.moveBy(dx, dy);
            this.markEditableLayoutDirty();
            this.refreshEditModeUi();
        }

        this.handleEditModeDragging();
    }

    private refreshEditModeUi(): void {
        if (!this.isEditMode) {
            return;
        }

        this.drawEditModeHelpers();
        this.editorText.setVisible(false);
        this.editorPaletteText.setVisible(false);

        const target = this.editableTargets[this.selectedEditableIndex];

        if (!target) {
            this.editorSelection.clear();
            this.refreshEditorPanels(null);
            return;
        }

        const bounds = target.getBounds();
        this.refreshEditorPanels(target);

        this.editorSelection.clear();
        this.editorSelection.lineStyle(2, 0xffde7a, 0.95);
        this.editorSelection.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        const points = target.getPoints?.() ?? [];
        points.forEach((point) => {
            this.editorSelection.fillStyle(0x80f7c2, 1);
            this.editorSelection.fillCircle(point.x, point.y, 5);
            this.editorSelection.lineStyle(2, 0x103427, 0.9);
            this.editorSelection.strokeCircle(point.x, point.y, 6);
        });
    }

    private drawEditModeHelpers(): void {
        this.editorHelpers.clear();

        if (!this.isEditMode) {
            return;
        }

        this.editorHelpers.fillStyle(0x8ff0b7, 0.16);
        this.editorHelpers.lineStyle(1.5, 0x8ff0b7, 0.55);

        this.editableTargets.forEach((target, index) => {
            const helperRects = target.getHelperRects?.() ?? [];

            helperRects.forEach((rect) => {
                this.editorHelpers.fillRect(rect.x, rect.y, rect.width, rect.height);
                this.editorHelpers.strokeRect(rect.x, rect.y, rect.width, rect.height);
            });

            const points = target.getPoints?.() ?? [];
            points.forEach((point) => {
                const isSelected = index === this.selectedEditableIndex;
                this.editorHelpers.fillStyle(isSelected ? 0xb6ffd0 : 0x8ff0b7, isSelected ? 0.95 : 0.75);
                this.editorHelpers.fillCircle(point.x, point.y, isSelected ? 5 : 4);
                this.editorHelpers.lineStyle(2, 0x1f5f39, 0.9);
                this.editorHelpers.strokeCircle(point.x, point.y, isSelected ? 6 : 5);
            });
        });
    }

    private focusOnSelectedEditableTarget(): void {
        const target = this.editableTargets[this.selectedEditableIndex];

        if (!target) {
            return;
        }

        const bounds = target.getBounds();
        this.cameras.main.pan(bounds.centerX, bounds.centerY, 140, 'Sine.easeOut');
    }

    private handleEditPointerDown(pointer: Phaser.Input.Pointer): void {
        if (!this.isEditMode) {
            this.handleGameplayPointerDown(pointer);
            return;
        }

        const index = this.findEditableTargetAt(pointer.worldX, pointer.worldY);

        if (index === null) {
            if (this.isPaletteOpen) {
                this.placeSelectedPaletteItemAt(pointer.worldX, pointer.worldY);
            }
            this.isDraggingEditable = false;
            this.dragLastWorldPoint = null;
            this.hasActiveDragUndoSnapshot = false;
            return;
        }

        this.selectedEditableIndex = index;
        this.isDraggingEditable = true;
        this.hasActiveDragUndoSnapshot = false;
        this.dragLastWorldPoint = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
        this.refreshEditModeUi();
    }

    private handleGameplayPointerDown(pointer: Phaser.Input.Pointer): void {
        if (
            this.isInteracting ||
            this.isAwaitingInput ||
            this.isWaitingForResponse ||
            this.isSleepingInBed ||
            this.isReading ||
            this.isSitting
        ) {
            return;
        }

        const clickedPlant = this.findPlantTargetAt(pointer.worldX, pointer.worldY);

        if (!clickedPlant) {
            return;
        }

        if (clickedPlant.name.startsWith('Plant 2') || clickedPlant.name.startsWith('Plant 6')) {
            this.showTemporaryCenterMessage('Enemy under construction');
            return;
        }

        if (this.bossSprite?.active && this.bossAlive) {
            return;
        }

        const bossType = clickedPlant.name.startsWith('Plant 3')
            ? 'flying-demons'
            : clickedPlant.name.startsWith('Plant 2')
              ? 'nightborne'
              : 'demon';
        const spawnPoint = clickedPlant.name.startsWith('Plant 3')
            ? new Phaser.Math.Vector2(
                  clickedPlant.getBounds().centerX,
                  clickedPlant.getBounds().centerY - 22,
              )
            : undefined;

        this.summonBoss(bossType, spawnPoint);
    }

    private handleEditPointerUp(): void {
        this.isDraggingEditable = false;
        this.dragLastWorldPoint = null;
        this.hasActiveDragUndoSnapshot = false;
    }

    private handleEditModeDragging(): void {
        if (!this.isDraggingEditable || !this.dragLastWorldPoint) {
            return;
        }

        const pointer = this.input.activePointer;

        if (!pointer.isDown) {
            this.isDraggingEditable = false;
            this.dragLastWorldPoint = null;
            this.hasActiveDragUndoSnapshot = false;
            return;
        }

        const dx = pointer.worldX - this.dragLastWorldPoint.x;
        const dy = pointer.worldY - this.dragLastWorldPoint.y;

        if (dx === 0 && dy === 0) {
            return;
        }

        if (!this.hasActiveDragUndoSnapshot) {
            this.pushUndoSnapshot();
            this.hasActiveDragUndoSnapshot = true;
        }

        this.editableTargets[this.selectedEditableIndex]?.moveBy(dx, dy);
        this.dragLastWorldPoint.set(pointer.worldX, pointer.worldY);
        this.markEditableLayoutDirty();
        this.refreshEditModeUi();
    }

    private findEditableTargetAt(worldX: number, worldY: number): number | null {
        const candidates = this.editableTargets
            .map((target, index) => ({
                target,
                index,
                bounds: target.getBounds(),
            }))
            .filter(({ bounds }) => Phaser.Geom.Rectangle.Contains(bounds, worldX, worldY))
            .sort((a, b) => {
                const priorityDifference =
                    this.getEditableTargetPriority(a.target.kind) -
                    this.getEditableTargetPriority(b.target.kind);

                if (priorityDifference !== 0) {
                    return priorityDifference;
                }

                return a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height;
            });

        if (candidates.length > 0) {
            return candidates[0].index;
        }

        let bestIndex: number | null = null;
        let bestDistance = 48;

        this.editableTargets.forEach((target, index) => {
            const bounds = target.getBounds();
            const distance = Phaser.Math.Distance.Between(worldX, worldY, bounds.centerX, bounds.centerY);

            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });

        return bestIndex;
    }

    private findPlantTargetAt(worldX: number, worldY: number): EditableTarget | null {
        const plants = this.editableTargets.filter(
            (target) =>
                (target.name.startsWith('Plant 1') ||
                    target.name.startsWith('Plant 2') ||
                    target.name.startsWith('Plant 3') ||
                    target.name.startsWith('Plant 6')) &&
                Phaser.Geom.Rectangle.Contains(target.getBounds(), worldX, worldY),
        );

        if (plants.length === 0) {
            return null;
        }

        return plants[0];
    }

    private getNearestSeat(
        playerX: number,
        playerY: number,
    ): { seat: SeatInteraction; distance: number } | null {
        const seats = [...INTERACTIVE_SEATS, ...this.getDynamicSeatInteractions()];
        const nearest =
            seats
                .map((seat) => ({
                    seat,
                    distance: Phaser.Math.Distance.Between(
                        playerX,
                        playerY,
                        seat.promptPosition.x,
                        seat.promptPosition.y,
                    ),
                }))
                .sort((a, b) => a.distance - b.distance)[0] ?? null;

        return nearest;
    }

    private getDynamicSeatInteractions(): SeatInteraction[] {
        const seats: SeatInteraction[] = [];

        this.editableTargets.forEach((target) => {
            const points = target.getPoints?.() ?? [];

            ['left', 'right', 'up', 'down'].forEach((direction) => {
                const prompt = points.find((point) => point.label === `prompt:${direction}`);
                const sit = points.find((point) => point.label === `sit:${direction}`);

                if (!prompt || !sit) {
                    return;
                }

                seats.push({
                    name: `${target.name}-${direction}`,
                    promptPosition: new Phaser.Math.Vector2(prompt.x, prompt.y),
                    sitPosition: new Phaser.Math.Vector2(sit.x, sit.y),
                    facing: direction as Direction,
                    exitOffset: this.getSeatExitOffset(direction as Direction),
                });
            });
        });

        return seats;
    }

    private getSeatExitOffset(direction: Direction): Phaser.Math.Vector2 {
        switch (direction) {
            case 'left':
                return new Phaser.Math.Vector2(32, 6);
            case 'right':
                return new Phaser.Math.Vector2(-32, 6);
            case 'up':
                return new Phaser.Math.Vector2(0, 44);
            case 'down':
                return new Phaser.Math.Vector2(0, -44);
            default:
                return new Phaser.Math.Vector2(0, 40);
        }
    }

    private getEditableTargetPriority(kind: EditableTarget['kind']): number {
        switch (kind) {
            case 'tiles':
                return 0;
            case 'objects':
                return 1;
            case 'anchors':
                return 2;
            case 'collider':
                return 3;
            case 'solid':
                return 4;
            default:
                return 10;
        }
    }

    private handleEditorShortcuts(event: KeyboardEvent): void {
        if (!this.isEditMode) {
            return;
        }

        if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            this.adjustEditModeZoom(-EDIT_MODE_ZOOM_STEP);
            return;
        }

        if (event.key === '=' || event.key === '+') {
            event.preventDefault();
            this.adjustEditModeZoom(EDIT_MODE_ZOOM_STEP);
            return;
        }

        if (event.key === '0') {
            event.preventDefault();
            this.resetEditModeZoom();
            return;
        }

        const isModifierDown = event.metaKey || event.ctrlKey;

        if (!isModifierDown) {
            return;
        }

        const key = event.key.toLowerCase();

        if (key === 's') {
            event.preventDefault();
            this.saveEditableLayoutState();
            this.refreshEditModeUi();
            return;
        }

        if (key === 'z') {
            event.preventDefault();
            this.undoEditableLayoutState();
        }
    }

    private handleEditPointerWheel(
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
    ): void {
        if (!this.isEditMode) {
            return;
        }

        const zoomDelta = deltaY > 0 ? -EDIT_MODE_ZOOM_STEP : EDIT_MODE_ZOOM_STEP;
        this.adjustEditModeZoom(zoomDelta);
    }

    private adjustEditModeZoom(delta: number): void {
        this.editModeZoom = Phaser.Math.Clamp(
            Number((this.editModeZoom + delta).toFixed(2)),
            MIN_EDIT_MODE_ZOOM,
            MAX_EDIT_MODE_ZOOM,
        );
        this.cameras.main.setZoom(this.editModeZoom);
        this.refreshEditModeUi();
    }

    private resetEditModeZoom(): void {
        this.editModeZoom = PLAY_CAMERA_ZOOM;
        this.cameras.main.setZoom(this.editModeZoom);
        this.refreshEditModeUi();
    }

    private ensureEditorPanels(): void {
        if (typeof document === 'undefined') {
            return;
        }

        const root = document.getElementById('editor-panel-root');

        if (!root) {
            return;
        }

        if (this.editorPanelRoot === root && this.editorInfoMeta && this.editorFurnitureGrid) {
            return;
        }

        root.innerHTML = '';

        const infoPane = document.createElement('section');
        infoPane.className = 'editor-pane';

        const infoTitle = document.createElement('h3');
        infoTitle.className = 'editor-pane__title';
        infoTitle.textContent = 'Edit Mode';

        const infoMeta = document.createElement('p');
        infoMeta.className = 'editor-pane__meta';

        const infoHint = document.createElement('p');
        infoHint.className = 'editor-pane__hint';

        infoPane.append(infoTitle, infoMeta, infoHint);

        const furniturePane = document.createElement('section');
        furniturePane.className = 'editor-pane';

        const furnitureTitle = document.createElement('h3');
        furnitureTitle.className = 'editor-pane__title';
        furnitureTitle.textContent = 'Furniture Menu';

        const furnitureMeta = document.createElement('p');
        furnitureMeta.className = 'editor-pane__meta';

        const furnitureHint = document.createElement('p');
        furnitureHint.className = 'editor-pane__hint';

        const furnitureGrid = document.createElement('div');
        furnitureGrid.className = 'editor-furniture-grid';

        this.editorFurnitureButtons = FURNITURE_PALETTE.map((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'editor-furniture-item';

            const preview = this.createFurniturePreviewCanvas(item);
            const label = document.createElement('div');
            label.className = 'editor-furniture-item__label';
            label.textContent = item.name;

            const meta = document.createElement('div');
            meta.className = 'editor-furniture-item__meta';
            meta.textContent = item.texture.replace(/^tiles_/, '').replace(/_/g, ' ');

            button.append(preview, label, meta);
            button.addEventListener('click', () => {
                this.selectedPaletteIndex = index;
                this.isPaletteOpen = true;
                this.refreshEditModeUi();
            });

            furnitureGrid.appendChild(button);
            return button;
        });

        furniturePane.append(furnitureTitle, furnitureMeta, furnitureHint, furnitureGrid);
        root.append(infoPane, furniturePane);

        this.editorPanelRoot = root;
        this.editorInfoPanel = infoPane;
        this.editorFurniturePanel = furniturePane;
        this.editorInfoMeta = infoMeta;
        this.editorInfoHint = infoHint;
        this.editorFurnitureMeta = furnitureMeta;
        this.editorFurnitureHint = furnitureHint;
        this.editorFurnitureGrid = furnitureGrid;
    }

    private hideEditorPanels(): void {
        this.editorPanelRoot?.classList.remove('active');
    }

    private refreshEditorPanels(target: EditableTarget | null): void {
        this.ensureEditorPanels();

        if (!this.editorPanelRoot || !this.editorInfoMeta || !this.editorFurnitureMeta) {
            return;
        }

        this.editorPanelRoot.classList.add('active');

        const currentStep = this.fineNudgeKey.isDown ? '1 px' : this.cursors.shift?.isDown ? '16 px' : '4 px';
        const selectedItem = FURNITURE_PALETTE[this.selectedPaletteIndex];

        this.editorInfoMeta.textContent = target
            ? [
                  `${this.selectedEditableIndex + 1}/${this.editableTargets.length}: ${target.name}`,
                  `save: ${this.layoutSaveStatus}`,
                  `zoom: ${this.editModeZoom.toFixed(2)}x  (- / + / 0 or mouse wheel)`,
                  `step: ${currentStep}  (Alt=1, default=4, Shift=16)`,
                  `delete: ${target.deletable ? 'allowed' : 'locked for this target'}`,
                  ...target.getInfoLines(),
              ].join('\n')
            : 'No editable target selected.';

        if (this.editorInfoHint) {
            this.editorInfoHint.textContent = [
                'E exit edit mode, click objects to select, drag to move.',
                'Q/W choose targets, D duplicates, Delete removes.',
                'Cmd/Ctrl+S saves, Cmd/Ctrl+Z undoes, F toggles furniture placement.',
                'Mouse wheel zooms the editor view, and - / + / 0 also control zoom.',
                '[ and ] resize the selected wall when the furniture menu is closed, or switch furniture when it is open.',
                'Enter places at camera, and clicking empty floor places at the cursor.',
            ].join(' ');
        }

        this.editorFurnitureMeta.textContent = selectedItem
            ? [
                  `${this.isPaletteOpen ? 'Placement on' : 'Placement off'}: ${
                      selectedItem.name
                  }`,
                  `sheet: ${selectedItem.texture}`,
                  `frames: ${selectedItem.frames.join(', ')}`,
              ].join('\n')
            : 'No furniture selected.';

        if (this.editorFurnitureHint) {
            this.editorFurnitureHint.textContent = this.isPaletteOpen
                ? 'Furniture placement is active. Press Enter to drop the selected item at camera center, or click empty floor to place it exactly where you want it.'
                : 'Press F to toggle placement mode, or click any furniture card to pick it and start placing.';
        }

        this.editorFurnitureButtons.forEach((button, index) => {
            button.classList.toggle('is-selected', index === this.selectedPaletteIndex);
            button.disabled = false;
        });
    }

    private createFurniturePreviewCanvas(item: FurniturePaletteItem): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return canvas;
        }

        const columns = item.width;
        const rows = Math.ceil(item.frames.length / columns);
        const firstFrame = this.textures.getFrame(item.texture, item.frames[0]);
        const frameWidth = firstFrame?.cutWidth ?? firstFrame?.width ?? 16;
        const frameHeight = firstFrame?.cutHeight ?? firstFrame?.height ?? 16;
        const assembledWidth = columns * frameWidth * (item.scale ?? 1);
        const assembledHeight = rows * frameHeight * (item.scale ?? 1);
        const previewScale = Phaser.Math.Clamp(
            Math.min(92 / Math.max(assembledWidth, 1), 84 / Math.max(assembledHeight, 1)),
            0.55,
            3,
        );
        const padding = 6;

        canvas.width = Math.max(1, Math.ceil(assembledWidth * previewScale + padding * 2));
        canvas.height = Math.max(1, Math.ceil(assembledHeight * previewScale + padding * 2));
        ctx.imageSmoothingEnabled = false;

        item.frames.forEach((frameKey, index) => {
            const frame = this.textures.getFrame(item.texture, frameKey);
            const sourceImage = frame?.source.image;

            if (!frame || !sourceImage) {
                return;
            }

            const destX =
                padding + (index % columns) * frame.cutWidth * (item.scale ?? 1) * previewScale;
            const destY =
                padding +
                Math.floor(index / columns) * frame.cutHeight * (item.scale ?? 1) * previewScale;

            ctx.drawImage(
                sourceImage as CanvasImageSource,
                frame.cutX,
                frame.cutY,
                frame.cutWidth,
                frame.cutHeight,
                destX,
                destY,
                frame.cutWidth * (item.scale ?? 1) * previewScale,
                frame.cutHeight * (item.scale ?? 1) * previewScale,
            );
        });

        return canvas;
    }

    private cloneEditableLayoutState(
        state: SavedEditableTargetState[],
    ): SavedEditableTargetState[] {
        return JSON.parse(JSON.stringify(state)) as SavedEditableTargetState[];
    }

    private captureCurrentEditableLayoutState(): SavedEditableTargetState[] {
        return this.cloneEditableLayoutState(this.editableTargets.map((target) => target.serialize()));
    }

    private pushUndoSnapshot(): void {
        const snapshot = this.captureCurrentEditableLayoutState();
        const lastSnapshot =
            this.editableUndoStack.length > 0
                ? this.editableUndoStack[this.editableUndoStack.length - 1]
                : undefined;

        if (
            lastSnapshot &&
            JSON.stringify(lastSnapshot) === JSON.stringify(snapshot)
        ) {
            return;
        }

        this.editableUndoStack.push(snapshot);

        if (this.editableUndoStack.length > 100) {
            this.editableUndoStack.shift();
        }
    }

    private undoEditableLayoutState(): void {
        const snapshot = this.editableUndoStack.pop();

        if (!snapshot) {
            this.layoutSaveStatus = 'Nothing to undo';
            this.refreshEditModeUi();
            return;
        }

        sessionEditableLayoutState = this.cloneEditableLayoutState(snapshot);
        this.restoreEditableLayoutState();
        this.selectedEditableIndex = Phaser.Math.Clamp(
            this.selectedEditableIndex,
            0,
            Math.max(this.editableTargets.length - 1, 0),
        );
        this.isDraggingEditable = false;
        this.dragLastWorldPoint = null;
        this.hasActiveDragUndoSnapshot = false;
        this.layoutSaveStatus = 'Undo applied (unsaved)';
        this.focusOnSelectedEditableTarget();
        this.refreshEditModeUi();
    }

    private createEditableCopyName(baseName: string): string {
        const root = baseName.replace(/ copy \d+$/, '').replace(/ copy$/, '');
        const copyCount = this.editableTargets.filter(
            (target) => target.name === root || target.name.startsWith(`${root} copy`),
        ).length;

        return `${root} copy ${copyCount}`;
    }

    private hydratePaletteLinkedData(
        state: Extract<SavedEditableTargetState, { kind: 'tiles' }>,
    ): Extract<SavedEditableTargetState, { kind: 'tiles' }> {
        const paletteItem = FURNITURE_PALETTE.find(
            (item) =>
                state.name.startsWith(item.name) &&
                item.texture === state.texture &&
                item.width === state.width &&
                item.frames.length === state.frames.length &&
                item.frames.every((frame, index) => frame === state.frames[index]),
        );

        if (!paletteItem || (!paletteItem.linkedColliders && !paletteItem.linkedPoints)) {
            return state;
        }

        const originX = state.tileX * TILE_SIZE;
        const originY = state.tileY * TILE_SIZE;

        return {
            ...state,
            linkedColliders:
                paletteItem.linkedColliders?.map((entry) => ({
                    x: originX + entry.x,
                    y: originY + entry.y,
                    width: entry.width,
                    height: entry.height,
                })) ?? state.linkedColliders,
            linkedPoints:
                paletteItem.linkedPoints?.map((entry) => ({
                    label: entry.label,
                    x: originX + entry.x,
                    y: originY + entry.y,
                })) ?? state.linkedPoints,
        };
    }

    private persistEditableLayoutState(): void {
        sessionEditableLayoutState = this.editableTargets.map((target) => target.serialize());
    }

    private normalizeSavedLayoutState(
        states: SavedEditableTargetState[],
    ): SavedEditableTargetState[] {
        return states.filter((state) => !LEGACY_BED_COLLIDER_IDS.has(state.id));
    }

    private markEditableLayoutDirty(): void {
        this.persistEditableLayoutState();
        this.layoutSaveStatus = 'Unsaved changes';
    }

    private loadEditableLayoutState(): void {
        if (sessionEditableLayoutState && sessionEditableLayoutState.length > 0) {
            this.layoutSaveStatus = 'Using current session layout';
            return;
        }

        if (typeof window === 'undefined' || !window.localStorage) {
            this.layoutSaveStatus = 'Save unavailable in this browser';
            return;
        }

        try {
            const raw = window.localStorage.getItem(EDITABLE_LAYOUT_STORAGE_KEY);

            if (!raw) {
                this.layoutSaveStatus = 'Cmd/Ctrl+S to save edits';
                return;
            }

            const parsed = JSON.parse(raw);

            if (!Array.isArray(parsed)) {
                this.layoutSaveStatus = 'Saved layout was invalid';
                return;
            }

            sessionEditableLayoutState = this.normalizeSavedLayoutState(
                parsed as SavedEditableTargetState[],
            );
            this.layoutSaveStatus = 'Loaded saved layout';
        } catch (error) {
            console.warn('Failed to load saved editable layout', error);
            this.layoutSaveStatus = 'Could not load saved layout';
        }
    }

    private saveEditableLayoutState(): void {
        this.persistEditableLayoutState();

        if (typeof window === 'undefined' || !window.localStorage) {
            this.layoutSaveStatus = 'Save unavailable in this browser';
            return;
        }

        try {
            window.localStorage.setItem(
                EDITABLE_LAYOUT_STORAGE_KEY,
                JSON.stringify(sessionEditableLayoutState ?? []),
            );
            this.layoutSaveStatus = 'Saved to browser storage';
        } catch (error) {
            console.warn('Failed to save editable layout', error);
            this.layoutSaveStatus = 'Save failed';
        }
    }

    private restoreEditableLayoutState(): void {
        if (!sessionEditableLayoutState || sessionEditableLayoutState.length === 0) {
            this.persistEditableLayoutState();
            return;
        }

        sessionEditableLayoutState = this.normalizeSavedLayoutState(sessionEditableLayoutState);

        const isLegacyLayoutWithoutWalls = !sessionEditableLayoutState.some(
            (state) => state.kind === 'solid',
        );
        const existingTargets = [...this.editableTargets];

        existingTargets.forEach((target) => {
            const state = sessionEditableLayoutState?.find((entry) => entry.id === target.id);

            if (state) {
                target.restore(state);
                return;
            }

            if (isLegacyLayoutWithoutWalls && target.kind === 'solid') {
                return;
            }

            if (target.deletable) {
                this.removeEditableTarget(target);
            }
        });

        const existingIds = new Set(this.editableTargets.map((target) => target.id));

        sessionEditableLayoutState.forEach((state) => {
            if (existingIds.has(state.id)) {
                return;
            }

            const spawned = this.createEditableTargetFromState(state);

            if (spawned) {
                existingIds.add(spawned.id);
            }
        });

        this.persistEditableLayoutState();
    }

    private createEditableTargetFromState(state: SavedEditableTargetState): EditableTarget | null {
        if (state.kind === 'tiles') {
            const hydratedState = this.hydratePaletteLinkedData(state);
            const originX = hydratedState.tileX * TILE_SIZE;
            const originY = hydratedState.tileY * TILE_SIZE;
            const linkedColliders =
                hydratedState.linkedColliders?.map((entry) => ({
                    collider: this.createColliderRect(
                        this.staticBodiesGroup,
                        entry.x,
                        entry.y,
                        entry.width,
                        entry.height,
                    ),
                    offsetX: entry.x - originX,
                    offsetY: entry.y - originY,
                })) ?? [];
            const linkedPoints =
                hydratedState.linkedPoints?.map((entry) => ({
                    label: entry.label,
                    vector: new Phaser.Math.Vector2(entry.x, entry.y),
                    offsetX: entry.x - originX,
                    offsetY: entry.y - originY,
                })) ?? [];
            const images = this.placeFrames(
                hydratedState.texture,
                hydratedState.frames,
                hydratedState.tileX,
                hydratedState.tileY,
                hydratedState.width,
                hydratedState.baseDepth,
                hydratedState.scale ?? 1,
            );

            return this.registerEditableTileTarget(hydratedState.name, images, {
                texture: hydratedState.texture,
                frames: hydratedState.frames,
                tileX: hydratedState.tileX,
                tileY: hydratedState.tileY,
                width: hydratedState.width,
                baseDepth: hydratedState.baseDepth,
                scale: hydratedState.scale ?? 1,
                linkedColliders,
                linkedPoints,
            });
        }

        if (state.kind === 'collider') {
            const collider = this.createColliderRect(
                this.staticBodiesGroup,
                state.x,
                state.y,
                state.width,
                state.height,
            );

            return this.registerEditableColliderTarget(state.name, collider);
        }

        if (state.kind === 'solid') {
            const solid = this.createSolid(
                this.staticBodiesGroup,
                state.x,
                state.y,
                state.width,
                state.height,
                state.color,
            );

            return this.registerEditableSolidTarget(
                state.name,
                solid.block,
                state.color,
                solid.labelText,
            );
        }

        if (state.kind === 'objects') {
            const primaryPosition = state.positions[0];
            const linkedColliders =
                state.linkedColliders?.map((entry) =>
                    this.createColliderRect(
                        this.staticBodiesGroup,
                        entry.x,
                        entry.y,
                        entry.width,
                        entry.height,
                    ),
                ) ?? [];

            if (!primaryPosition) {
                return null;
            }

            if (state.name === 'Bedroom 1 left bed' || state.id === 'bedroom-1-left-bed') {
                const sprite = this.add
                    .sprite(primaryPosition.x, primaryPosition.y, 'steve', BED_EMPTY_FRAME)
                    .setDepth(primaryPosition.y + 20)
                    .setOrigin(0.5, 0.5);

                return this.registerEditableObjectsTarget(state.name, [sprite], [], {
                    deletable: true,
                    linkedColliders,
                });
            }

            if (state.name === 'Bedroom 1 right bed' || state.id === 'bedroom-1-right-bed') {
                const sprite = this.add
                    .sprite(primaryPosition.x, primaryPosition.y, 'steve', BED_EMPTY_FRAME)
                    .setDepth(primaryPosition.y + 20)
                    .setOrigin(0.5, 0.5);

                return this.registerEditableObjectsTarget(state.name, [sprite], [], {
                    deletable: true,
                    linkedColliders,
                });
            }

            if (state.name === 'Bedroom 2 bed' || state.id === 'bedroom-2-bed') {
                const sleepPoint =
                    state.points.find((point) => point.label === 'sleep') ??
                    ({ x: primaryPosition.x, y: primaryPosition.y, label: 'sleep' } as const);

                this.bedSprite = this.add
                    .sprite(primaryPosition.x, primaryPosition.y, this.playerTexture, BED_EMPTY_FRAME)
                    .setDepth(primaryPosition.y + 20)
                    .setOrigin(0.5, 0.5);

                return this.registerEditableObjectsTarget(
                    state.name,
                    [this.bedSprite],
                    [{ label: 'sleep', vector: new Phaser.Math.Vector2(sleepPoint.x, sleepPoint.y) }],
                    {
                        deletable: true,
                        linkedColliders,
                    },
                );
            }
        }

        return null;
    }

    private placeSelectedPaletteItemAt(worldX: number, worldY: number): void {
        const item = FURNITURE_PALETTE[this.selectedPaletteIndex];

        if (!item) {
            return;
        }

        this.pushUndoSnapshot();

        const tileX = Math.round((worldX - TILE_SIZE / 2) / TILE_SIZE);
        const tileY = Math.round((worldY - TILE_SIZE / 2) / TILE_SIZE);
        const name = `${item.name} copy ${spawnedEditableTargetCounter++}`;
        const originX = tileX * TILE_SIZE;
        const originY = tileY * TILE_SIZE;
        const linkedColliders =
            item.linkedColliders?.map((entry) => ({
                collider: this.createColliderRect(
                    this.staticBodiesGroup,
                    originX + entry.x,
                    originY + entry.y,
                    entry.width,
                    entry.height,
                ),
                offsetX: entry.x,
                offsetY: entry.y,
            })) ?? [];
        const linkedPoints =
            item.linkedPoints?.map((entry) => ({
                label: entry.label,
                vector: new Phaser.Math.Vector2(originX + entry.x, originY + entry.y),
                offsetX: entry.x,
                offsetY: entry.y,
            })) ?? [];
        const images = this.placeFrames(
            item.texture,
            item.frames,
            tileX,
            tileY,
            item.width,
            item.baseDepth ?? 18,
            item.scale ?? 1,
        );
        const target = this.registerEditableTileTarget(name, images, {
            texture: item.texture,
            frames: item.frames,
            tileX,
            tileY,
            width: item.width,
            baseDepth: item.baseDepth ?? 18,
            scale: item.scale ?? 1,
            linkedColliders,
            linkedPoints,
        });

        this.selectedEditableIndex = this.editableTargets.indexOf(target);
        this.markEditableLayoutDirty();
        this.focusOnSelectedEditableTarget();
        this.refreshEditModeUi();
    }

    private toEditableId(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    private deleteSelectedEditableTarget(): void {
        const target = this.editableTargets[this.selectedEditableIndex];

        if (!target || !target.deletable) {
            this.refreshEditModeUi();
            return;
        }

        this.pushUndoSnapshot();
        this.removeEditableTarget(target);
        this.selectedEditableIndex = Phaser.Math.Clamp(
            this.selectedEditableIndex,
            0,
            Math.max(this.editableTargets.length - 1, 0),
        );
        this.isDraggingEditable = false;
        this.dragLastWorldPoint = null;
        this.markEditableLayoutDirty();
        this.refreshEditModeUi();
    }

    private removeEditableTarget(target: EditableTarget): void {
        const index = this.editableTargets.indexOf(target);

        if (index !== -1) {
            this.editableTargets.splice(index, 1);
        }

        target.destroy();
    }

    private drawEditorGrid(): void {
        this.editorGrid.clear();
        this.editorGrid.lineStyle(1, 0xffffff, 0.08);

        for (let x = 0; x <= HOUSE_WIDTH; x += TILE_SIZE) {
            this.editorGrid.beginPath();
            this.editorGrid.moveTo(x, 0);
            this.editorGrid.lineTo(x, HOUSE_HEIGHT);
            this.editorGrid.strokePath();
        }

        for (let y = 0; y <= HOUSE_HEIGHT; y += TILE_SIZE) {
            this.editorGrid.beginPath();
            this.editorGrid.moveTo(0, y);
            this.editorGrid.lineTo(HOUSE_WIDTH, y);
            this.editorGrid.strokePath();
        }
    }

    private getBoundsForObjects(objects: BoundableObject[]): Phaser.Geom.Rectangle {
        const bounds = objects.map((object) => object.getBounds());
        return this.combineBounds(bounds);
    }

    private getBoundsForPoints(points: Array<{ x: number; y: number }>): Phaser.Geom.Rectangle {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return new Phaser.Geom.Rectangle(minX, minY, Math.max(maxX - minX, 1), Math.max(maxY - minY, 1));
    }

    private combineBounds(bounds: Phaser.Geom.Rectangle[]): Phaser.Geom.Rectangle {
        const minX = Math.min(...bounds.map((bound) => bound.x));
        const minY = Math.min(...bounds.map((bound) => bound.y));
        const maxX = Math.max(...bounds.map((bound) => bound.right));
        const maxY = Math.max(...bounds.map((bound) => bound.bottom));
        return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    private expandBounds(bounds: Phaser.Geom.Rectangle, padding: number): Phaser.Geom.Rectangle {
        return new Phaser.Geom.Rectangle(
            bounds.x - padding,
            bounds.y - padding,
            bounds.width + padding * 2,
            bounds.height + padding * 2,
        );
    }

    private createNameTag(character: Character, label: string, color: string): void {
        const tag = this.add
            .text(character.sprite.x, character.sprite.y - 70, label, {
                fontFamily: 'monospace',
                fontSize: '16px',
                color,
                backgroundColor: 'rgba(20, 14, 10, 0.74)',
                padding: { left: 6, right: 6, top: 2, bottom: 2 },
            })
            .setOrigin(0.5, 1)
            .setDepth(1000);

        this.nameTags.set(character, tag);
    }

    private resetPlayerProjectileLoadout(): void {
        this.playerProjectileCharges = 0;
        this.playerProjectileMaxCharges = DEMON_PLAYER_MAX_PROJECTILES;
        this.playerProjectileTextureKey = 'boss_projectile';
        this.playerProjectileScale = 1.1;
        this.playerProjectileBodyRadius = 10;
        this.playerProjectileBodyOffset = 6;
    }

    private grantPizzaProjectiles(): void {
        this.playerProjectileCharges = DEMON_PLAYER_PIZZA_PROJECTILES;
        this.playerProjectileMaxCharges = DEMON_PLAYER_PIZZA_PROJECTILES;
        this.playerProjectileTextureKey = 'boss_pizza_projectile';
        this.playerProjectileScale = 1.25;
        this.playerProjectileBodyRadius = 12;
        this.playerProjectileBodyOffset = 4;
        this.refreshBossStatusText();
    }

    private updateNameTags(): void {
        this.nameTags.forEach((tag, character) => {
            if (!character.sprite.visible) {
                tag.setVisible(false);
                return;
            }

            tag.setVisible(true);
            tag.setPosition(character.sprite.x, character.sprite.y - 70);
        });
    }

    private summonBoss(bossType: BossType, spawnPoint?: Phaser.Math.Vector2): void {
        this.centerStatusMessageTimer?.remove(false);
        this.centerStatusMessageTimer = null;
        this.centerStatusText?.setVisible(false).setText('');
        this.despawnBoss();
        this.bossSpawnPoint = spawnPoint ?? this.findBossSpawnPoint();
        this.activeBossType = bossType;
        this.witchHelpUsed = false;
        this.pizzaHelpUsed = false;
        this.bossHealth = DEMON_BOSS_MAX_HP;
        this.playerHealth = DEMON_PLAYER_MAX_HP;
        this.resetPlayerProjectileLoadout();
        this.bossAlive = true;

        if (bossType === 'flying-demons') {
            this.spawnFlyingDemonPair();
            this.bossAttackCooldownUntil = 0;
            this.bossInvulnerableUntil = 0;
            this.playerInvulnerableUntil = this.time.now + 600;
            this.spawnBossPotion();
            this.spawnBossHpPotion();
            this.refreshBossStatusText();
            this.showTemporaryCenterMessage('Fire demons have spawned!');
            return;
        }

        this.bossSprite = this.physics.add
            .sprite(
                this.bossSpawnPoint.x,
                this.bossSpawnPoint.y,
                bossType === 'nightborne' ? 'boss_nightborne' : DEMON_IDLE_KEYS[0],
            )
            .setScale(bossType === 'nightborne' ? NIGHTBORNE_BOSS_SCALE : DEMON_BOSS_SCALE)
            .setOrigin(0.5, bossType === 'nightborne' ? 0.86 : 0.82)
            .setCollideWorldBounds(true)
            .setDepth(this.bossSpawnPoint.y + 80);

        const bossBody = this.bossSprite.body as Phaser.Physics.Arcade.Body | null;
        bossBody?.setAllowGravity(false);
        if (bossType === 'nightborne') {
            this.bossSprite.setFlipX(false);
            bossBody?.setSize(30, 28);
            bossBody?.setOffset(25, 44);
        } else {
            bossBody?.setSize(88, 54);
            bossBody?.setOffset(100, 96);
        }

        this.physics.add.collider(this.bossSprite, this.staticBodiesGroup);
        this.physics.add.collider(this.bossSprite, this.player.sprite);
        this.npcs.forEach((npc) => {
            this.physics.add.collider(this.bossSprite, npc.sprite);
        });

        this.bossAttackCooldownUntil = this.time.now + 800;
        this.bossInvulnerableUntil = 0;
        this.playerInvulnerableUntil = this.time.now + 600;
        this.spawnBossPotion();
        this.spawnBossHpPotion();
        this.playBossAnimation('idle');
        this.refreshBossStatusText();
        if (bossType === 'demon') {
            this.showTemporaryCenterMessage('Demon has spawned!');
        }
    }

    private despawnBoss(): void {
        this.bossAttackTimer?.remove(false);
        this.bossAttackTimer = null;
        this.bossAttackCooldownUntil = 0;
        this.bossInvulnerableUntil = 0;
        this.bossAlive = false;
        this.witchHelpUsed = false;
        this.pizzaHelpUsed = false;
        this.resetPlayerProjectileLoadout();
        this.clearWitchSupport();

        this.flyingDemonBosses.forEach((state) => {
            state.attackTimer?.remove(false);
            state.attackTimer = null;
            if (state.sprite.active) {
                state.sprite.destroy();
            }
        });
        this.flyingDemonBosses = [];

        if (this.bossSprite?.active) {
            this.bossSprite.destroy();
        }

        this.hideBossPotion();
        this.hideBossHpPotion();
    }

    private spawnFlyingDemonPair(): void {
        const offsets = [-112, 112];
        this.flyingDemonBosses = offsets.map((offsetX) => {
            const sprite = this.physics.add
                .sprite(
                    this.bossSpawnPoint.x + offsetX,
                    this.bossSpawnPoint.y + Phaser.Math.Between(-12, 12),
                    'boss_flying_demon_idle',
                )
                .setScale(FLYING_DEMON_BOSS_SCALE)
                .setOrigin(0.5, 0.78)
                .setCollideWorldBounds(true)
                .setDepth(this.bossSpawnPoint.y + 80);

            const body = sprite.body as Phaser.Physics.Arcade.Body | null;
            body?.setAllowGravity(false);
            body?.setSize(26, 22);
            body?.setOffset(27, 36);

            this.physics.add.collider(sprite, this.staticBodiesGroup);
            this.physics.add.collider(sprite, this.player.sprite);
            this.npcs.forEach((npc) => {
                this.physics.add.collider(sprite, npc.sprite);
            });

            sprite.setFlipX(offsetX > 0);
            sprite.anims.play('flying-demon-boss-idle', true);

            return {
                sprite,
                hp: FLYING_DEMON_MAX_HP,
                attackCooldownUntil: this.time.now + Phaser.Math.Between(350, 700),
                attackTimer: null,
                invulnerableUntil: 0,
            };
        });

        if (this.flyingDemonBosses.length >= 2) {
            this.physics.add.collider(
                this.flyingDemonBosses[0].sprite,
                this.flyingDemonBosses[1].sprite,
            );
        }

        this.bossSprite = this.flyingDemonBosses[0].sprite;
    }

    private spawnBossPotion(): void {
        this.bossMagicPotion
            .setPosition(this.bossSpawnPoint.x + 132, this.bossSpawnPoint.y + 36)
            .setVisible(true)
            .setAlpha(1);
    }

    private hideBossPotion(): void {
        this.bossMagicPotion.setVisible(false);
    }

    private spawnBossHpPotion(): void {
        this.bossHpPotion
            .setPosition(this.bossSpawnPoint.x - 132, this.bossSpawnPoint.y + 36)
            .setVisible(true)
            .setAlpha(1);
    }

    private hideBossHpPotion(): void {
        this.bossHpPotion.setVisible(false);
    }

    private ensureDemonAnimations(): void {
        this.ensureLooseFrameAnimation('demon-boss-idle', DEMON_IDLE_KEYS, 6, -1);
        this.ensureLooseFrameAnimation('demon-boss-walk', DEMON_WALK_KEYS, 10, -1);
        this.ensureLooseFrameAnimation('demon-boss-cleave', DEMON_CLEAVE_KEYS, 14, 0);
        this.ensureLooseFrameAnimation('demon-boss-hit', DEMON_HIT_KEYS, 12, 0);
        this.ensureLooseFrameAnimation('demon-boss-death', DEMON_DEATH_KEYS, 12, 0);
    }

    private ensureNightborneAnimations(): void {
        this.ensureSheetFrameAnimation(
            'nightborne-boss-idle',
            'boss_nightborne',
            NIGHTBORNE_IDLE_FRAMES,
            8,
            -1,
        );
        this.ensureSheetFrameAnimation(
            'nightborne-boss-walk',
            'boss_nightborne',
            NIGHTBORNE_RUN_FRAMES,
            12,
            -1,
        );
        this.ensureSheetFrameAnimation(
            'nightborne-boss-cleave',
            'boss_nightborne',
            NIGHTBORNE_ATTACK_FRAMES,
            18,
            0,
        );
        this.ensureSheetFrameAnimation(
            'nightborne-boss-hit',
            'boss_nightborne',
            NIGHTBORNE_HIT_FRAMES,
            12,
            0,
        );
        this.ensureSheetFrameAnimation(
            'nightborne-boss-death',
            'boss_nightborne',
            NIGHTBORNE_DEATH_FRAMES,
            14,
            0,
        );
    }

    private ensureFlyingDemonAnimations(): void {
        this.ensureSheetFrameAnimation(
            'flying-demon-boss-idle',
            'boss_flying_demon_idle',
            FLYING_DEMON_IDLE_FRAMES,
            8,
            -1,
        );
        this.ensureSheetFrameAnimation(
            'flying-demon-boss-walk',
            'boss_flying_demon_flying',
            FLYING_DEMON_FLY_FRAMES,
            12,
            -1,
        );
        this.ensureSheetFrameAnimation(
            'flying-demon-boss-cleave',
            'boss_flying_demon_attack',
            FLYING_DEMON_ATTACK_FRAMES,
            16,
            0,
        );
        this.ensureSheetFrameAnimation(
            'flying-demon-boss-hit',
            'boss_flying_demon_hurt',
            FLYING_DEMON_HURT_FRAMES,
            12,
            0,
        );
        this.ensureSheetFrameAnimation(
            'flying-demon-boss-death',
            'boss_flying_demon_death',
            FLYING_DEMON_DEATH_FRAMES,
            14,
            0,
        );
    }

    private ensureLooseFrameAnimation(
        key: string,
        frameKeys: string[],
        frameRate: number,
        repeat: number,
    ): void {
        if (this.anims.exists(key)) {
            return;
        }

        this.anims.create({
            key,
            frames: frameKeys.map((frameKey) => ({ key: frameKey })),
            frameRate,
            repeat,
        });
    }

    private ensureSheetFrameAnimation(
        key: string,
        textureKey: string,
        frames: number[],
        frameRate: number,
        repeat: number,
    ): void {
        if (this.anims.exists(key)) {
            return;
        }

        this.anims.create({
            key,
            frames: frames.map((frame) => ({ key: textureKey, frame })),
            frameRate,
            repeat,
        });
    }

    private ensurePhoneCallAnimation(texture: string): string {
        const key = `${texture}-phone-call`;

        if (this.anims.exists(key)) {
            return key;
        }

        this.anims.create({
            key,
            frames: PHONE_CALL_FRAMES.map((frame) => ({ key: texture, frame })),
            frameRate: PHONE_CALL_FRAME_RATE,
            repeat: 0,
        });

        return key;
    }

    private playNpcPhoneCallAnimation(npc: Character): void {
        const texture = npc.sprite.texture.key;
        const animationKey = this.ensurePhoneCallAnimation(texture);

        npc.sprite.anims.play(animationKey, false);
        this.time.delayedCall(PHONE_CALL_DURATION_MS, () => {
            if (npc.sprite.active) {
                npc.idle();
            }
        });
    }

    private ensureWitchCastAnimation(direction: WitchCastDirection): string {
        const key = `witch-cast-${direction.toLowerCase()}`;

        if (this.anims.exists(key)) {
            return key;
        }

        this.anims.create({
            key,
            frames: WITCH_CAST_ROWS[direction].map((frame) => ({ key: 'witch', frame })),
            frameRate: WITCH_CAST_FRAME_RATE,
            repeat: 0,
        });

        return key;
    }

    private ensureWitchPortalAnimation(): string {
        const key = 'witch-portal';

        if (this.anims.exists(key)) {
            return key;
        }

        this.ensureLooseFrameAnimation(key, WITCH_PORTAL_FRAME_KEYS, WITCH_PORTAL_FRAME_RATE, 0);
        return key;
    }

    private getWitchCastDirection(target: Phaser.Types.Math.Vector2Like): WitchCastDirection {
        if (!this.witchSupportSprite) {
            return 'S';
        }

        const dx = target.x - this.witchSupportSprite.x;
        const dy = target.y - this.witchSupportSprite.y;

        if (dy < -Math.abs(dx) * 0.55) {
            return 'N';
        }

        if (dx < -18) {
            return 'SW';
        }

        if (dx > 18) {
            return 'SE';
        }

        return 'S';
    }

    private setWitchIdleFrame(direction: WitchCastDirection = WITCH_HELP_IDLE_DIRECTION): void {
        if (!this.witchSupportSprite?.active) {
            return;
        }

        this.witchSupportSprite.anims.stop();
        this.witchSupportSprite.setVisible(true).setAlpha(1).setFrame(WITCH_CAST_ROWS[direction][0]);
    }

    private playWitchPortalEffect(x: number, y: number): void {
        const animationKey = this.ensureWitchPortalAnimation();
        const portal = this.add
            .sprite(x, y, WITCH_PORTAL_FRAME_KEYS[0])
            .setScale(WITCH_PORTAL_SCALE)
            .setDepth(y + 86);

        portal.anims.play(animationKey, false);
        this.time.delayedCall(WITCH_PORTAL_DURATION_MS, () => {
            if (portal.active) {
                portal.destroy();
            }
        });
    }

    private scheduleGoodWitchArrival(): void {
        this.witchArrivalTimer?.remove(false);
        this.witchArrivalTimer = this.time.delayedCall(GOOD_WITCH_ARRIVAL_DELAY_MS, () => {
            this.witchArrivalTimer = null;

            if (!this.bossAlive || this.activeBossType !== 'flying-demons') {
                return;
            }

            this.summonWitchSupportVolley();
        });
    }

    private clearWitchSupport(): void {
        this.witchArrivalTimer?.remove(false);
        this.witchArrivalTimer = null;
        this.witchVolleyTimers.forEach((timer) => timer.remove(false));
        this.witchVolleyTimers = [];

        if (this.witchSupportSprite?.active) {
            const { x, y } = this.witchSupportSprite;
            this.witchSupportSprite.destroy();
            this.playWitchPortalEffect(x, y);
        }

        this.witchSupportSprite = null;
    }

    private summonWitchSupportVolley(): void {
        if (!this.bossAlive || this.activeBossType !== 'flying-demons') {
            return;
        }

        this.clearWitchSupport();

        const witchX = WITCH_HELP_POSITION.x;
        const witchY = WITCH_HELP_POSITION.y;
        this.playWitchPortalEffect(witchX, witchY);

        const spawnTimer = this.time.delayedCall(WITCH_PORTAL_DURATION_MS, () => {
            if (!this.bossAlive || this.activeBossType !== 'flying-demons') {
                return;
            }

            this.witchSupportSprite = this.add
                .sprite(witchX, witchY, 'witch', WITCH_CAST_ROWS[WITCH_HELP_IDLE_DIRECTION][0])
                .setScale(WITCH_HELP_SPRITE_SCALE)
                .setDepth(witchY + 80);
            this.setWitchIdleFrame();
            this.showTemporaryCenterMessage('The Good Witch has Arrived!', 2200);

            for (let i = 0; i < WITCH_HELP_PROJECTILE_COUNT; i += 1) {
                const timer = this.time.delayedCall((i + 1) * WITCH_HELP_PROJECTILE_INTERVAL_MS, () => {
                    this.fireWitchSupportProjectile();
                });
                this.witchVolleyTimers.push(timer);
            }

            const cleanupTimer = this.time.delayedCall(
                WITCH_HELP_PROJECTILE_COUNT * WITCH_HELP_PROJECTILE_INTERVAL_MS + 1200,
                () => {
                    this.clearWitchSupport();
                },
            );
            this.witchVolleyTimers.push(cleanupTimer);
        });
        this.witchVolleyTimers.push(spawnTimer);
    }

    private fireWitchSupportProjectile(): void {
        if (!this.witchSupportSprite?.active || !this.bossAlive || this.activeBossType !== 'flying-demons') {
            return;
        }

        const target = this.getActiveFlyingDemonBosses().sort((a, b) => a.hp - b.hp)[0];

        if (!target) {
            return;
        }

        const direction = new Phaser.Math.Vector2(
            target.sprite.x - this.witchSupportSprite.x,
            target.sprite.y - 12 - this.witchSupportSprite.y,
        );

        if (direction.lengthSq() === 0) {
            return;
        }

        const castDirection = this.getWitchCastDirection(target.sprite);
        const castAnimation = this.ensureWitchCastAnimation(castDirection);
        this.setWitchIdleFrame(castDirection);
        this.witchSupportSprite.anims.play(castAnimation, false);
        this.time.delayedCall(WITCH_CAST_DURATION_MS, () => {
            this.setWitchIdleFrame();
        });

        this.time.delayedCall(WITCH_CAST_WINDUP_MS, () => {
            if (
                !this.witchSupportSprite?.active ||
                !this.bossAlive ||
                this.activeBossType !== 'flying-demons'
            ) {
                return;
            }

            const projectile = this.physics.add
                .image(this.witchSupportSprite.x + 18, this.witchSupportSprite.y - 10, 'witch_projectile')
                .setDepth(this.witchSupportSprite.y + 82)
                .setScale(WITCH_HELP_PROJECTILE_SCALE);

            projectile.body.setAllowGravity(false);
            projectile.body.setCircle(18, 14, 14);

            direction.normalize().scale(WITCH_HELP_PROJECTILE_SPEED);
            projectile.setVelocity(direction.x, direction.y);
            projectile.setRotation(direction.angle());

            this.physics.add.collider(projectile, this.staticBodiesGroup, () => {
                projectile.destroy();
            });

            this.getActiveFlyingDemonBosses().forEach((state) => {
                this.physics.add.overlap(projectile, state.sprite, () => {
                    if (!projectile.active) {
                        return;
                    }

                    projectile.destroy();
                    this.applyDamageToBoss(WITCH_HELP_PROJECTILE_DAMAGE, state.sprite);
                });
            });

            this.time.delayedCall(1600, () => {
                if (projectile.active) {
                    projectile.destroy();
                }
            });
        });
    }

    private findBossSpawnPoint(): Phaser.Math.Vector2 {
        const plants = this.editableTargets
            .filter(
                (target) =>
                    target.name.startsWith('Plant 1') || target.name.startsWith('Plant 2'),
            )
            .slice(0, 2);

        if (plants.length >= 2) {
            const first = plants[0].getBounds();
            const second = plants[1].getBounds();
            return new Phaser.Math.Vector2(
                (first.centerX + second.centerX) / 2,
                (first.centerY + second.centerY) / 2 - 8,
            );
        }

        return new Phaser.Math.Vector2(1008, 288);
    }

    private playBossAnimation(
        type: 'idle' | 'walk' | 'cleave' | 'hit' | 'death',
        force = false,
    ): void {
        if (!this.bossSprite?.active) {
            return;
        }

        const key =
            this.activeBossType === 'nightborne'
                ? this.getNightborneAnimationKey(type)
                : this.activeBossType === 'flying-demons'
                  ? this.getFlyingDemonAnimationKey(type)
                : `demon-boss-${type}`;
        if (!force && this.bossSprite.anims.currentAnim?.key === key) {
            return;
        }

        this.bossSprite.anims.play(key, true);
    }

    private getNightborneAnimationKey(
        type: 'idle' | 'walk' | 'cleave' | 'hit' | 'death',
    ): string {
        switch (type) {
            case 'walk':
                return 'nightborne-boss-walk';
            case 'cleave':
                return 'nightborne-boss-cleave';
            case 'hit':
                return 'nightborne-boss-hit';
            case 'death':
                return 'nightborne-boss-death';
            default:
                return 'nightborne-boss-idle';
        }
    }

    private getFlyingDemonAnimationKey(
        type: 'idle' | 'walk' | 'cleave' | 'hit' | 'death',
    ): string {
        switch (type) {
            case 'walk':
                return 'flying-demon-boss-walk';
            case 'cleave':
                return 'flying-demon-boss-cleave';
            case 'hit':
                return 'flying-demon-boss-hit';
            case 'death':
                return 'flying-demon-boss-death';
            default:
                return 'flying-demon-boss-idle';
        }
    }

    private playFlyingDemonBossAnimation(
        state: FlyingDemonBossState,
        type: 'idle' | 'walk' | 'cleave' | 'hit' | 'death',
        force = false,
    ): void {
        if (!state.sprite.active) {
            return;
        }

        const key = this.getFlyingDemonAnimationKey(type);
        if (!force && state.sprite.anims.currentAnim?.key === key) {
            return;
        }

        state.sprite.anims.play(key, true);
    }

    private getActiveFlyingDemonBosses(): FlyingDemonBossState[] {
        return this.flyingDemonBosses.filter((state) => state.sprite.active && state.hp > 0);
    }

    private getActiveBossSprites(): Phaser.Physics.Arcade.Sprite[] {
        if (!this.bossAlive) {
            return [];
        }

        if (this.activeBossType === 'flying-demons') {
            return this.getActiveFlyingDemonBosses().map((state) => state.sprite);
        }

        return this.bossSprite?.active ? [this.bossSprite] : [];
    }

    private getNearestBossTarget(
        playerX = this.player.sprite.x,
        playerY = this.player.sprite.y,
    ): { sprite: Phaser.Physics.Arcade.Sprite; distance: number; state?: FlyingDemonBossState } | null {
        if (!this.bossAlive) {
            return null;
        }

        if (this.activeBossType === 'flying-demons') {
            const nearest = this.getActiveFlyingDemonBosses()
                .map((state) => ({
                    sprite: state.sprite,
                    state,
                    distance: Phaser.Math.Distance.Between(
                        playerX,
                        playerY,
                        state.sprite.x,
                        state.sprite.y,
                    ),
                }))
                .sort((a, b) => a.distance - b.distance)[0];

            return nearest ?? null;
        }

        if (!this.bossSprite?.active) {
            return null;
        }

        return {
            sprite: this.bossSprite,
            distance: Phaser.Math.Distance.Between(
                playerX,
                playerY,
                this.bossSprite.x,
                this.bossSprite.y,
            ),
        };
    }

    private stopBossMovement(): void {
        if (this.activeBossType === 'flying-demons') {
            this.getActiveFlyingDemonBosses().forEach((state) => {
                const body = state.sprite.body as Phaser.Physics.Arcade.Body | null;
                body?.velocity.set(0, 0);
                if (this.bossAlive && !state.attackTimer) {
                    this.playFlyingDemonBossAnimation(state, 'idle');
                }
            });
            return;
        }

        if (!this.bossSprite?.body) {
            return;
        }

        this.bossSprite.body.velocity.set(0, 0);
        if (this.bossAlive && !this.bossAttackTimer) {
            this.playBossAnimation('idle');
        }
    }

    private getBossDistanceToPlayer(): number | null {
        return this.getNearestBossTarget()?.distance ?? null;
    }

    private getActiveBossMeleeRange(): number {
        return this.activeBossType === 'flying-demons'
            ? FLYING_DEMON_ATTACK_RANGE
            : this.activeBossType === 'nightborne'
            ? NIGHTBORNE_BOSS_MELEE_RANGE
            : DEMON_BOSS_MELEE_RANGE;
    }

    private isBossPotionNearby(playerX: number, playerY: number): boolean {
        if (!this.bossMagicPotion?.visible) {
            return false;
        }

        return (
            Phaser.Math.Distance.Between(
                playerX,
                playerY,
                this.bossMagicPotion.x,
                this.bossMagicPotion.y,
            ) <= DEMON_POTION_PICKUP_RADIUS
        );
    }

    private isBossHpPotionNearby(playerX: number, playerY: number): boolean {
        if (!this.bossHpPotion?.visible) {
            return false;
        }

        return (
            Phaser.Math.Distance.Between(
                playerX,
                playerY,
                this.bossHpPotion.x,
                this.bossHpPotion.y,
            ) <= DEMON_POTION_PICKUP_RADIUS
        );
    }

    private consumeBossPotion(): void {
        if (!this.bossMagicPotion?.visible) {
            return;
        }

        this.playerProjectileTextureKey = 'boss_projectile';
        this.playerProjectileScale = 1.1;
        this.playerProjectileBodyRadius = 10;
        this.playerProjectileBodyOffset = 6;
        this.playerProjectileMaxCharges = DEMON_PLAYER_MAX_PROJECTILES;
        this.playerProjectileCharges = DEMON_PLAYER_MAX_PROJECTILES;
        this.hideBossPotion();
        this.refreshBossStatusText();
    }

    private consumeBossHpPotion(): void {
        if (!this.bossHpPotion?.visible) {
            return;
        }

        this.playerHealth = Math.min(DEMON_PLAYER_MAX_HP, this.playerHealth + 1);
        this.hideBossHpPotion();
        this.refreshBossStatusText();
    }

    private updateBoss(): void {
        if (!this.bossAlive) {
            return;
        }

        if (this.activeBossType === 'flying-demons') {
            this.updateFlyingDemonBosses();
            return;
        }

        if (!this.bossSprite?.active) {
            return;
        }

        this.updateBossFacing();

        if (
            this.isInteracting ||
            this.isAwaitingInput ||
            this.isWaitingForResponse ||
            this.isSleepingInBed ||
            this.isReading ||
            this.isSitting
        ) {
            this.stopBossMovement();
            return;
        }

        if (this.bossAttackTimer) {
            this.stopBossMovement();
            return;
        }

        const distance = this.getBossDistanceToPlayer();

        if (distance === null) {
            return;
        }

        if (distance > DEMON_BOSS_AGGRO_RADIUS) {
            this.stopBossMovement();
            return;
        }

        const meleeRange = this.getActiveBossMeleeRange();

        if (distance > meleeRange) {
            const direction = new Phaser.Math.Vector2(
                this.player.sprite.x - this.bossSprite.x,
                this.player.sprite.y - this.bossSprite.y,
            )
                .normalize()
                .scale(DEMON_BOSS_SPEED);

            this.bossSprite.setVelocity(direction.x, direction.y);
            this.playBossAnimation('walk');
            return;
        }

        this.stopBossMovement();

        if (this.time.now >= this.bossAttackCooldownUntil) {
            this.startBossAttack();
        }
    }

    private updateFlyingDemonBosses(): void {
        const activeBosses = this.getActiveFlyingDemonBosses();
        if (activeBosses.length === 0) {
            return;
        }

        if (
            this.isInteracting ||
            this.isAwaitingInput ||
            this.isWaitingForResponse ||
            this.isSleepingInBed ||
            this.isReading ||
            this.isSitting
        ) {
            this.stopBossMovement();
            return;
        }

        activeBosses.forEach((state) => {
            this.updateFlyingDemonFacing(state);

            if (state.attackTimer) {
                const body = state.sprite.body as Phaser.Physics.Arcade.Body | null;
                body?.velocity.set(0, 0);
                return;
            }

            const distance = Phaser.Math.Distance.Between(
                this.player.sprite.x,
                this.player.sprite.y,
                state.sprite.x,
                state.sprite.y,
            );

            if (distance > FLYING_DEMON_AGGRO_RADIUS) {
                const body = state.sprite.body as Phaser.Physics.Arcade.Body | null;
                body?.velocity.set(0, 0);
                this.playFlyingDemonBossAnimation(state, 'idle');
                return;
            }

            if (distance > FLYING_DEMON_PREFERRED_RANGE) {
                const direction = new Phaser.Math.Vector2(
                    this.player.sprite.x - state.sprite.x,
                    this.player.sprite.y - state.sprite.y - 28,
                )
                    .normalize()
                    .scale(FLYING_DEMON_SPEED);
                state.sprite.setVelocity(direction.x, direction.y);
                this.playFlyingDemonBossAnimation(state, 'walk');
                return;
            }

            const body = state.sprite.body as Phaser.Physics.Arcade.Body | null;
            body?.velocity.set(0, 0);
            this.playFlyingDemonBossAnimation(state, 'idle');

            if (this.time.now >= state.attackCooldownUntil) {
                this.startFlyingDemonAttack(state);
            }
        });
    }

    private startBossAttack(): void {
        if (!this.bossSprite?.active || !this.bossAlive || this.bossAttackTimer) {
            return;
        }

        const attackWindupMs =
            this.activeBossType === 'nightborne'
                ? NIGHTBORNE_BOSS_ATTACK_WINDUP_MS
                : DEMON_BOSS_ATTACK_WINDUP_MS;
        const attackAnimationMs =
            this.activeBossType === 'nightborne'
                ? NIGHTBORNE_BOSS_ATTACK_ANIMATION_MS
                : DEMON_BOSS_ATTACK_ANIMATION_MS;
        const meleeRange = this.getActiveBossMeleeRange();

        this.updateBossFacing();
        this.bossAttackCooldownUntil = this.time.now + DEMON_BOSS_ATTACK_COOLDOWN_MS;
        this.playBossAnimation('cleave', true);
        this.time.delayedCall(attackWindupMs, () => {
            if (!this.bossAlive || !this.bossSprite?.active) {
                return;
            }

            const distance = this.getBossDistanceToPlayer();
            if (distance !== null && distance <= meleeRange + 12) {
                this.damagePlayerFromBoss();
            }
        });

        this.bossAttackTimer = this.time.delayedCall(attackAnimationMs, () => {
            this.bossAttackTimer = null;
            if (this.bossAlive) {
                this.playBossAnimation('idle', true);
            }
        });
    }

    private startFlyingDemonAttack(state: FlyingDemonBossState): void {
        if (!state.sprite.active || state.attackTimer) {
            return;
        }

        this.updateFlyingDemonFacing(state);
        state.attackCooldownUntil = this.time.now + FLYING_DEMON_ATTACK_COOLDOWN_MS;
        this.playFlyingDemonBossAnimation(state, 'cleave', true);

        this.time.delayedCall(FLYING_DEMON_ATTACK_WINDUP_MS, () => {
            if (!state.sprite.active || !this.bossAlive) {
                return;
            }

            this.spawnFlyingDemonProjectile(state);
        });

        state.attackTimer = this.time.delayedCall(FLYING_DEMON_ATTACK_ANIMATION_MS, () => {
            state.attackTimer = null;
            if (state.sprite.active && this.bossAlive) {
                this.playFlyingDemonBossAnimation(state, 'idle', true);
            }
        });
    }

    private handlePlayerBossMeleeAttack(): void {
        const nearestBoss = this.getNearestBossTarget();
        if (!nearestBoss || !this.bossAlive) {
            return;
        }

        if (nearestBoss.distance > DEMON_PLAYER_ATTACK_RANGE) {
            return;
        }

        if (
            nearestBoss.state
                ? this.time.now < nearestBoss.state.invulnerableUntil
                : this.time.now < this.bossInvulnerableUntil
        ) {
            return;
        }

        this.applyDamageToBoss(DEMON_PLAYER_MELEE_DAMAGE, nearestBoss.sprite);
    }

    private updateBossFacing(): void {
        if (!this.bossSprite?.active) {
            return;
        }

        if (this.activeBossType === 'nightborne') {
            this.bossSprite.setFlipX(this.player.sprite.x < this.bossSprite.x);
            return;
        }

        this.bossSprite.setFlipX(this.player.sprite.x > this.bossSprite.x);
    }

    private updateFlyingDemonFacing(state: FlyingDemonBossState): void {
        if (!state.sprite.active) {
            return;
        }

        state.sprite.setFlipX(this.player.sprite.x > state.sprite.x);
    }

    private handlePlayerBossRangedAttack(): void {
        const nearestBoss = this.getNearestBossTarget();
        if (!nearestBoss || !this.bossAlive) {
            return;
        }

        if (this.playerProjectileCharges <= 0) {
            this.showTemporaryCenterMessage('No projectiles available', 1400);
            return;
        }

        if (this.time.now < this.playerRangedCooldownUntil) {
            return;
        }

        const direction = new Phaser.Math.Vector2(
            nearestBoss.sprite.x - this.player.sprite.x,
            nearestBoss.sprite.y - this.player.sprite.y,
        );

        if (direction.lengthSq() === 0) {
            return;
        }

        this.playerRangedCooldownUntil = this.time.now + DEMON_PLAYER_RANGED_COOLDOWN_MS;
        this.playerProjectileCharges -= 1;
        this.refreshBossStatusText();

        const projectile = this.physics.add
            .image(this.player.sprite.x, this.player.sprite.y - 28, this.playerProjectileTextureKey)
            .setDepth(this.player.sprite.y + 70)
            .setScale(this.playerProjectileScale);

        projectile.body.setAllowGravity(false);
        projectile.body.setCircle(
            this.playerProjectileBodyRadius,
            this.playerProjectileBodyOffset,
            this.playerProjectileBodyOffset,
        );

        direction.normalize().scale(DEMON_PLAYER_PROJECTILE_SPEED);
        projectile.setVelocity(direction.x, direction.y);
        projectile.setRotation(direction.angle());

        this.physics.add.collider(projectile, this.staticBodiesGroup, () => {
            projectile.destroy();
        });

        this.getActiveBossSprites().forEach((bossTarget) => {
            this.physics.add.overlap(projectile, bossTarget, () => {
                if (!projectile.active) {
                    return;
                }

                projectile.destroy();
                this.applyDamageToBoss(DEMON_PLAYER_RANGED_DAMAGE, bossTarget);
            });
        });

        this.time.delayedCall(1400, () => {
            if (projectile.active) {
                projectile.destroy();
            }
        });
    }

    private applyDamageToBoss(amount: number, targetSprite?: Phaser.Physics.Arcade.Sprite): void {
        if (!this.bossAlive) {
            return;
        }

        if (this.activeBossType === 'flying-demons') {
            const targetState =
                this.getActiveFlyingDemonBosses().find((state) => state.sprite === targetSprite) ??
                this.getNearestBossTarget()?.state;

            if (!targetState) {
                return;
            }

            targetState.invulnerableUntil = this.time.now + DEMON_BOSS_HIT_COOLDOWN_MS;
            targetState.hp = Math.max(0, targetState.hp - amount);
            targetState.sprite.setTint(0xffffff);
            this.time.delayedCall(120, () => {
                targetState.sprite.clearTint();
            });

            if (targetState.hp <= 0) {
                this.defeatFlyingDemon(targetState);
                return;
            }

            const body = targetState.sprite.body as Phaser.Physics.Arcade.Body | null;
            body?.velocity.set(0, 0);
            this.playFlyingDemonBossAnimation(targetState, 'hit', true);
            this.time.delayedCall(220, () => {
                if (targetState.sprite.active && this.bossAlive && !targetState.attackTimer) {
                    this.playFlyingDemonBossAnimation(targetState, 'idle', true);
                }
            });
            this.refreshBossStatusText();
            return;
        }

        if (!this.bossSprite?.active) {
            return;
        }

        this.bossInvulnerableUntil = this.time.now + DEMON_BOSS_HIT_COOLDOWN_MS;
        this.bossHealth = Math.max(0, this.bossHealth - amount);
        this.bossSprite.setTint(0xffffff);
        this.time.delayedCall(120, () => {
            this.bossSprite?.clearTint();
        });

        if (this.bossHealth <= 0) {
            this.defeatBoss();
            return;
        }

        this.stopBossMovement();
        this.playBossAnimation('hit', true);
        this.time.delayedCall(260, () => {
            if (this.bossAlive) {
                this.playBossAnimation('idle', true);
            }
        });
    }

    private defeatFlyingDemon(state: FlyingDemonBossState): void {
        state.attackTimer?.remove(false);
        state.attackTimer = null;
        const body = state.sprite.body as Phaser.Physics.Arcade.Body | null;
        body?.velocity.set(0, 0);
        if (body) {
            body.enable = false;
        }
        this.playFlyingDemonBossAnimation(state, 'death', true);
        this.time.delayedCall(520, () => {
            if (state.sprite.active) {
                state.sprite.destroy();
            }

            const survivors = this.getActiveFlyingDemonBosses();
            if (survivors.length === 0) {
                this.bossAlive = false;
                this.hideBossPotion();
                this.hideBossHpPotion();
                this.showTemporaryCenterMessage('Fire demons defeated!', 2200);
                this.time.delayedCall(250, () => {
                    this.despawnBoss();
                    this.refreshBossStatusText();
                });
            } else {
                this.bossSprite = survivors[0].sprite;
                this.refreshBossStatusText();
            }
        });
    }

    private spawnFlyingDemonProjectile(state: FlyingDemonBossState): void {
        const direction = new Phaser.Math.Vector2(
            this.player.sprite.x - state.sprite.x,
            this.player.sprite.y - 12 - state.sprite.y,
        );

        if (direction.lengthSq() === 0) {
            return;
        }

        const projectile = this.physics.add
            .image(state.sprite.x, state.sprite.y - 16, 'boss_flying_demon_projectile')
            .setDepth(state.sprite.y + 70)
            .setScale(1.8);

        projectile.body.setAllowGravity(false);
        projectile.body.setSize(40, 26);

        direction.normalize().scale(FLYING_DEMON_PROJECTILE_SPEED);
        projectile.setVelocity(direction.x, direction.y);
        projectile.setRotation(direction.angle());

        this.physics.add.collider(projectile, this.staticBodiesGroup, () => {
            projectile.destroy();
        });

        this.physics.add.overlap(projectile, this.player.sprite, () => {
            if (!projectile.active) {
                return;
            }

            projectile.destroy();
            this.damagePlayerFromBoss();
        });

        this.time.delayedCall(1800, () => {
            if (projectile.active) {
                projectile.destroy();
            }
        });
    }

    private damagePlayerFromBoss(): void {
        if (this.time.now < this.playerInvulnerableUntil) {
            return;
        }

        this.playerInvulnerableUntil = this.time.now + DEMON_PLAYER_HIT_COOLDOWN_MS;
        this.playerHealth = Math.max(0, this.playerHealth - DEMON_BOSS_DAMAGE);
        this.player.sprite.setTint(0xff8a8a);
        this.time.delayedCall(180, () => {
            this.player.sprite.clearTint();
        });

        if (this.playerHealth <= 0) {
            this.handlePlayerDefeatByBoss();
        }
    }

    private getActiveBossAnnouncementName(): string {
        switch (this.activeBossType) {
            case 'flying-demons':
                return 'Fire demons';
            case 'nightborne':
                return 'NightBorne';
            default:
                return 'Demon';
        }
    }

    private handlePlayerDefeatByBoss(): void {
        this.showTemporaryCenterMessage('Defeat!', 2200);
        this.playerHealth = DEMON_PLAYER_MAX_HP;
        this.playerInvulnerableUntil = this.time.now + 800;
        this.despawnBoss();
        this.player.sprite.setPosition(this.bossSpawnPoint.x - 132, this.bossSpawnPoint.y + 64);
        this.player.idle();
        this.refreshBossStatusText();
    }

    private defeatBoss(): void {
        this.bossAlive = false;
        this.showTemporaryCenterMessage(`${this.getActiveBossAnnouncementName()} defeated!`, 2200);
        this.bossAttackTimer?.remove(false);
        this.bossAttackTimer = null;
        this.stopBossMovement();
        this.playBossAnimation('death', true);
        this.time.delayedCall(1800, () => {
            if (this.bossSprite?.active) {
                this.despawnBoss();
                this.refreshBossStatusText();
            }
        });
    }

    private showTemporaryCenterMessage(message: string, durationMs = 1800): void {
        if (!this.centerStatusText) {
            return;
        }

        this.centerStatusMessageTimer?.remove(false);
        this.centerStatusText.setVisible(true).setText(message);

        this.centerStatusMessageTimer = this.time.delayedCall(durationMs, () => {
            this.centerStatusMessageTimer = null;
            this.centerStatusText.setVisible(false).setText('');
        });
    }

    private refreshBossStatusText(): void {
        if (!this.bossStatusText) {
            return;
        }

        const activeBossSprites = this.getActiveBossSprites();
        if (activeBossSprites.length === 0) {
            this.bossStatusText.setVisible(false).setText('');
            this.bossHealthBarBacking.setVisible(false);
            this.bossHealthBarFill.setVisible(false);
            return;
        }

        this.bossHealthBarBacking.setVisible(false);
        this.bossHealthBarFill.setVisible(false);

        const bossStatusLabel =
            this.activeBossType === 'flying-demons'
                ? `Flying Demons HP ${this.getActiveFlyingDemonBosses()
                      .map((state) => state.hp)
                      .join(' + ')}`
                : `${this.activeBossType === 'nightborne' ? 'NightBorne' : 'Demon'} HP ${this.bossHealth}/${DEMON_BOSS_MAX_HP}`;
        const shotsLine =
            this.playerProjectileCharges > 0
                ? `\nShots ${this.playerProjectileCharges}/${this.playerProjectileMaxCharges}`
                : '';

        this.bossStatusText.setVisible(true).setText(
            `${bossStatusLabel}\nYou HP ${this.playerHealth}/${DEMON_PLAYER_MAX_HP}${shotsLine}\nA = melee   S = ranged`,
        );
    }

    private updateCharacterDepths(): void {
        this.player.sprite.setDepth(this.player.sprite.y + 60);
        this.npcs.forEach((npc) => {
            npc.sprite.setDepth(npc.sprite.y + 60);
        });
        this.getActiveBossSprites().forEach((bossSprite) => {
            bossSprite.setDepth(bossSprite.y + 80);
        });
        if (this.bedSprite?.scene) {
            this.bedSprite.setDepth(this.bedSprite.y + 20);
        }
        if (this.sleepHeadSprite?.visible) {
            this.sleepHeadSprite.setDepth(this.sleepHeadSprite.y + 8);
        }
    }

    private enterBed(target: { point: { x: number; y: number }; bounds: Phaser.Geom.Rectangle }): void {
        this.isSleepingInBed = true;
        this.activeSleepPoint = { x: target.point.x, y: target.point.y };
        this.activeSleepBounds = new Phaser.Geom.Rectangle(
            target.bounds.x,
            target.bounds.y,
            target.bounds.width,
            target.bounds.height,
        );
        this.player.sprite.setVisible(false);
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
        body?.setEnable(false);
        this.sleepHeadSprite
            .setPosition(target.point.x, target.point.y)
            .setTexture(this.playerTexture)
            .setVisible(true);
        this.sleepHeadSprite.anims.play(this.getSleepAnimationKey(), true);
    }

    private exitBed(): void {
        this.isSleepingInBed = false;
        this.activeSleepBounds = null;
        this.sleepHeadSprite.anims.stop();
        this.sleepHeadSprite.setVisible(false);
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
        body?.setEnable(true);
        this.player.sprite.setVisible(true);
        const exitX =
            this.activeSleepPoint?.x ??
            this.player.sprite.x;
        const exitY =
            this.activeSleepPoint?.y ??
            this.player.sprite.y;
        this.player.sprite.setPosition(exitX + 42, exitY + 36);
        this.activeSleepPoint = null;
        this.player.idle();
    }

    private enterReading(): void {
        this.isReading = true;
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
        body?.setVelocity(0, 0);
        this.player.sprite.setPosition(BOOKS_POSITION.x + 28, BOOKS_POSITION.y - 10);
        this.player.sprite.setTexture(this.playerTexture);
        this.player.sprite.anims.play(this.getReadingAnimationKey(), true);
    }

    private exitReading(): void {
        this.isReading = false;
        this.player.sprite.anims.stop();
        this.player.idle();
    }

    private enterSitting(seat: SeatInteraction): void {
        this.isSitting = true;
        this.activeSeat = seat;
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
        body?.setVelocity(0, 0);
        this.player.sprite.setPosition(seat.sitPosition.x, seat.sitPosition.y);
        this.player.sit(seat.facing);
    }

    private exitSitting(): void {
        const seat = this.activeSeat;

        this.isSitting = false;
        this.activeSeat = null;
        this.player.sprite.anims.stop();

        if (seat) {
            this.player.sprite.setPosition(
                seat.sitPosition.x + seat.exitOffset.x,
                seat.sitPosition.y + seat.exitOffset.y,
            );
        }

        this.player.idle();
    }

    private getReadingAnimationKey(): string {
        const key = `${this.playerTexture}-read`;

        if (!this.anims.exists(key)) {
            this.anims.create({
                key,
                frames: this.anims.generateFrameNumbers(this.playerTexture, {
                    frames: READING_FRAMES,
                }),
                frameRate: 8,
                repeat: -1,
            });
        }

        return key;
    }

    private getSleepAnimationKey(): string {
        const key = `${this.playerTexture}-sleep-head`;

        if (!this.anims.exists(key)) {
            this.anims.create({
                key,
                frames: this.anims.generateFrameNumbers(this.playerTexture, {
                    frames: SLEEP_HEAD_FRAMES,
                }),
                frameRate: 6,
                repeat: -1,
            });
        }

        return key;
    }

    private getNearestSleepTarget(playerX: number, playerY: number): {
        point: { x: number; y: number };
        bounds: Phaser.Geom.Rectangle;
        distance: number;
    } | null {
        const candidates = this.editableTargets.flatMap((target) =>
            (target.getPoints?.() ?? [])
                .filter((point) => point.label === 'sleep')
                .map((point) => ({
                    point,
                    bounds: target.getBounds(),
                    distance: Phaser.Math.Distance.Between(playerX, playerY, point.x, point.y),
                })),
        );

        if (candidates.length === 0) {
            return null;
        }

        candidates.sort((a, b) => a.distance - b.distance);
        return candidates[0];
    }

    private startConversation(npc: Character): void {
        const agent = npc.getDialogueAgent();

        if (!agent) {
            return;
        }

        this.activeConversationId += 1;
        this.isInteracting = true;
        this.activeNpc = npc;
        this.activeAgent = agent;
        this.isAwaitingInput = false;
        this.isWaitingForResponse = false;
        this.playerInput = '';
        this.threadMessages = [];
        this.updateNpcReasoningDisplay(null);
        this.inputPrefix = `${this.playerName}: `;
        this.attachDebugListener(agent);

        npc.faceTowards(this.player.sprite);
        npc.idle();
        this.player.faceTowards(npc.sprite);
        this.player.idle();

        this.npcDisplayName = agent.getDisplayName();
        this.debugPanel.setActiveNpc(this.npcDisplayName);

        const partnerId = this.playerConversationId;
        let items = agent.getItems(partnerId);

        if (items.length === 0) {
            const initialMessage =
                agent.getInitialMessage() || 'Hey there! What are you working on today?';

            if (initialMessage) {
                agent.recordMessage(partnerId, 'assistant', initialMessage);
            }

            items = agent.getItems(partnerId);
        }

        items.slice(-2).forEach((item) => {
            const speaker = item.role === 'assistant' ? 'npc' : 'player';
            const prefix = speaker === 'npc' ? this.npcDisplayName : this.inputPrefix;
            this.appendThreadMessage(speaker, item.content, prefix);
        });

        this.prepareForPlayerInput();
    }

    private endConversation(clearThread: boolean): void {
        this.detachDebugListenerIfNeeded();
        this.isInteracting = false;
        this.isAwaitingInput = false;
        this.isWaitingForResponse = false;
        this.playerInput = '';
        this.inputPrefix = `${this.playerName}: `;
        this.updateNpcReasoningDisplay(null);
        this.debugPanel.setActiveNpc(null);

        if (clearThread) {
            this.threadMessages = [];
            this.refreshThreadDisplay();
            this.npcDialogue.setVisible(false);
            this.playerInputText.setVisible(false);
            return;
        }

        this.refreshThreadDisplay();
    }

    private cancelConversation(clearThread: boolean): void {
        this.activeConversationId += 1;
        this.endConversation(clearThread);
        this.activeNpc = null;
        this.activeAgent = undefined;
        this.npcDisplayName = 'NPC';
        this.interactionPrompt.setVisible(false);
    }

    private appendThreadMessage(
        speaker: 'npc' | 'player',
        text: string,
        prefix?: string,
        options?: { skipTrim?: boolean },
    ): void {
        const cleaned = options?.skipTrim ? text : text.trim();

        if (!cleaned) {
            return;
        }

        this.threadMessages.push({ speaker, text: cleaned, prefix });

        if (this.threadMessages.length > 2) {
            this.threadMessages.splice(0, this.threadMessages.length - 2);
        }

        this.refreshThreadDisplay();
    }

    private updateLatestNpcMessage(text: string, options?: { skipTrim?: boolean }): void {
        const cleaned = options?.skipTrim ? text : text.trim();

        if (!cleaned) {
            return;
        }

        const last = this.threadMessages[this.threadMessages.length - 1];

        if (last && last.speaker === 'npc') {
            last.text = cleaned;
            this.refreshThreadDisplay();
            return;
        }

        this.appendThreadMessage('npc', cleaned, this.npcDisplayName, { skipTrim: true });
    }

    private updateNpcReasoningDisplay(content: string | null): void {
        const trimmed = content?.trim();

        if (!trimmed) {
            if (!this.currentReasoningText) {
                return;
            }

            this.currentReasoningText = '';
            this.npcReasoningText.setVisible(false).setText('');
            this.layoutDialogueTexts();
            return;
        }

        if (trimmed === this.currentReasoningText) {
            return;
        }

        this.currentReasoningText = trimmed;
        this.npcReasoningText.setText(`${this.npcDisplayName} (thinking): ${trimmed}`);
        this.npcReasoningText.setVisible(true);
        this.layoutDialogueTexts();
    }

    private refreshThreadDisplay(typingText?: string): void {
        const recent = this.threadMessages.slice(-2);

        if (typingText !== undefined) {
            const latest = recent[recent.length - 1];

            if (latest) {
                const color = latest.speaker === 'player' ? '#9cf7bf' : '#ffffff';
                this.npcDialogue
                    .setText(this.formatThreadEntry(latest))
                    .setColor(color)
                    .setVisible(true);
            } else {
                this.npcDialogue.setVisible(false);
            }

            this.playerInputText
                .setText(typingText || this.inputPrefix)
                .setColor('#9cf7bf')
                .setVisible(true);
            this.layoutDialogueTexts();
            return;
        }

        if (recent.length === 0) {
            this.npcDialogue.setVisible(false);
            this.playerInputText.setVisible(false);
            return;
        }

        if (recent.length === 1) {
            const entry = recent[0];
            const color = entry.speaker === 'player' ? '#9cf7bf' : '#ffffff';

            this.npcDialogue.setVisible(false);
            this.playerInputText
                .setText(this.formatThreadEntry(entry))
                .setColor(color)
                .setVisible(true);
            this.layoutDialogueTexts();
            return;
        }

        const [older, latest] = recent;

        this.npcDialogue
            .setText(this.formatThreadEntry(older))
            .setColor(older.speaker === 'player' ? '#9cf7bf' : '#ffffff')
            .setVisible(true);

        this.playerInputText
            .setText(this.formatThreadEntry(latest))
            .setColor(latest.speaker === 'player' ? '#9cf7bf' : '#ffffff')
            .setVisible(true);

        this.layoutDialogueTexts();
    }

    private formatThreadEntry(entry: ThreadMessage): string {
        if (entry.speaker === 'npc') {
            const name = entry.prefix ?? this.npcDisplayName;
            return `${name}: ${entry.text}`;
        }

        return `${entry.prefix ?? this.inputPrefix}${entry.text}`;
    }

    private layoutDialogueTexts(): void {
        const marginBottom = 24;
        const spacing = 12;
        const anchorX = 24;
        const cameraHeight = this.cameras.main.height;
        let nextBottom = cameraHeight - marginBottom;

        [this.playerInputText, this.npcDialogue, this.npcReasoningText].forEach((text) => {
            if (!text.visible) {
                return;
            }

            text.setOrigin(0, 1).setPosition(anchorX, nextBottom);
            nextBottom = Math.max(text.getBounds().top - spacing, marginBottom);
        });
    }

    private attachDebugListener(agent: DialogueAgent): void {
        this.detachDebugListenerIfNeeded();
        const conversationId = this.activeConversationId;
        const npcName = agent.getDisplayName();

        this.detachDebugListener = agent.addDebugEventListener((event) => {
            if (conversationId !== this.activeConversationId) {
                return;
            }

            this.debugPanel.appendEvent(npcName, event);
        });
    }

    private detachDebugListenerIfNeeded(): void {
        if (this.detachDebugListener) {
            this.detachDebugListener();
            this.detachDebugListener = undefined;
        }
    }

    private prepareForPlayerInput(): void {
        this.updateNpcReasoningDisplay(null);
        this.playerInput = '';
        this.isAwaitingInput = true;
        this.refreshThreadDisplay(this.inputPrefix);
    }

    private handleTyping(event: KeyboardEvent): void {
        if (this.isEditMode || !this.isAwaitingInput || !this.activeNpc || !this.activeAgent) {
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            this.playerInput = this.playerInput.slice(0, -1);
        } else if (event.key === 'Enter') {
            event.preventDefault();

            const trimmed = this.playerInput.trim();

            if (!trimmed) {
                return;
            }

            this.appendThreadMessage('player', trimmed, this.inputPrefix);
            this.activeAgent.recordMessage(this.playerConversationId, 'user', trimmed);
            this.playerInput = '';
            this.isAwaitingInput = false;
            this.refreshThreadDisplay();

            if (this.tryHandleScriptedNpcHelp(trimmed)) {
                return;
            }

            this.requestNpcResponse(this.playerConversationId, trimmed);
            return;
        } else if (event.key.length === 1) {
            if (this.playerInput.length >= 240) {
                return;
            }

            this.playerInput += event.key;
        }

        this.refreshThreadDisplay(`${this.inputPrefix}${this.playerInput}`);
    }

    private tryHandleScriptedNpcHelp(playerMessage: string): boolean {
        if (
            !this.activeNpc ||
            !this.activeAgent ||
            !this.bossAlive ||
            !/\bhelp\b/i.test(playerMessage)
        ) {
            return false;
        }

        const npcName = this.activeAgent.getDisplayName().trim().toLowerCase();

        if (this.activeBossType === 'demon' && npcName === 'colon') {
            if (this.pizzaHelpUsed) {
                this.handleNpcResponse('Use the leftovers I gave you!');
                return true;
            }

            this.pizzaHelpUsed = true;
            this.grantPizzaProjectiles();
            this.handleNpcResponse('Here, kiddo - throw some leftovers at it!');
            return true;
        }

        if (this.activeBossType === 'demon') {
            this.handleNpcResponse("I'm busy with homework right now.");
            return true;
        }

        if (this.activeBossType !== 'flying-demons') {
            return false;
        }

        if (npcName === 'colon') {
            if (this.witchHelpUsed) {
                this.handleNpcResponse("She's already on it. Watch the sky.");
                return true;
            }

            this.witchHelpUsed = true;
            this.playNpcPhoneCallAnimation(this.activeNpc);
            this.scheduleGoodWitchArrival();
            this.handleNpcResponse("Hang on. I'm calling my friend the witch.");
            return true;
        }

        this.handleNpcResponse("I'm busy with homework right now.");
        return true;
    }

    private requestNpcResponse(partnerId: string, playerMessage: string): void {
        const agent = this.activeAgent;

        if (!agent || !this.activeNpc) {
            this.handleNpcResponse("I'll get back to you in a second.");
            return;
        }

        this.isWaitingForResponse = true;
        const conversationId = this.activeConversationId;
        const stream = agent.streamResponse(partnerId, playerMessage);

        this.consumeNpcStream(stream, conversationId).catch((error) => {
            console.error('Failed to process response stream', error);

            if (conversationId !== this.activeConversationId) {
                return;
            }

            this.handleNpcResponse("Sorry, I'm having trouble responding right now.");
        });
    }

    private async consumeNpcStream(
        stream: AsyncIterable<DialogueStreamChunk>,
        conversationId: number,
    ): Promise<void> {
        let hasTextChunk = false;
        let aggregate = '';
        let reasoningAggregate = '';

        for await (const chunk of stream) {
            if (conversationId !== this.activeConversationId) {
                this.updateNpcReasoningDisplay(null);
                return;
            }

            if (!chunk) {
                continue;
            }

            if (chunk.type === 'reasoning') {
                reasoningAggregate += chunk.text ?? '';
                this.updateNpcReasoningDisplay(reasoningAggregate);
                continue;
            }

            if (chunk.type !== 'text') {
                continue;
            }

            const text = chunk.text ?? '';

            if (!text) {
                continue;
            }

            aggregate += text;

            if (!hasTextChunk) {
                this.appendThreadMessage('npc', aggregate, this.npcDisplayName, { skipTrim: true });
                hasTextChunk = true;
            } else {
                this.updateLatestNpcMessage(aggregate, { skipTrim: true });
            }
        }

        this.updateNpcReasoningDisplay(null);

        if (conversationId !== this.activeConversationId) {
            return;
        }

        const response = aggregate.trim() || 'Thanks for the update!';

        if (!hasTextChunk) {
            this.appendThreadMessage('npc', response, this.npcDisplayName);
        } else {
            this.updateLatestNpcMessage(response, { skipTrim: true });
        }

        this.isWaitingForResponse = false;
        this.prepareForPlayerInput();
    }

    private handleNpcResponse(rawResponse: string): void {
        const response = rawResponse.trim() || 'Thanks for the update!';

        this.updateNpcReasoningDisplay(null);
        this.appendThreadMessage('npc', response, this.npcDisplayName);
        this.activeAgent?.recordMessage(this.playerConversationId, 'assistant', response);
        this.isWaitingForResponse = false;
        this.prepareForPlayerInput();
    }
}

import { OpenAIDialogueAgent } from '../dialogue/OpenAIAgent';

type Direction = 'up' | 'down' | 'left' | 'right';

export type HouseholdCharacterId = 'lillo' | 'toddy' | 'colon';

export interface HouseholdCharacterDefinition {
    id: HouseholdCharacterId;
    name: string;
    role: string;
    description: string;
    texture: 'wendy' | 'steve' | 'sam';
    previewFrame: number;
    position: { x: number; y: number };
    initialDirection: Direction;
    dialogueAgent: OpenAIDialogueAgent;
}

const HOUSE_DIALOGUE_RULES = `
You are roleplaying as a resident in a tiny top-down house game.
Stay in character, be warm and playful, and keep replies to 1-3 short sentences.
All characters are family members. There's no need to introduce yourself.
Do not break character.
Colon is the father of Toddy and Lillo.
Toddy and Lillo are brother and sister.
`;

const buildHouseAgent = ({
    name,
    role,
    initialMessage,
    personality,
    roomContext,
}: {
    name: string;
    role: string;
    initialMessage: string;
    personality: string;
    roomContext: string;
}) =>
    new OpenAIDialogueAgent({
        name,
        initialMessage,
        request_options: {
            model: 'gpt-5.4-mini',
            instructions: `
${HOUSE_DIALOGUE_RULES}

Character:
- Name: ${name}
- Role: ${role}
- Personality: ${personality}
- Home spot: ${roomContext}
            `.trim(),
            reasoning: {
                effort: 'low',
                summary: 'auto',
            },
        },
    });

const lilloAgent = buildHouseAgent({
    name: 'Lillo',
    role: 'Curious little girl. Daughter of Colon; sister of Toddy.',
    initialMessage: "Sup?",
    personality:
        'You are imaginative, curious, very silly, and excited about stories and toys. You love to draw. You love Minecraft. You are the sister of Toddy.',
    roomContext: '',
});

const toddyAgent = buildHouseAgent({
    name: 'Toddy',
    role: 'Shy but clever and sweet little boy. Son of Colol; brother of Lillo.',
    initialMessage: "Want to play Minecraft?",
    personality:
        'You are shy, sweet, smart, and you love video games. You are obsessed with Minecraft and know everything about it. You love reading, especially Captain Underpants. You also love legos. You read to Lillo and help her with homework. You are the brother of Lillo.',
    roomContext: '',
});

const colonAgent = buildHouseAgent({
    name: 'Colon',
    role: 'Adult man; father of Toddy and Lillo.',
    initialMessage: "Look at that! Who wants snuggles?",
    personality:
        'You are steady, kind, dependable, and a little dryly funny. You give grounded advice and keep everyone fed. You are a physician, specifically, you practice occupational medicine. You love video games and you are a die hard fan of the NFL team, the Vikings. You love to give snuggles. You fart a lot. You are the dad of Toddy and Lillo.',
    roomContext: '',
});

export const householdCharacters: HouseholdCharacterDefinition[] = [
    {
        id: 'colon',
        name: 'Colon',
        role: 'Adult man',
        description: 'Look at that!',
        texture: 'sam',
        previewFrame: 74,
        position: { x: 1100, y: 155 },
        initialDirection: 'left',
        dialogueAgent: colonAgent,
    },
    {
        id: 'toddy',
        name: 'Toddy',
        role: 'Little boy',
        description: 'Wanna play Minecraft?',
        texture: 'steve',
        previewFrame: 74,
        position: { x: 636, y: 206 },
        initialDirection: 'left',
        dialogueAgent: toddyAgent,
    },
    {
        id: 'lillo',
        name: 'Lillo',
        role: 'Little girl',
        description: 'Sup?',
        texture: 'wendy',
        previewFrame: 74,
        position: { x: 804, y: 728 },
        initialDirection: 'right',
        dialogueAgent: lilloAgent,
    },
];

export const defaultCharacterId: HouseholdCharacterId = 'lillo';

export const householdCharacterMap = new Map(
    householdCharacters.map((character) => [character.id, character] as const),
);

export const getHouseholdCharacter = (
    id: HouseholdCharacterId,
): HouseholdCharacterDefinition => {
    return householdCharacterMap.get(id) ?? householdCharacters[0];
};

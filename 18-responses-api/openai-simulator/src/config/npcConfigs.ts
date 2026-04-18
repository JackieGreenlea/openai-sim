import type { CharacterConfig } from '../gameobjects/Character';
import {
    getHouseholdCharacter,
    householdCharacters,
    type HouseholdCharacterDefinition,
    type HouseholdCharacterId,
} from './characters';

export type NpcConfig = Omit<
    CharacterConfig,
    'scene' | 'colliders' | 'frameConfig' | 'npc' | 'sprite'
>;

export const getPlayerCharacter = (
    selectedCharacterId: HouseholdCharacterId,
): HouseholdCharacterDefinition => {
    return getHouseholdCharacter(selectedCharacterId);
};

export const buildNpcConfigs = (selectedCharacterId: HouseholdCharacterId): NpcConfig[] => {
    return householdCharacters
        .filter((character) => character.id !== selectedCharacterId)
        .map((character) => ({
            texture: character.texture,
            position: character.position,
            initialDirection: character.initialDirection,
            speed: 0,
            dialogueAgent: character.dialogueAgent,
        }));
};

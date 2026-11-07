import { nanoid } from 'nanoid';
import type { Id } from './types';

export type MakeId = () => Id;

export const makeId: MakeId = () => nanoid(12);

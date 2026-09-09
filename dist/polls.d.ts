import type { Poll, Room } from "./types.js";
export declare const MAX_POLLS = 10;
export declare function createPoll(room: Room, userId: string, username: string, question: string, optionTexts: string[]): Poll | {
    error: string;
};
export declare function votePoll(room: Room, pollId: string, userId: string, option: number): Poll | {
    error: string;
};
//# sourceMappingURL=polls.d.ts.map
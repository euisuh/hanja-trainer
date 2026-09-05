export function avatarHue(profileId: number): string { return `${(profileId * 67) % 360}deg`; }

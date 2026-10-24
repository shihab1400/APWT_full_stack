/** Short, human-friendly reference shown to the sender and the admin. */
export const referenceOf = (id: string) => `ME-${id.slice(0, 8).toUpperCase()}`;

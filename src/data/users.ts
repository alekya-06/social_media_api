export interface User {
  id: number;
  username: string;
  email: string;
  password: string; // will hash later
}

// Temporary storage (we'll replace with database later)
export const users: User[] = [];
export let nextUserId = 1;
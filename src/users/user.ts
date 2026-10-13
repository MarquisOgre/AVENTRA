import { z } from "zod";

export const userRoleSchema = z.enum(["user", "admin"]);
export const userStatusSchema = z.enum(["pending", "active", "suspended"]);

export const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  role: userRoleSchema.default("user"),
  status: userStatusSchema.default("pending"),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

export interface TelegramIdentity {
  telegramUserId: string;
  userId: string;
  username: string | null;
  linkedAt: Date;
}

/** Authorization must check both role and account status at request time. */
export function canUseTradingFeatures(user: Pick<User, "role" | "status">): boolean {
  return user.status === "active" && (user.role === "user" || user.role === "admin");
}

export function canAdminister(user: Pick<User, "role" | "status">): boolean {
  return user.status === "active" && user.role === "admin";
}
